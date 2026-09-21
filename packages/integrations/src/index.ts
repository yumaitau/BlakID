export type CatalogueProtocol = "oidc" | "saml" | "scim" | "ldap";

export type CatalogueItem = {
  id: string;
  name: string;
  category: "yuma" | "saas" | "cloud" | "self-hosted";
  authentication: CatalogueProtocol[];
  provisioning: CatalogueProtocol[];
  requiredAttributes: string[];
  notes: string;
  milestone: 1 | 2 | 3 | 4;
};

export const CATALOGUE: CatalogueItem[] = [
  { id: "blak-workspace", name: "Blak Workspace", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Yuma collaboration suite.", milestone: 1 },
  { id: "rangeros", name: "RangerOS", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Ranger operations platform.", milestone: 1 },
  { id: "grick", name: "GRiCk", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "Governance and risk.", milestone: 2 },
  { id: "compliance-on-demand", name: "Compliance on Demand", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "Compliance evidence.", milestone: 2 },
  { id: "yumaos", name: "YumaOS", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Yuma operating system.", milestone: 2 },
  { id: "blaksmith", name: "BlakSmith", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "Build and automation.", milestone: 2 },
  { id: "blaktail", name: "BlakTail", category: "yuma", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "Observability.", milestone: 2 },
  { id: "microsoft-365", name: "Microsoft 365", category: "saas", authentication: ["saml", "oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Gallery SAML/OIDC + SCIM. Entra can also federate into BlakID.", milestone: 2 },
  { id: "google-workspace", name: "Google Workspace", category: "saas", authentication: ["oidc", "saml"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "OIDC or SAML. Optional inbound federation.", milestone: 2 },
  { id: "aws", name: "AWS", category: "cloud", authentication: ["saml", "oidc"], provisioning: [], requiredAttributes: ["email", "name"], notes: "IAM Identity Center / SAML.", milestone: 2 },
  { id: "azure", name: "Azure", category: "cloud", authentication: ["oidc", "saml"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Entra enterprise application.", milestone: 2 },
  { id: "github", name: "GitHub", category: "saas", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "OIDC + SCIM for organisations.", milestone: 2 },
  { id: "gitlab", name: "GitLab", category: "saas", authentication: ["oidc", "saml"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "OIDC or SAML.", milestone: 2 },
  { id: "slack", name: "Slack", category: "saas", authentication: ["oidc", "saml"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "SSO + SCIM.", milestone: 2 },
  { id: "cloudflare", name: "Cloudflare", category: "cloud", authentication: ["oidc", "saml"], provisioning: ["scim"], requiredAttributes: ["email", "name", "groups"], notes: "Cloudflare Access / Zero Trust.", milestone: 2 },
  { id: "nextcloud", name: "Nextcloud", category: "self-hosted", authentication: ["oidc", "saml"], provisioning: [], requiredAttributes: ["email", "name"], notes: "Self-hosted files.", milestone: 2 },
  { id: "grafana", name: "Grafana", category: "self-hosted", authentication: ["oidc"], provisioning: [], requiredAttributes: ["email", "name", "groups"], notes: "Generic OAuth.", milestone: 2 },
  { id: "mattermost", name: "Mattermost", category: "self-hosted", authentication: ["oidc", "saml"], provisioning: [], requiredAttributes: ["email", "name"], notes: "Open-source chat.", milestone: 2 },
  { id: "opendesk", name: "openDesk", category: "self-hosted", authentication: ["oidc"], provisioning: ["scim"], requiredAttributes: ["email", "name"], notes: "Sovereign workplace suite.", milestone: 2 },
];

export function getCatalogueItem(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((item) => item.id === id);
}
