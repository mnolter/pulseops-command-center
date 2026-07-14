import { Injectable } from "@nestjs/common";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuditAction } from "@pulseops/shared";
import { AuthGuard } from "./auth";
import { PrismaService } from "./prisma.service";
import { requireUser, type RequestWithUser } from "./types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    organizationId: string;
    actorId?: string;
    action: AuditAction | string;
    entityType: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata
      }
    });
  }
}

@Controller("audit-logs")
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.auditLog.findMany({
      where: {
        organizationId: user.organizationId
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    });
  }
}
