import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  AuditAction,
  IncidentSeverity,
  IncidentStatus,
  MonitorType
} from "@pulseops/shared";
import { AlertService } from "./alerts";
import { AuditService } from "./audit";
import { deriveStatusFromHealth } from "./domain/monitoring";
import { PrismaService } from "./prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

type ProbeResult = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
};

@Injectable()
export class MonitoringEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly alerts: AlertService,
    private readonly audit: AuditService
  ) {}

  async runMonitorCheck(monitorId: string) {
    const monitor = await this.prisma.monitor.findUnique({
      where: {
        id: monitorId
      },
      include: {
        service: true
      }
    });

    if (!monitor || !monitor.isActive) {
      return null;
    }

    const result = await this.probe({
      targetUrl: monitor.targetUrl,
      method: monitor.method,
      expectedStatus: monitor.expectedStatus,
      timeoutMs: monitor.timeoutMs,
      type: monitor.type
    });

    const check = await this.prisma.checkResult.create({
      data: {
        monitorId: monitor.id,
        ok: result.ok,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        error: result.error
      }
    });

    await this.audit.record({
      organizationId: monitor.organizationId,
      action: AuditAction.CheckCompleted,
      entityType: "monitor",
      entityId: monitor.id,
      metadata: {
        ok: check.ok,
        latencyMs: check.latencyMs,
        serviceId: monitor.serviceId
      }
    });

    this.realtime.emitToOrganization(
      monitor.organizationId,
      "monitor.check.completed",
      {
        monitorId: monitor.id,
        serviceId: monitor.serviceId,
        check
      }
    );

    if (!result.ok) {
      await this.ensureIncidentForFailure(monitor.id);
    }

    await this.refreshServiceStatus(monitor.serviceId, monitor.organizationId);

    this.realtime.emitToOrganization(monitor.organizationId, "dashboard.updated", {
      type: "check",
      serviceId: monitor.serviceId,
      monitorId: monitor.id,
      ok: result.ok
    });

    return check;
  }

  async refreshServiceStatus(serviceId: string, organizationId: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        organizationId
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
      }
    });

    if (!service) {
      return null;
    }

    const latestChecks = service.monitors.flatMap((monitor) =>
      monitor.checkResults[0] ? [monitor.checkResults[0]] : []
    );

    const status = deriveStatusFromHealth({
      latestChecks,
      activeIncidents: service.incidents
    });

    return this.prisma.service.update({
      where: {
        id: service.id
      },
      data: {
        status
      }
    });
  }

  private async ensureIncidentForFailure(monitorId: string) {
    const monitor = await this.prisma.monitor.findUnique({
      where: {
        id: monitorId
      },
      include: {
        service: true
      }
    });

    if (!monitor) {
      return null;
    }

    const existing = await this.prisma.incident.findFirst({
      where: {
        organizationId: monitor.organizationId,
        serviceId: monitor.serviceId,
        status: {
          in: [IncidentStatus.Open, IncidentStatus.Acknowledged]
        }
      }
    });

    if (existing) {
      return existing;
    }

    const incident = await this.prisma.incident.create({
      data: {
        organizationId: monitor.organizationId,
        serviceId: monitor.serviceId,
        title: `${monitor.service.name} monitor failing`,
        summary: `${monitor.name} failed its latest ${monitor.type} check against ${monitor.targetUrl}.`,
        severity:
          monitor.type === MonitorType.Synthetic
            ? IncidentSeverity.Sev2
            : IncidentSeverity.Sev3,
        status: IncidentStatus.Open,
        events: {
          create: {
            kind: "automation",
            message: "Incident opened automatically by the monitor worker."
          }
        }
      }
    });

    await this.alerts.notifyIncident(incident);

    await this.audit.record({
      organizationId: monitor.organizationId,
      action: AuditAction.IncidentCreated,
      entityType: "incident",
      entityId: incident.id,
      metadata: {
        monitorId: monitor.id,
        serviceId: monitor.serviceId
      }
    });

    this.realtime.emitToOrganization(monitor.organizationId, "incident.created", {
      incident
    });

    return incident;
  }

  private async probe(input: {
    targetUrl: string;
    method: string;
    expectedStatus: number;
    timeoutMs: number;
    type: string;
  }): Promise<ProbeResult> {
    const startedAt = performance.now();

    if (input.targetUrl.startsWith("demo://")) {
      return this.demoProbe(input.targetUrl);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(input.targetUrl, {
        method: input.method,
        signal: controller.signal
      });

      const latencyMs = Math.round(performance.now() - startedAt);

      return {
        ok: response.status === input.expectedStatus,
        statusCode: response.status,
        latencyMs,
        error:
          response.status === input.expectedStatus
            ? null
            : `Expected ${input.expectedStatus}, received ${response.status}`
      };
    } catch (error) {
      return {
        ok: false,
        statusCode: null,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Unknown probe error"
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private demoProbe(targetUrl: string): ProbeResult {
    const latencyMs = Math.round(60 + Math.random() * 260);
    const isDown = targetUrl.includes("down");
    const isFlaky = targetUrl.includes("flaky") && Math.random() < 0.28;
    const ok = !isDown && !isFlaky;

    return {
      ok,
      statusCode: ok ? 200 : 503,
      latencyMs: ok ? latencyMs : latencyMs + 380,
      error: ok ? null : "Demo probe breached the synthetic SLO."
    };
  }
}

@Injectable()
export class MonitorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorScheduler.name);
  private queue?: Queue;
  private worker?: Worker;
  private connection?: IORedis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MonitoringEngine
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_WORKER !== "true") {
      this.logger.log("Monitor worker disabled. Set ENABLE_WORKER=true to enable.");
      return;
    }

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });

    this.queue = new Queue("pulseops-checks", {
      connection: this.connection
    });

    this.worker = new Worker(
      "pulseops-checks",
      async (job) => this.engine.runMonitorCheck(job.data.monitorId),
      {
        connection: this.connection
      }
    );

    const monitors = await this.prisma.monitor.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        intervalSeconds: true
      }
    });

    await Promise.all(
      monitors.map((monitor) =>
        this.queue?.add(
          "run-monitor",
          {
            monitorId: monitor.id
          },
          {
            jobId: `monitor-${monitor.id}`,
            repeat: {
              every: monitor.intervalSeconds * 1000
            },
            removeOnComplete: 200,
            removeOnFail: 200
          }
        )
      )
    );

    this.logger.log(`Scheduled ${monitors.length} monitor jobs.`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
