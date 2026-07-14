import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuditAction, monitorSchema } from "@pulseops/shared";
import { AuthGuard } from "./auth";
import { AuditService } from "./audit";
import { MonitoringEngine } from "./monitoring-engine";
import { PrismaService } from "./prisma.service";
import { requireUser, type RequestWithUser } from "./types";

@ApiTags("monitors")
@Controller("monitors")
@UseGuards(AuthGuard)
export class MonitorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: MonitoringEngine
  ) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.monitor.findMany({
      where: {
        organizationId: user.organizationId
      },
      include: {
        service: true,
        checkResults: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: unknown) {
    const user = requireUser(request);
    const input = monitorSchema.parse(body);

    await this.prisma.service.findFirstOrThrow({
      where: {
        id: input.serviceId,
        organizationId: user.organizationId
      }
    });

    const monitor = await this.prisma.monitor.create({
      data: {
        organizationId: user.organizationId,
        ...input
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.MonitorCreated,
      entityType: "monitor",
      entityId: monitor.id,
      metadata: {
        serviceId: monitor.serviceId,
        targetUrl: monitor.targetUrl
      }
    });

    return monitor;
  }

  @Post(":id/run")
  async run(@Req() request: RequestWithUser, @Param("id") id: string) {
    const user = requireUser(request);

    await this.prisma.monitor.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      }
    });

    return this.engine.runMonitorCheck(id);
  }
}
