import {
  OPERATOR_FORBIDDEN,
  type Permission,
  type Role,
} from "./roles.ts";

const orgAdmins: Role[] = [
  "ORGANISATION_OWNER",
  "IDENTITY_ADMINISTRATOR",
];

export const MATRIX: Record<Permission, readonly Role[]> = {
  "platform.organisations.provision": ["YUMA_PLATFORM_OPERATOR"],
  "platform.organisations.read": ["YUMA_PLATFORM_OPERATOR"],
  "platform.deployments.manage": ["YUMA_PLATFORM_OPERATOR"],
  "platform.health.read": ["YUMA_PLATFORM_OPERATOR"],
  "platform.backups.manage": ["YUMA_PLATFORM_OPERATOR"],
  "platform.incidents.respond": ["YUMA_PLATFORM_OPERATOR"],
  "identity.users.read": [
    "ORGANISATION_OWNER",
    "IDENTITY_ADMINISTRATOR",
    "HELPDESK_ADMINISTRATOR",
    "AUDITOR",
    "SECURITY_ADMINISTRATOR",
    "APPLICATION_ADMINISTRATOR",
  ],
  "identity.users.write": orgAdmins,
  "identity.users.suspend": [
    "ORGANISATION_OWNER",
    "IDENTITY_ADMINISTRATOR",
    "HELPDESK_ADMINISTRATOR",
  ],
  "identity.users.terminate": ["ORGANISATION_OWNER", "IDENTITY_ADMINISTRATOR"],
  "identity.memberships.write": orgAdmins,
  "identity.impersonate": [],
  "identity.credentials.read": [],
  "identity.sessions.revoke": [
    "ORGANISATION_OWNER",
    "IDENTITY_ADMINISTRATOR",
    "SECURITY_ADMINISTRATOR",
    "HELPDESK_ADMINISTRATOR",
  ],
  "applications.read": [
    "ORGANISATION_OWNER",
    "APPLICATION_ADMINISTRATOR",
    "AUDITOR",
    "SECURITY_ADMINISTRATOR",
    "IDENTITY_ADMINISTRATOR",
    "USER",
  ],
  "applications.write": ["ORGANISATION_OWNER", "APPLICATION_ADMINISTRATOR"],
  "applications.access.grant": [
    "ORGANISATION_OWNER",
    "APPLICATION_ADMINISTRATOR",
  ],
  "audit.read": [
    "ORGANISATION_OWNER",
    "SECURITY_ADMINISTRATOR",
    "AUDITOR",
    "IDENTITY_ADMINISTRATOR",
  ],
  "audit.export": ["ORGANISATION_OWNER", "SECURITY_ADMINISTRATOR", "AUDITOR"],
  "support.request": ["YUMA_PLATFORM_OPERATOR"],
  "support.approve": ["ORGANISATION_OWNER", "SECURITY_ADMINISTRATOR"],
  "support.use": [],
  "organisation.settings.write": ["ORGANISATION_OWNER"],
  "organisation.branding.write": ["ORGANISATION_OWNER"],
};

export function assertIndependenceGuard(
  matrix: Record<Permission, readonly Role[]> = MATRIX,
): void {
  for (const permission of OPERATOR_FORBIDDEN) {
    const holders = matrix[permission] ?? [];
    if (holders.includes("YUMA_PLATFORM_OPERATOR")) {
      throw new Error(
        `Independence guard failed: YUMA_PLATFORM_OPERATOR must not hold ${permission}`,
      );
    }
  }
}

assertIndependenceGuard();
