import { MATRIX } from "./matrix.ts";
import {
  ForbiddenError,
  TenantIsolationError,
  type Principal,
} from "./principal.ts";
import type { Permission } from "./roles.ts";

const PLATFORM_ONLY: ReadonlySet<Permission> = new Set([
  "platform.organisations.provision",
  "platform.organisations.read",
  "platform.deployments.manage",
  "platform.health.read",
  "platform.backups.manage",
  "platform.incidents.respond",
  "support.request",
]);

function grantAllows(principal: Principal, permission: Permission, organisationId: string | null): boolean {
  const grant = principal.supportGrant;
  if (!grant) return false;
  if (new Date(grant.expiresAt).getTime() <= Date.now()) return false;
  if (organisationId && grant.organisationId !== organisationId) return false;
  return grant.scopes.includes(permission);
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  if (MATRIX[permission].includes(principal.role)) return true;
  if (principal.supportGrant && grantAllows(principal, permission, principal.supportGrant.organisationId)) {
    return true;
  }
  return false;
}

export function authorize(
  principal: Principal,
  permission: Permission,
  organisationId: string | null,
): void {
  if (PLATFORM_ONLY.has(permission)) {
    if (!hasPermission(principal, permission)) {
      throw new ForbiddenError(`Missing permission ${permission}`);
    }
    return;
  }

  if (organisationId) {
    const inOrg = principal.organisationId === organisationId;
    const grant = principal.supportGrant;
    const grantForOrg =
      Boolean(grant) &&
      grant!.organisationId === organisationId &&
      new Date(grant!.expiresAt).getTime() > Date.now();
    if (!inOrg && !grantForOrg) {
      throw new TenantIsolationError(
        `Principal ${principal.actorId} cannot access organisation ${organisationId}`,
      );
    }
  }

  if (!hasPermission(principal, permission) && !grantAllows(principal, permission, organisationId)) {
    throw new ForbiddenError(`Missing permission ${permission}`);
  }
}

export function assertSameOrganisation(principal: Principal, organisationId: string): void {
  if (principal.supportGrant?.organisationId === organisationId) {
    if (new Date(principal.supportGrant.expiresAt).getTime() > Date.now()) return;
  }
  if (principal.organisationId !== organisationId) {
    throw new TenantIsolationError(
      `Principal ${principal.actorId} cannot access organisation ${organisationId}`,
    );
  }
}
