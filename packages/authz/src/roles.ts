export const ROLES = [
  "YUMA_PLATFORM_OPERATOR",
  "ORGANISATION_OWNER",
  "IDENTITY_ADMINISTRATOR",
  "APPLICATION_ADMINISTRATOR",
  "SECURITY_ADMINISTRATOR",
  "HELPDESK_ADMINISTRATOR",
  "AUDITOR",
  "USER",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "platform.organisations.provision",
  "platform.organisations.read",
  "platform.deployments.manage",
  "platform.health.read",
  "platform.backups.manage",
  "platform.incidents.respond",
  "identity.users.read",
  "identity.users.write",
  "identity.users.suspend",
  "identity.users.terminate",
  "identity.memberships.write",
  "identity.impersonate",
  "identity.credentials.read",
  "identity.sessions.revoke",
  "applications.read",
  "applications.write",
  "applications.access.grant",
  "audit.read",
  "audit.export",
  "support.request",
  "support.approve",
  "support.use",
  "organisation.settings.write",
  "organisation.branding.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions a Yuma platform operator must never receive automatically. */
export const OPERATOR_FORBIDDEN: readonly Permission[] = [
  "identity.users.write",
  "identity.users.suspend",
  "identity.users.terminate",
  "identity.memberships.write",
  "identity.impersonate",
  "identity.credentials.read",
  "applications.access.grant",
];
