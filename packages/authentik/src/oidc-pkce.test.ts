import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createPkcePair, verifyPkceChallenge } from "./oidc-pkce.ts";

describe("PKCE S256", () => {
  it("challenge is the base64url SHA-256 of the verifier", () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThan(20);
    expect(createHash("sha256").update(pair.verifier).digest("base64url")).toBe(pair.challenge);
    expect(verifyPkceChallenge(pair)).toBe(true);
    expect(verifyPkceChallenge({ verifier: pair.verifier, challenge: "nope" })).toBe(false);
  });
});
