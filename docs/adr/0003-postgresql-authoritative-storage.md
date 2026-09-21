# 0003. PostgreSQL is authoritative storage

## Status
Accepted

## Context
authentik already stores identities in PostgreSQL. The control plane also needs durable metadata (organisations, deployments, support sessions, aggregated audit).

## Decision
PostgreSQL is the authoritative store for:
- Per-tenant identity data, inside that tenant's authentik database.
- Control-plane metadata, in a separate database that contains no user passwords or authentik credentials at rest in plaintext.

Redis is used only because authentik requires it, never as a source of truth.

## Consequences
- Backups are PostgreSQL dumps plus configuration, kept in the sovereignty region.
- Control-plane DB compromise does not yield the identity directory.
