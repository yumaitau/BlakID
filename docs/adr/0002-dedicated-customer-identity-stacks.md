# 0002. Dedicated customer identity stacks

## Status
Accepted

## Context
Security isolation is more important than packing tenants into one database. A shared identity store would make tenant escape, backup theft and insider access far more damaging.

## Decision
MVP default is a dedicated authentik + PostgreSQL (and Redis, required by authentik) deployment per customer organisation. Each customer has independent database, secrets, encryption keys, hostname, backups, administrators, policies, audit boundary, configuration and signing certificates.

Hostnames: `{slug}.id.blakid.au` or a customer-owned domain.

## Consequences
- Higher infrastructure cost and slower cold provision than a shared schema.
- Tenant-isolation tests are release blockers.
- Control-plane metadata never becomes the user directory.
