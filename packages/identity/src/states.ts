export const USER_STATES = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "LOCKED",
  "ARCHIVED",
  "DELETED",
] as const;

export type UserState = (typeof USER_STATES)[number];

export const IDENTITY_KINDS = [
  "person",
  "service_account",
  "machine",
  "api_client",
  "workload",
  "automation_agent",
  "ai_agent",
] as const;

export type IdentityKind = (typeof IDENTITY_KINDS)[number];

export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition" as const;
  constructor(
    readonly from: UserState,
    readonly to: UserState,
  ) {
    super(`Cannot transition identity from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const ALLOWED: Record<UserState, readonly UserState[]> = {
  INVITED: ["ACTIVE", "ARCHIVED", "DELETED"],
  ACTIVE: ["SUSPENDED", "LOCKED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED", "LOCKED"],
  LOCKED: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  ARCHIVED: ["ACTIVE", "DELETED"],
  DELETED: [],
};

export function canTransition(from: UserState, to: UserState): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(from: UserState, to: UserState): UserState {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}

export type AttributeAssertion = {
  attribute: string;
  value: unknown;
  issuer: string;
  issued_at: string;
  expires_at: string | null;
  assurance: "organisation_verified" | "self_asserted" | "federated";
};

export function assertNotIndigenousIdentityClaim(assertions: AttributeAssertion[]): void {
  for (const assertion of assertions) {
    const key = assertion.attribute.toLowerCase();
    if (
      key === "is_indigenous" ||
      key === "aboriginal" ||
      key === "torres_strait_islander" ||
      key === "blakid_proves_indigenous_identity"
    ) {
      throw new Error(
        "BlakID must never assert Aboriginal or Torres Strait Islander identity as a platform claim",
      );
    }
  }
}
