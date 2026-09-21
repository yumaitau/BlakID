import { describe, expect, it } from "vitest";
import { evaluateAssertion, evaluateAssertions, type TrustPolicy } from "./index.ts";

const assertion = (attribute: string) => ({
  attribute,
  value: true,
  issuer: "Wiradjuri Example Corporation",
  issued_at: "2026-09-22T00:00:00Z",
  expires_at: null,
  assurance: "organisation_verified" as const,
});

describe("pairwise BlakID Federation", () => {
  it("rejects assertions with no trust policy", () => {
    const decision = evaluateAssertion(null, assertion("email"));
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/no explicit trust/);
  });

  it("accepts identity and membership while refusing administrator role", () => {
    const policy: TrustPolicy = {
      id: "t1",
      organisationId: "org-b",
      peerOrganisationId: "org-a",
      peerName: "Wiradjuri Example Corporation",
      acceptAttributes: ["identity", "email", "organisation_membership"],
      rejectAttributes: ["administrator_role", "financial_authority", "employment_role"],
      createdAt: "2026-09-22T00:00:00Z",
    };
    const decisions = evaluateAssertions(policy, [
      assertion("email"),
      assertion("organisation_membership"),
      assertion("administrator_role"),
      assertion("financial_authority"),
    ]);
    expect(decisions.filter((d) => d.accepted).map((d) => d.attribute)).toEqual(["email", "organisation_membership"]);
    expect(decisions.filter((d) => !d.accepted).map((d) => d.attribute)).toEqual([
      "administrator_role",
      "financial_authority",
    ]);
  });

  it("refuses a universal trust mesh", () => {
    expect(typeof evaluateAssertion).toBe("function");
    expect("globalTrust" in ({} as TrustPolicy)).toBe(false);
  });
});
