import type { Permission, Role } from "./roles.ts";

export type ActorType = "human" | "service" | "operator" | "agent" | "system";

export type SupportGrant = {
  requestId: string;
  organisationId: string;
  scopes: Permission[];
  expiresAt: string;
};

export type Principal = {
  actorId: string;
  actorType: ActorType;
  role: Role;
  email: string;
  name: string;
  organisationId: string | null;
  sessionId: string;
  supportGrant?: SupportGrant;
};

export class ForbiddenError extends Error {
  readonly code = "forbidden" as const;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class TenantIsolationError extends Error {
  readonly code = "tenant_isolation" as const;
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}
