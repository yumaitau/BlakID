# 0010. Federated trust model

## Status
Accepted (Milestone 4 foundations implemented: pairwise trust policies and signed assertions)

## Context
Indigenous organisations may need to recognise each other's identities for partnerships. A single database of every Indigenous person's identity would create a central authority nobody asked for.

## Decision
BlakID Federation is pairwise and explicit. Organisation A decides whether it trusts Organisation B and for which attributes (identity, email, membership) and which it refuses (administrator role, financial authority). There is no universal trust mesh. Signed assertions carry provenance. Yuma is not an identity authority.

Inbound federation from Entra, Google, OIDC and SAML is a customer choice (BlakID in front, or BlakID as primary). That inbound work is Milestone 2; the pairwise BlakID-to-BlakID network is Milestone 4.

## Consequences
- Organisations issue RS256-signed assertions and peers verify them against explicit trust policies.
- Global trust flags (`*`, `global`) are rejected.
- Future trust policies stay organisation-scoped, not platform-scoped.
