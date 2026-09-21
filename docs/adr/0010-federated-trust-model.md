# 0010. Federated trust model

## Status
Accepted (design for MVP; implementation is Milestone 4)

## Context
Indigenous organisations may need to recognise each other's identities for partnerships. A single database of every Indigenous person's identity would create a central authority nobody asked for.

## Decision
BlakID Federation is pairwise and explicit. Organisation A decides whether it trusts Organisation B and for which attributes (identity, email, membership) and which it refuses (administrator role, financial authority). There is no universal trust mesh. Signed assertions carry provenance. Yuma is not an identity authority.

Inbound federation from Entra, Google, OIDC and SAML is a customer choice (BlakID in front, or BlakID as primary). That inbound work is Milestone 2; the pairwise BlakID-to-BlakID network is Milestone 4.

## Consequences
- MVP documents the model and refuses global trust flags.
- Future trust policies are organisation-scoped, not platform-scoped.
