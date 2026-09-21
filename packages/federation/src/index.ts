import { assertNotIndigenousIdentityClaim, type AttributeAssertion } from "@blakid/identity";

export type TrustPolicy = {
  id: string;
  organisationId: string;
  peerOrganisationId: string;
  peerName: string;
  acceptAttributes: string[];
  rejectAttributes: string[];
  createdAt: string;
};

export type TrustDecision = {
  accepted: boolean;
  attribute: string;
  reason: string;
};

export function evaluateAssertion(policy: TrustPolicy | null, assertion: AttributeAssertion): TrustDecision {
  assertNotIndigenousIdentityClaim([assertion]);
  if (!policy) {
    return { accepted: false, attribute: assertion.attribute, reason: "no explicit trust relationship" };
  }
  if (policy.peerOrganisationId === "*" || policy.peerOrganisationId === "global") {
    return { accepted: false, attribute: assertion.attribute, reason: "global trust is forbidden" };
  }
  if (policy.rejectAttributes.includes(assertion.attribute)) {
    return { accepted: false, attribute: assertion.attribute, reason: "attribute rejected by trust policy" };
  }
  if (policy.acceptAttributes.length > 0 && !policy.acceptAttributes.includes(assertion.attribute)) {
    return { accepted: false, attribute: assertion.attribute, reason: "attribute not in accept list" };
  }
  return { accepted: true, attribute: assertion.attribute, reason: "accepted under pairwise trust" };
}

export function evaluateAssertions(policy: TrustPolicy | null, assertions: AttributeAssertion[]): TrustDecision[] {
  return assertions.map((assertion) => evaluateAssertion(policy, assertion));
}

export { generateFederationKeypair, peekFederationIssuer, signFederationAssertion, verifyFederationAssertion } from "./assertion.ts";
export type { FederationKeypair, SignedFederationPayload } from "./assertion.ts";
