import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IncidentStatus, ServiceStatus } from "@pulseops/shared";
import {
  calculateAverageLatency,
  calculateUptime
} from "./domain/monitoring";
import { AuthGuard } from "./auth";
import { PrismaService } from "./prisma.service";
import { requireUser, type RequestWithUser } from "./types";

@ApiTags("dashboard")
@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async overview(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    const [services, monitorCount, incidents, recentChecks] = await Promise.all([
      this.prisma.service.findMany({
        where: {
          organizationId: user.organizationId
        },
        include: {
          monitors: {
            include: {
              checkResults: {
                orderBy: {
                  createdAt: "desc"
                },
                take: 1
              }
            }
          },
          incidents: {
            where: {
              status: {
                in: [IncidentStatus.Open, IncidentStatus.Acknowledged]
              }
            }
          }
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.prisma.monitor.count({
        where: {
          organizationId: user.organizationId,
          isActive: true
        }
      }),
      this.prisma.incident.findMany({
        where: {
          organizationId: user.organizationId
        },
        include: {
          service: true,
          assignee: {
            select: {
              name: true,
              avatarUrl: true
            }
          }
        },
        orderBy: {
          openedAt: "desc"
        },
        take: 12
      }),
      this.prisma.checkResult.findMany({
        where: {
          monitor: {
            organizationId: user.organizationId
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 500
      })
    ]);

    const openIncidents = incidents.filter(
      (incident) => incident.status !== IncidentStatus.Resolved
    );

    const latestChecks = services.flatMap((service) =>
      service.monitors.flatMap((monitor) =>
        monitor.checkResults[0] ? [monitor.checkResults[0]] : []
      )
    );

    const servicesByStatus = {
      [ServiceStatus.Operational]: services.filter(
        (service) => service.status === ServiceStatus.Operational
      ).length,
      [ServiceStatus.Degraded]: services.filter(
        (service) => service.status === ServiceStatus.Degraded
      ).length,
      [ServiceStatus.MajorOutage]: services.filter(
        (service) => service.status === ServiceStatus.MajorOutage
      ).length,
      [ServiceStatus.Maintenance]: services.filter(
        (service) => service.status === ServiceStatus.Maintenance
      ).length
    };

    const sortedChecks = [...recentChecks].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );

    const latencySeries = sortedChecks.slice(-80).map((check) => ({
      time: check.createdAt.toISOString(),
      latencyMs: check.latencyMs,
      ok: check.ok
    }));

    return {
      organization: {
        id: user.organizationId,
        name: user.organizationName
      },
      summary: {
        serviceCount: services.length,
        monitorCount,
        openIncidentCount: openIncidents.length,
        uptime: calculateUptime(recentChecks),
        averageLatencyMs: calculateAverageLatency(recentChecks),
        failingMonitorCount: latestChecks.filter((check) => !check.ok).length
      },
      servicesByStatus,
      latencySeries,
      services,
      incidents
    };
  }
}
