import type { Principal, Role } from "@blakid/authz";

export function createTestPrincipal(input: {
  role: Role;
  organisationId?: string | null;
  actorId?: string;
  email?: string;
  name?: string;
  sessionId?: string;
}): Principal {
  const role = input.role;
  return {
    actorId: input.actorId ?? `actor-${role.toLowerCase()}`,
    actorType: role === "YUMA_PLATFORM_OPERATOR" ? "operator" : "human",
    role,
    email: input.email ?? `${role.toLowerCase()}@blakid.test`,
    name: input.name ?? role,
    organisationId: input.organisationId ?? null,
    sessionId: input.sessionId ?? "sess-test",
  };
}
