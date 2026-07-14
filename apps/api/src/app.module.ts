import { Module } from "@nestjs/common";
import { AlertRulesController, AlertService, NotificationsController } from "./alerts";
import { AuditController, AuditService } from "./audit";
import { AuthController, AuthGuard, AuthService, MeController } from "./auth";
import { DashboardController } from "./dashboard";
import { IncidentsController } from "./incidents";
import { MonitoringEngine, MonitorScheduler } from "./monitoring-engine";
import { MonitorsController } from "./monitors";
import { PrismaService } from "./prisma.service";
import { RealtimeGateway } from "./realtime.gateway";
import { ServicesController } from "./services";

@Module({
  controllers: [
    AuthController,
    MeController,
    DashboardController,
    ServicesController,
    MonitorsController,
    IncidentsController,
    AlertRulesController,
    NotificationsController,
    AuditController
  ],
  providers: [
    PrismaService,
    AuthGuard,
    AuthService,
    AuditService,
    RealtimeGateway,
    AlertService,
    MonitoringEngine,
    MonitorScheduler
  ]
})
export class AppModule {}
