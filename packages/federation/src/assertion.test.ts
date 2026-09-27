import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAssertions, type TrustPolicy } from "./index.ts";
import { generateFederationKeypair, peekFederationIssuer, signFederationAssertion, verifyFederationAssertion } from "./assertion.ts";

const email = {
  attribute: "email",
  value: "josh@wiradjuri.test",
  issuer: "Wiradjuri Example Corporation",
  issued_at: "2026-09-22T05:00:00.000Z",
  expires_at: null,
  assurance: "organisation_verified" as const,
};

const admin = {
  ...email,
  attribute: "administrator_role",
  value: true,
};

describe("signed BlakID Federation assertions", () => {
  beforeEach(() => {
    // Match the fixture clock for JWT and support-grant expiry checks.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-22T05:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs with the issuer key and verifies for the audience", async () => {
    const key = await generateFederationKeypair("org-a", "2026-09-22T05:00:00.000Z");
    const token = await signFederationAssertion(key, {
      audienceOrgId: "org-b",
      subject: "josh@wiradjuri.test",
      name: "Josh",
      attributes: [email],
      now: new Date("2026-09-22T05:00:00.000Z"),
    });
    expect(peekFederationIssuer(token)).toBe("org-a");
    const payload = await verifyFederationAssertion(token, "org-b", key);
    expect(payload.sub).toBe("josh@wiradjuri.test");
    expect(payload.attributes[0]?.attribute).toBe("email");
  });

  it("rejects an assertion at its expiration time", async () => {
    const key = await generateFederationKeypair("org-a", new Date().toISOString());
    const token = await signFederationAssertion(key, {
      audienceOrgId: "org-b",
      subject: "josh@wiradjuri.test",
      attributes: [email],
      now: new Date(),
    });

    vi.setSystemTime(new Date("2026-09-22T05:04:59.000Z"));
    await expect(verifyFederationAssertion(token, "org-b", key)).resolves.toMatchObject({
      sub: "josh@wiradjuri.test",
    });
    vi.setSystemTime(new Date("2026-09-22T05:05:00.000Z"));
    await expect(verifyFederationAssertion(token, "org-b", key)).rejects.toMatchObject({
      code: "ERR_JWT_EXPIRED",
    });
  });

  it("rejects a valid signature when the audience has no pairwise trust", async () => {
    const key = await generateFederationKeypair("org-a", "2026-09-22T05:00:00.000Z");
    const token = await signFederationAssertion(key, {
      audienceOrgId: "org-b",
      subject: "josh@wiradjuri.test",
      attributes: [email, admin],
      now: new Date("2026-09-22T05:00:00.000Z"),
    });
    const payload = await verifyFederationAssertion(token, "org-b", key);
    const decisions = evaluateAssertions(null, payload.attributes);
    expect(decisions.every((d) => d.accepted === false)).toBe(true);
  });

  it("accepts identity attributes and refuses administrator role under trust", async () => {
    const policy: TrustPolicy = {
      id: "t1",
      organisationId: "org-b",
      peerOrganisationId: "org-a",
      peerName: "Wiradjuri Example Corporation",
      acceptAttributes: ["identity", "email", "organisation_membership"],
      rejectAttributes: ["administrator_role", "financial_authority"],
      createdAt: "2026-09-22T05:00:00.000Z",
    };
    const decisions = evaluateAssertions(policy, [email, admin]);
    expect(decisions[0]?.accepted).toBe(true);
    expect(decisions[1]?.accepted).toBe(false);
  });
});
