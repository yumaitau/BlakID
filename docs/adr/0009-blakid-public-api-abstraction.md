# 0009. BlakID public API abstraction

## Status
Accepted

## Context
Exposing authentik's `/api/v3` as the product contract would freeze us to authentik's internal model and leak engine details to every integration.

## Decision
The public management API is versioned under `/api/v1/*` (`organisations`, `users`, `groups`, `applications`, `roles`, `access-requests`, `service-accounts`, `events`, `integrations`). Health lives at `/api/health` and `/api/ready`. BlakID maps these resources onto authentik and control-plane stores.

## Consequences
- Clients depend on BlakID, not authentik JSON.
- The identity engine can be upgraded (or, in an extreme future, replaced) behind the same contract.
