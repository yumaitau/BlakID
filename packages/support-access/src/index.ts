import type { Permission } from "@blakid/authz";

export const SUPPORT_STATUSES = [
  "requested",
  "pending_second",
  "approved",
  "denied",
  "active",
  "expired",
  "ended",
  "reviewed",
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type SupportAccessRequest = {
  id: string;
  organisationId: string;
  requesterId: string;
  requesterEmail: string;
  reason: string;
  scopes: Permission[];
  status: SupportStatus;
  breakGlass: boolean;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  firstApproverId: string | null;
  firstApprovedAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
  reviewNotes: string | null;
  alerted: boolean;
};

export class SupportAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportAccessError";
  }
}

const ALLOWED_SUPPORT_SCOPES: ReadonlySet<Permission> = new Set([
  "identity.users.read",
  "identity.users.suspend",
  "identity.sessions.revoke",
  "applications.read",
  "audit.read",
]);

export function assertSupportScopes(scopes: Permission[]): void {
  for (const scope of scopes) {
    if (!ALLOWED_SUPPORT_SCOPES.has(scope)) {
      throw new SupportAccessError(`Support scope ${scope} is not permitted`);
    }
  }
  if (scopes.includes("identity.impersonate") || scopes.includes("identity.credentials.read")) {
    throw new SupportAccessError("Support access cannot include impersonation or credential read");
  }
}

export function requestSupport(input: {
  id: string;
  organisationId: string;
  requesterId: string;
  requesterEmail: string;
  reason: string;
  scopes: Permission[];
  breakGlass?: boolean;
  now: Date;
}): SupportAccessRequest {
  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new SupportAccessError("Support access requires a reason");
  }
  assertSupportScopes(input.scopes);
  return {
    id: input.id,
    organisationId: input.organisationId,
    requesterId: input.requesterId,
    requesterEmail: input.requesterEmail,
    reason,
    scopes: [...input.scopes],
    status: "requested",
    breakGlass: Boolean(input.breakGlass),
    createdAt: input.now.toISOString(),
    approvedBy: null,
    approvedAt: null,
    firstApproverId: null,
    firstApprovedAt: null,
    startedAt: null,
    expiresAt: null,
    endedAt: null,
    reviewNotes: null,
    alerted: Boolean(input.breakGlass),
  };
}

export function approveSupport(
  request: SupportAccessRequest,
  approverId: string,
  now: Date,
  ttlMinutes: number,
): SupportAccessRequest {
  if (request.breakGlass && request.status === "requested") {
    return {
      ...request,
      status: "pending_second",
      firstApproverId: approverId,
      firstApprovedAt: now.toISOString(),
      alerted: true,
    };
  }
  if (request.breakGlass && request.status === "pending_second") {
    if (!request.firstApproverId || approverId === request.firstApproverId) {
      throw new SupportAccessError("Break-glass needs a second person");
    }
  } else if (request.status !== "requested") {
    throw new SupportAccessError(`Cannot approve support request in status ${request.status}`);
  }
  const expires = new Date(now.getTime() + ttlMinutes * 60_000);
  return {
    ...request,
    status: "approved",
    approvedBy: approverId,
    approvedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    alerted: true,
  };
}

export function denySupport(request: SupportAccessRequest, approverId: string, now: Date): SupportAccessRequest {
  if (request.status !== "requested") {
    throw new SupportAccessError(`Cannot deny support request in status ${request.status}`);
  }
  return {
    ...request,
    status: "denied",
    approvedBy: approverId,
    approvedAt: now.toISOString(),
    endedAt: now.toISOString(),
  };
}

export function startSupport(request: SupportAccessRequest, now: Date): SupportAccessRequest {
  if (request.status !== "approved") {
    throw new SupportAccessError(`Cannot start support request in status ${request.status}`);
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= now.getTime()) {
    throw new SupportAccessError("Support grant expired before start");
  }
  return {
    ...request,
    status: "active",
    startedAt: now.toISOString(),
  };
}

export function expireOrEnd(
  request: SupportAccessRequest,
  now: Date,
  reason: "expired" | "ended",
): SupportAccessRequest {
  if (request.status !== "active" && request.status !== "approved") {
    throw new SupportAccessError(`Cannot close support request in status ${request.status}`);
  }
  return {
    ...request,
    status: reason,
    endedAt: now.toISOString(),
  };
}

export function reviewSupport(
  request: SupportAccessRequest,
  notes: string,
): SupportAccessRequest {
  if (request.status !== "ended" && request.status !== "expired") {
    throw new SupportAccessError("Review happens after the session closes");
  }
  if (request.breakGlass && notes.trim().length < 8) {
    throw new SupportAccessError("Break-glass cannot close until the session is reviewed");
  }
  return { ...request, status: "reviewed", reviewNotes: notes };
}

export function isExpired(request: SupportAccessRequest, now: Date): boolean {
  if (!request.expiresAt) return false;
  return new Date(request.expiresAt).getTime() <= now.getTime();
}
