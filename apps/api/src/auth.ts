import {
  Body,
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuditAction, UserRole } from "@pulseops/shared";
import { PrismaService } from "./prisma.service";
import { requireUser, type AuthenticatedUser, type RequestWithUser } from "./types";

const IS_PUBLIC_KEY = "pulseops:isPublic";
const SESSION_COOKIE = "pulseops_session";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

function parseLoginBody(body: Partial<LoginDto> | undefined): LoginDto {
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.trim().length === 0 ||
    body.password.length === 0
  ) {
    throw new BadRequestException("Email and password are required.");
  }

  return {
    email: body.email.trim().toLowerCase(),
    password: body.password
  };
}

function jwtSecret() {
  return process.env.JWT_SECRET ?? "pulseops-local-development-secret";
}

function signSession(user: AuthenticatedUser) {
  return jwt.sign(user, jwtSecret(), {
    subject: user.userId,
    expiresIn: "8h"
  });
}

function readBearerToken(request: RequestWithUser): string | undefined {
  const header = request.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return request.cookies?.[SESSION_COOKIE];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readBearerToken(request);

    if (!token) {
      throw new UnauthorizedException("Missing session token.");
    }

    try {
      request.user = jwt.verify(token, jwtSecret()) as AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired session token.");
    }
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<{
    token: string;
    user: AuthenticatedUser;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      include: {
        memberships: {
          include: {
            organization: true
          },
          take: 1
        }
      }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const membership = user.memberships[0];

    if (!membership) {
      throw new UnauthorizedException("User does not belong to an organization.");
    }

    const sessionUser: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      role: membership.role as UserRole
    };

    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        actorId: user.id,
        action: AuditAction.Login,
        entityType: "session",
        metadata: {
          strategy: "password"
        }
      }
    });

    return {
      token: signSession(sessionUser),
      user: sessionUser
    };
  }
}

@ApiTags("auth")
@Controller("auth")
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: "Creates an httpOnly demo session." })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const credentials = parseLoginBody(body);
    const session = await this.auth.login(
      credentials.email,
      credentials.password
    );

    response.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/"
    });

    return session;
  }

  @Post("logout")
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, {
      path: "/"
    });

    return {
      ok: true
    };
  }
}

@ApiTags("me")
@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  me(@Req() request: RequestWithUser) {
    return requireUser(request);
  }
}
