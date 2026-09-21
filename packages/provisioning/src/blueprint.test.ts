import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PASSKEY_ENROL_SLUG, TOTP_ENROL_SLUG } from "@blakid/config";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("authentik WebAuthn blueprint", () => {
  it("declares passkey and TOTP enrolment flows for upstream authentik", () => {
    const files = [
      join(root, "infrastructure/authentik/blueprints/blakid-baseline.yaml"),
      join(root, "infrastructure/docker/blueprints/blakid-baseline.yaml"),
    ];
    for (const file of files) {
      const yaml = readFileSync(file, "utf8");
      expect(yaml).toContain("authentik_stages_authenticator_webauthn.webauthnauthenticatorstage");
      expect(yaml).toContain("authentik_stages_authenticator_totp.authenticatortotpstage");
      expect(yaml).toContain(`slug: ${PASSKEY_ENROL_SLUG}`);
      expect(yaml).toContain(`slug: ${TOTP_ENROL_SLUG}`);
      expect(yaml).toContain("user_verification: required");
    }
  });
});
