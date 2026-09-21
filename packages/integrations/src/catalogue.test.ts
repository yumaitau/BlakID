import { describe, expect, it } from "vitest";
import { CATALOGUE, catalogueApplyPlan } from "./index.ts";

describe("application catalogue", () => {
  it("includes the initial integrations", () => {
    const ids = CATALOGUE.map((i) => i.id);
    for (const id of [
      "microsoft-365",
      "google-workspace",
      "aws",
      "azure",
      "github",
      "gitlab",
      "slack",
      "cloudflare",
      "nextcloud",
      "grafana",
      "mattermost",
      "opendesk",
      "blak-workspace",
      "rangeros",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("plans OIDC+SCIM for GitHub and labels LDAP as legacy", () => {
    const github = catalogueApplyPlan({
      catalogueId: "github",
      protocol: "oidc",
      redirectUris: ["https://github.com/orgs/example/sso/callback"],
      scimUrl: "https://api.github.com/scim/v2/organizations/example",
      scimToken: "token",
    });
    expect(github.createOidc).toBe(true);
    expect(github.createScim).toBe(true);
    const ldap = catalogueApplyPlan({ catalogueId: "nextcloud", protocol: "ldap" });
    expect(ldap.ldapLegacy).toBe(true);
  });
});
