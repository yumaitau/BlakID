# 0007. No global Indigenous identity claim

## Status
Accepted

## Context
A platform that treated "has a BlakID" as proof of Aboriginal or Torres Strait Islander identity would centralise cultural authority in Yuma. That is the opposite of community-controlled identity.

## Decision
Possessing a BlakID never proves Aboriginal or Torres Strait Islander identity. Membership, affiliation and authority are organisation-defined attributes with provenance (`issuer`, `issued_at`, `expires_at`, `assurance`). The platform refuses global claims such as `is_indigenous`.

## Consequences
- Attribute assertions can support future pairwise federation without a national identity database.
- Organisations remain the issuers of community membership.
