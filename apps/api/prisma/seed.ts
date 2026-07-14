import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

async function main() {
  await prisma.organization.deleteMany({
    where: {
      slug: "pulseops-demo"
    }
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "matias@pulseops.dev",
          "lina@pulseops.dev",
          "noah@pulseops.dev"
        ]
      }
    }
  });

  const passwordHash = await bcrypt.hash("pulseops-demo", 12);

  const organization = await prisma.organization.create({
    data: {
      name: "PulseOps Demo Cloud",
      slug: "pulseops-demo"
    }
  });

  const [owner, responder, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        email: "matias@pulseops.dev",
        name: "Matias Silva",
        avatarUrl: "https://api.dicebear.com/8.x/initials/svg?seed=MS",
        passwordHash,
        memberships: {
          create: {
            organizationId: organization.id,
            role: "owner"
          }
        }
      }
    }),
    prisma.user.create({
      data: {
        email: "lina@pulseops.dev",
        name: "Lina Torres",
        avatarUrl: "https://api.dicebear.com/8.x/initials/svg?seed=LT",
        passwordHash,
        memberships: {
          create: {
            organizationId: organization.id,
            role: "responder"
          }
        }
      }
    }),
    prisma.user.create({
      data: {
        email: "noah@pulseops.dev",
        name: "Noah Grant",
        avatarUrl: "https://api.dicebear.com/8.x/initials/svg?seed=NG",
        passwordHash,
        memberships: {
          create: {
            organizationId: organization.id,
            role: "viewer"
          }
        }
      }
    })
  ]);

  const serviceInputs = [
    {
      name: "Edge Gateway",
      slug: "edge-gateway",
      ownerTeam: "Platform",
      status: "operational",
      description: "Global API gateway and traffic shaping layer."
    },
    {
      name: "Checkout API",
      slug: "checkout-api",
      ownerTeam: "Revenue",
      status: "degraded",
      description: "Payments, invoicing and order orchestration."
    },
    {
      name: "Identity Core",
      slug: "identity-core",
      ownerTeam: "Security",
      status: "operational",
      description: "Authentication, sessions and organization membership."
    },
    {
      name: "Telemetry Stream",
      slug: "telemetry-stream",
      ownerTeam: "Observability",
      status: "major_outage",
      description: "Event ingestion and real-time operational analytics."
    },
    {
      name: "Notification Relay",
      slug: "notification-relay",
      ownerTeam: "Comms",
      status: "operational",
      description: "Email, Slack and webhook delivery fanout."
    }
  ];

  const services = await Promise.all(
    serviceInputs.map((service) =>
      prisma.service.create({
        data: {
          ...service,
          organizationId: organization.id
        }
      })
    )
  );

  const monitors = await Promise.all(
    services.flatMap((service, index) => [
      prisma.monitor.create({
        data: {
          organizationId: organization.id,
          serviceId: service.id,
          name: `${service.name} health endpoint`,
          type: "http",
          targetUrl:
            index === 3
              ? "demo://telemetry-down"
              : index === 1
                ? "demo://checkout-flaky"
                : "demo://healthy",
          method: "GET",
          expectedStatus: 200,
          intervalSeconds: 60,
          timeoutMs: 3000
        }
      }),
      prisma.monitor.create({
        data: {
          organizationId: organization.id,
          serviceId: service.id,
          name: `${service.name} synthetic journey`,
          type: "synthetic",
          targetUrl: index === 1 ? "demo://checkout-flaky" : "demo://healthy",
          method: "GET",
          expectedStatus: 200,
          intervalSeconds: 120,
          timeoutMs: 5000
        }
      })
    ])
  );

  for (const [monitorIndex, monitor] of monitors.entries()) {
    const service = services.find((candidate) => candidate.id === monitor.serviceId);
    const isTelemetry = service?.slug === "telemetry-stream";
    const isCheckout = service?.slug === "checkout-api";

    await prisma.checkResult.createMany({
      data: Array.from({ length: 72 }).map((_, pointIndex) => {
        const recent = pointIndex > 64;
        const shouldFail =
          (isTelemetry && recent) ||
          (isCheckout && pointIndex % 9 === 0) ||
          (monitorIndex % 5 === 0 && pointIndex % 17 === 0);
        const latencyBase = 80 + monitorIndex * 11 + (pointIndex % 12) * 9;

        return {
          monitorId: monitor.id,
          ok: !shouldFail,
          statusCode: shouldFail ? 503 : 200,
          latencyMs: shouldFail ? latencyBase + 340 : latencyBase,
          error: shouldFail ? "Synthetic check breached latency/error threshold" : null,
          createdAt: minutesAgo((72 - pointIndex) * 5)
        };
      })
    });
  }

  const checkout = services.find((service) => service.slug === "checkout-api");
  const telemetry = services.find((service) => service.slug === "telemetry-stream");

  if (!checkout || !telemetry) {
    throw new Error("Seed services were not created.");
  }

  const checkoutIncident = await prisma.incident.create({
    data: {
      organizationId: organization.id,
      serviceId: checkout.id,
      title: "Checkout API latency above SLO",
      summary:
        "p95 latency crossed 900ms for multiple regions after a payment provider retry storm.",
      severity: "sev2",
      status: "acknowledged",
      assigneeId: responder.id,
      openedAt: minutesAgo(96),
      events: {
        create: [
          {
            authorId: owner.id,
            kind: "automation",
            message: "Incident opened automatically after 3 failed checks.",
            createdAt: minutesAgo(96)
          },
          {
            authorId: responder.id,
            kind: "status_change",
            message: "Lina acknowledged and started provider failover.",
            createdAt: minutesAgo(84)
          }
        ]
      }
    }
  });

  const telemetryIncident = await prisma.incident.create({
    data: {
      organizationId: organization.id,
      serviceId: telemetry.id,
      title: "Telemetry ingestion queue stalled",
      summary:
        "Event ingestion workers are timing out and dashboard freshness is behind by 18 minutes.",
      severity: "sev1",
      status: "open",
      assigneeId: owner.id,
      openedAt: minutesAgo(37),
      events: {
        create: [
          {
            authorId: owner.id,
            kind: "automation",
            message: "Major outage created after sustained ingestion failures.",
            createdAt: minutesAgo(37)
          }
        ]
      }
    }
  });

  await prisma.alertRule.createMany({
    data: [
      {
        organizationId: organization.id,
        name: "SEV1 page responders",
        severity: "sev1",
        channelType: "slack",
        thresholdMinutes: 0
      },
      {
        organizationId: organization.id,
        name: "SEV2 email incident channel",
        severity: "sev2",
        channelType: "email",
        thresholdMinutes: 5
      },
      {
        organizationId: organization.id,
        name: "Webhook for incident archive",
        severity: "sev3",
        channelType: "webhook",
        thresholdMinutes: 15
      }
    ]
  });

  await prisma.notificationChannel.createMany({
    data: [
      {
        organizationId: organization.id,
        type: "slack",
        target: "#incident-command"
      },
      {
        organizationId: organization.id,
        type: "email",
        target: "oncall@pulseops.dev"
      },
      {
        organizationId: organization.id,
        type: "webhook",
        target: "https://hooks.example.dev/pulseops"
      }
    ]
  });

  await prisma.notificationLog.createMany({
    data: [
      {
        organizationId: organization.id,
        incidentId: checkoutIncident.id,
        channelType: "email",
        target: "oncall@pulseops.dev",
        status: "simulated",
        payload: {
          title: checkoutIncident.title,
          severity: checkoutIncident.severity
        }
      },
      {
        organizationId: organization.id,
        incidentId: telemetryIncident.id,
        channelType: "slack",
        target: "#incident-command",
        status: "simulated",
        payload: {
          title: telemetryIncident.title,
          severity: telemetryIncident.severity
        }
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: organization.id,
        actorId: owner.id,
        action: "login",
        entityType: "session",
        metadata: { source: "seed" },
        createdAt: minutesAgo(140)
      },
      {
        organizationId: organization.id,
        actorId: owner.id,
        action: "service.created",
        entityType: "service",
        entityId: telemetry.id,
        metadata: { ownerTeam: "Observability" },
        createdAt: minutesAgo(118)
      },
      {
        organizationId: organization.id,
        actorId: responder.id,
        action: "incident.updated",
        entityType: "incident",
        entityId: checkoutIncident.id,
        metadata: { status: "acknowledged" },
        createdAt: minutesAgo(84)
      },
      {
        organizationId: organization.id,
        actorId: viewer.id,
        action: "alert.sent",
        entityType: "notification",
        entityId: telemetryIncident.id,
        metadata: { channel: "slack", simulated: true },
        createdAt: minutesAgo(36)
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
