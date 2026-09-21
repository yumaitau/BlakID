/** Single pin for upstream authentik. Never float a latest tag in production. */
export const AUTHENTIK_VERSION = "2026.8.3";
/** Multi-arch index digest for ghcr.io/goauthentik/server:2026.8.3. */
export const AUTHENTIK_IMAGE_DIGEST =
  "sha256:ab9b4e8cc4ab3f8d1198d2db6aeea66bafea1963b3f2843589e0d163f97d9849";
export const AUTHENTIK_IMAGE = `ghcr.io/goauthentik/server@${AUTHENTIK_IMAGE_DIGEST}`;
export const POSTGRES_IMAGE = "postgres:16-alpine";
export const REDIS_IMAGE = "redis:7-alpine";

export const DEFAULT_REGION = "ap-southeast-2";
export const DEFAULT_REGION_LABEL = "Australia — Sydney";
export const PRODUCT_DOMAIN = "blakid.au";
export const TENANT_HOST_SUFFIX = "id.blakid.au";

export const PALETTE = {
  background: "#11100F",
  surface: "#191715",
  surfaceRaised: "#221F1C",
  primary: "#D74C2E",
  sand: "#D7C1A1",
  text: "#F5F1EA",
  muted: "#968E84",
  success: "#5A8B62",
  warning: "#C58C42",
  danger: "#B9473E",
} as const;

export const PASSKEY_ENROL_SLUG = "blakid-passkey-enrol";
export const TOTP_ENROL_SLUG = "blakid-totp-enrol";

export function authentikFlowUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/if/flow/${slug}/`;
}

export const RETENTION = {
  archivedDaysBeforeDelete: 90,
  supportSessionMinutes: 60,
  invitationDays: 14,
  accessTokenMinutes: 10,
  refreshTokenDays: 1,
  sessionHours: 12,
  signingKeyMaxAgeDays: 90,
  stepUpMinutes: 10,
} as const;

export const HOSTING_MODELS = [
  "blakid_australian_cloud",
  "customer_aws",
  "self_hosted",
] as const;

export type HostingModel = (typeof HOSTING_MODELS)[number];
