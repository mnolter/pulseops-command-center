import type { Request } from "express";
import type { UserRole } from "@pulseops/shared";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: UserRole;
};

export type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

export function requireUser(request: RequestWithUser): AuthenticatedUser {
  if (!request.user) {
    throw new Error("Authenticated user missing from request context.");
  }

  return request.user;
}
