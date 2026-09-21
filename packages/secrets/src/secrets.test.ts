import { describe, expect, it } from "vitest";
import { AesGcmVault, ProductionKeyError, signingKeyExpired, vaultFromEnv } from "./index.ts";

describe("key vault", () => {
  it("round-trips a federation private key", async () => {
    const vault = new AesGcmVault("test-key", "key-1");
    const sealed = await vault.encrypt('{"kty":"RSA"}', new Date("2026-09-22T00:00:00Z"));
    expect(sealed.keyId).toBe("key-1");
    expect(sealed.ciphertext).not.toContain("RSA");
    expect(await vault.decrypt(sealed)).toBe('{"kty":"RSA"}');
  });

  it("refuses production without a KMS key id", () => {
    expect(() => vaultFromEnv({ BLAKID_ENV: "production" })).toThrow(ProductionKeyError);
    const vault = vaultFromEnv({ BLAKID_ENV: "production", BLAKID_KMS_KEY_ID: "arn:aws:kms:ap-southeast-2:1:key/abc", BLAKID_KMS_DATA_KEY: "wrapped" });
    expect(vault.keyId).toContain("ap-southeast-2");
  });

  it("treats a missing or old signing key as expired", () => {
    const now = new Date("2026-09-22T00:00:00Z");
    expect(signingKeyExpired(null, now, 90)).toBe(true);
    expect(signingKeyExpired("2026-01-01T00:00:00Z", now, 90)).toBe(true);
    expect(signingKeyExpired("2026-09-01T00:00:00Z", now, 90)).toBe(false);
  });
});
