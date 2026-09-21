# 0006. Support access model

## Status
Accepted

## Context
Customers will need Yuma's help. Permanent super-admin access would violate delegated administration and create an insider threat the size of the platform.

## Decision
Support access is a workflow: request (with reason) → customer approval → scoped temporary session → automatic expiry → retained audit trail → later review. Break-glass still requires a reason, strong authentication, an alert, logging, expiry and review. Support scopes cannot include impersonation or credential read.

## Consequences
- Operators cannot start a support session until the organisation approves it.
- Expiry is enforced in the grant; expired grants fail authorisation.
- All transitions emit `support.access.*` audit events.
