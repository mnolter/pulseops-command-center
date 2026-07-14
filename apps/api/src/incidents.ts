import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  AuditAction,
  canTransitionIncident,
  incidentEventSchema,
  IncidentStatus,
  incidentSchema
} from "@pulseops/shared";
import { z } from "zod";
import { AuthGuard } from "./auth";
import { AlertService } from "./alerts";
import { AuditService } from "./audit";
import { MonitoringEngine } from "./monitoring-engine";
import { PrismaService } from "./prisma.service";
import { RealtimeGateway } from "./realtime.gateway";
import { requireUser, type RequestWithUser } from "./types";

const updateIncidentSchema = z.object({
  status: z
    .enum([
      IncidentStatus.Open,
      IncidentStatus.Acknowledged,
      IncidentStatus.Resolved
    ])
    .optional(),
  severity: incidentSchema.shape.severity.optional(),
  assigneeId: z.string().nullable().optional(),
  postmortem: z.string().max(4000).nullable().optional(),
  summary: z.string().min(8).max(500).optional()
});

@ApiTags("incidents")
@Controller("incidents")
@UseGuards(AuthGuard)
export class IncidentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: AlertService,
    private readonly realtime: RealtimeGateway,
    private readonly monitoring: MonitoringEngine
  ) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.incident.findMany({
      where: {
        organizationId: user.organizationId
      },
      include: {
        service: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        events: {
          orderBy: {
            createdAt: "asc"
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            }
          }
        }
      },
      orderBy: {
        openedAt: "desc"
      },
      take: 100
    });
  }

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: unknown) {
    const user = requireUser(request);
    const input = incidentSchema.parse(body);

    await this.prisma.service.findFirstOrThrow({
      where: {
        id: input.serviceId,
        organizationId: user.organizationId
      }
    });

    const incident = await this.prisma.incident.create({
      data: {
        organizationId: user.organizationId,
        ...input,
        status: IncidentStatus.Open,
        events: {
          create: {
            authorId: user.userId,
            kind: "note",
            message: "Incident opened manually from the command center."
          }
        }
      },
      include: {
        service: true,
        events: true
      }
    });

    await this.alerts.notifyIncident(incident);
    await this.monitoring.refreshServiceStatus(input.serviceId, user.organizationId);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.IncidentCreated,
      entityType: "incident",
      entityId: incident.id,
      metadata: {
        severity: incident.severity,
        serviceId: incident.serviceId
      }
    });

    this.realtime.emitToOrganization(user.organizationId, "incident.created", {
      incident
    });

    return incident;
  }

  @Patch(":id")
  async update(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = requireUser(request);
    const input = updateIncidentSchema.parse(body);

    const existing = await this.prisma.incident.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      }
    });

    if (
      input.status &&
      !canTransitionIncident(existing.status as IncidentStatus, input.status)
    ) {
      throw new Error(`Cannot transition incident from ${existing.status} to ${input.status}.`);
    }

    const incident = await this.prisma.incident.update({
      where: {
        id
      },
      data: {
        ...input,
        resolvedAt:
          input.status === IncidentStatus.Resolved
            ? new Date()
            : input.status === IncidentStatus.Open
              ? null
              : undefined,
        events: input.status
          ? {
              create: {
                authorId: user.userId,
                kind: "status_change",
                message: `Incident moved to ${input.status}.`
              }
            }
          : undefined
      },
      include: {
        service: true,
        assignee: true,
        events: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    await this.monitoring.refreshServiceStatus(
      incident.serviceId,
      user.organizationId
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.IncidentUpdated,
      entityType: "incident",
      entityId: incident.id,
      metadata: input
    });

    this.realtime.emitToOrganization(user.organizationId, "incident.updated", {
      incident
    });

    return incident;
  }

  @Post(":id/events")
  async addEvent(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = requireUser(request);
    const input = incidentEventSchema.parse(body);

    const incident = await this.prisma.incident.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      }
    });

    const event = await this.prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        authorId: user.userId,
        ...input
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    this.realtime.emitToOrganization(user.organizationId, "incident.updated", {
      incidentId: id,
      event
    });

    return event;
  }
}
