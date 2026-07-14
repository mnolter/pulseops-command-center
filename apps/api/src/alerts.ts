import {
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  alertRuleSchema,
  AuditAction,
  IncidentSeverity,
  severityRank
} from "@pulseops/shared";
import { AuthGuard } from "./auth";
import { AuditService } from "./audit";
import { PrismaService } from "./prisma.service";
import { RealtimeGateway } from "./realtime.gateway";
import { requireUser, type RequestWithUser } from "./types";

type IncidentForAlert = {
  id: string;
  organizationId: string;
  title: string;
  summary: string;
  severity: string;
};

@Injectable()
export class AlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway
  ) {}

  async notifyIncident(incident: IncidentForAlert) {
    const rules = await this.prisma.alertRule.findMany({
      where: {
        organizationId: incident.organizationId,
        isEnabled: true
      }
    });

    const incidentRank = severityRank(incident.severity as IncidentSeverity);
    const matchingRules = rules.filter(
      (rule) => severityRank(rule.severity as IncidentSeverity) <= incidentRank
    );

    const logs = await Promise.all(
      matchingRules.map((rule) =>
        this.prisma.notificationLog.create({
          data: {
            organizationId: incident.organizationId,
            incidentId: incident.id,
            channelType: rule.channelType,
            target:
              rule.channelType === "slack"
                ? "#incident-command"
                : rule.channelType === "email"
                  ? "oncall@pulseops.dev"
                  : "https://hooks.example.dev/pulseops",
            status: "simulated",
            payload: {
              rule: rule.name,
              title: incident.title,
              summary: incident.summary,
              severity: incident.severity
            }
          }
        })
      )
    );

    for (const log of logs) {
      this.realtime.emitToOrganization(incident.organizationId, "alert.sent", log);
    }

    return logs;
  }
}

@ApiTags("alert-rules")
@Controller("alert-rules")
@UseGuards(AuthGuard)
export class AlertRulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.alertRule.findMany({
      where: {
        organizationId: user.organizationId
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: unknown) {
    const user = requireUser(request);
    const input = alertRuleSchema.parse(body);

    const rule = await this.prisma.alertRule.create({
      data: {
        organizationId: user.organizationId,
        ...input
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.AlertSent,
      entityType: "alert_rule",
      entityId: rule.id,
      metadata: {
        name: rule.name,
        channelType: rule.channelType
      }
    });

    return rule;
  }
}

@ApiTags("notifications")
@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("logs")
  async logs(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.notificationLog.findMany({
      where: {
        organizationId: user.organizationId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    });
  }
}
