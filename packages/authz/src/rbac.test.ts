import { describe, expect, it } from "vitest";
import { authorize, ForbiddenError, TenantIsolationError } from "./authorize.ts";
import { assertIndependenceGuard, MATRIX } from "./matrix.ts";
import { OPERATOR_FORBIDDEN } from "./roles.ts";
import type { Principal } from "./principal.ts";

function principal(role: Principal["role"], organisationId: string | null = "org-a"): Principal {
  return {
    actorId: `id-${role}`,
    actorType: role === "YUMA_PLATFORM_OPERATOR" ? "operator" : "human",
    role,
    email: `${role}@test`,
    name: role,
    organisationId,
    sessionId: "s1",
  };
}

describe("RBAC independence guard", () => {
  it("fails the suite if the operator role gains customer identity writes", () => {
    assertIndependenceGuard();
    for (const permission of OPERATOR_FORBIDDEN) {
      expect(MATRIX[permission].includes("YUMA_PLATFORM_OPERATOR")).toBe(false);
      expect(() => authorize(principal("YUMA_PLATFORM_OPERATOR", null), permission, "org-a")).toThrow(
        TenantIsolationError,
      );
    }
  });

  it("lets operators provision infrastructure and read health", () => {
    const operator = principal("YUMA_PLATFORM_OPERATOR", null);
    expect(() => authorize(operator, "platform.organisations.provision", null)).not.toThrow();
    expect(() => authorize(operator, "platform.health.read", null)).not.toThrow();
    expect(() => authorize(operator, "platform.backups.manage", null)).not.toThrow();
  });

  it("lets organisation owners manage their people", () => {
    const owner = principal("ORGANISATION_OWNER", "org-a");
    expect(() => authorize(owner, "identity.users.write", "org-a")).not.toThrow();
    expect(() => authorize(owner, "identity.users.write", "org-b")).toThrow(TenantIsolationError);
  });

  it("denies auditors identity writes", () => {
    const auditor = principal("AUDITOR", "org-a");
    expect(() => authorize(auditor, "audit.read", "org-a")).not.toThrow();
    expect(() => authorize(auditor, "identity.users.write", "org-a")).toThrow(ForbiddenError);
  });

  it("allows a live support grant to add scoped access without impersonation", () => {
    const operator: Principal = {
      ...principal("YUMA_PLATFORM_OPERATOR", null),
      supportGrant: {
        requestId: "sup-1",
        organisationId: "org-a",
        scopes: ["identity.users.read", "identity.sessions.revoke"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    expect(() => authorize(operator, "identity.users.read", "org-a")).not.toThrow();
    expect(() => authorize(operator, "identity.impersonate", "org-a")).toThrow();
  });
});
