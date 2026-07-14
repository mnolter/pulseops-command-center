import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuditAction, serviceSchema } from "@pulseops/shared";
import { z } from "zod";
import { AuthGuard } from "./auth";
import { AuditService } from "./audit";
import { PrismaService } from "./prisma.service";
import { requireUser, type RequestWithUser } from "./types";

const serviceUpdateSchema = serviceSchema.partial();

@ApiTags("services")
@Controller("services")
@UseGuards(AuthGuard)
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = requireUser(request);

    return this.prisma.service.findMany({
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
              in: ["open", "acknowledged"]
            }
          },
          orderBy: {
            openedAt: "desc"
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });
  }

  @Get(":id")
  async get(@Req() request: RequestWithUser, @Param("id") id: string) {
    const user = requireUser(request);

    return this.prisma.service.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      },
      include: {
        monitors: {
          include: {
            checkResults: {
              orderBy: {
                createdAt: "desc"
              },
              take: 12
            }
          }
        },
        incidents: {
          orderBy: {
            openedAt: "desc"
          },
          take: 12
        }
      }
    });
  }

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: unknown) {
    const user = requireUser(request);
    const input = serviceSchema.parse(body);

    const service = await this.prisma.service.create({
      data: {
        organizationId: user.organizationId,
        ...input
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.ServiceCreated,
      entityType: "service",
      entityId: service.id,
      metadata: {
        slug: service.slug,
        ownerTeam: service.ownerTeam
      }
    });

    return service;
  }

  @Patch(":id")
  async update(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = requireUser(request);
    const input = serviceUpdateSchema.parse(body);

    const existing = await this.prisma.service.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      }
    });

    const service = await this.prisma.service.update({
      where: {
        id: existing.id
      },
      data: input
    });

    if (service.organizationId !== user.organizationId) {
      throw new ForbiddenException("Cannot update service outside active organization.");
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: AuditAction.ServiceUpdated,
      entityType: "service",
      entityId: service.id,
      metadata: input
    });

    return service;
  }

  @Delete(":id")
  async remove(@Req() request: RequestWithUser, @Param("id") id: string) {
    const user = requireUser(request);

    const service = await this.prisma.service.findFirstOrThrow({
      where: {
        id,
        organizationId: user.organizationId
      }
    });

    await this.prisma.service.delete({
      where: {
        id: service.id
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "service.deleted",
      entityType: "service",
      entityId: service.id
    });

    return {
      ok: true
    };
  }

  @Get(":id/checks")
  async checks(@Req() request: RequestWithUser, @Param("id") id: string) {
    const user = requireUser(request);

    const monitorIds = await this.prisma.monitor.findMany({
      where: {
        serviceId: id,
        organizationId: user.organizationId
      },
      select: {
        id: true
      }
    });

    return this.prisma.checkResult.findMany({
      where: {
        monitorId: {
          in: monitorIds.map((monitor) => monitor.id)
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 200
    });
  }
}

export const serviceIdSchema = z.object({
  id: z.string().min(1)
});
