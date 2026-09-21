# 0005. Control plane separation

## Status
Accepted

## Context
Yuma operates BlakID infrastructure. Customers must control their people. Mixing those concerns in one directory recreates the SaaS lock-in BlakID exists to avoid.

## Decision
The Yuma-operated control plane provisions organisations, watches health, manages versions, backups, domains, branding templates and operator accounts. It is not the authoritative user directory. Each organisation identity environment remains authoritative for its identities.

## Consequences
- APIs that list users always go through the organisation's authentik client.
- Platform operators have no standing identity-write permissions.
- Public `/api/v1` hides authentik's internal API shape.
