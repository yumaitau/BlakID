export { authorize, assertSameOrganisation, hasPermission } from "./authorize.ts";
export { assertIndependenceGuard, MATRIX } from "./matrix.ts";
export {
  ForbiddenError,
  TenantIsolationError,
  type ActorType,
  type Principal,
  type SupportGrant,
} from "./principal.ts";
export {
  OPERATOR_FORBIDDEN,
  PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
} from "./roles.ts";
