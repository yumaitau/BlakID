# BlakID

Sovereign identity infrastructure operated by Yuma IT for Indigenous organisations, ranger groups, community-controlled organisations, schools, health services and other trusted community institutions.

**Community-controlled identity. Australian-hosted infrastructure. Open standards. No identity lock-in.**

authentik is the identity engine. BlakID is the product around it: dedicated stacks, control plane, organisation administration, user portal, lifecycle, support access, and a public API that does not expose authentik internals.

Possessing a BlakID never proves Aboriginal or Torres Strait Islander identity. Membership and authority stay with the organisations that issue them.

## Stack

- Next.js 16, TypeScript, App Router, Tailwind, Zod
- Control-plane metadata: PostgreSQL + Drizzle
- Identity engine: pinned `ghcr.io/goauthentik/server:2026.8.3`
- Dedicated authentik + PostgreSQL per organisation
- Default region: AWS `ap-southeast-2` (Australia — Sydney)

## Development

```bash
pnpm install
cp .env.example .env
pnpm test
pnpm dev
```

Sign in as a Yuma operator with `josh@yuma.example` / `change-me-operator` (memory runtime bootstrap). Provision an organisation from `/operator/organisations/new`.

Dedicated authentik stacks:

```bash
docker compose -f infrastructure/docker/compose.yaml up -d control-plane-db
# Tenant stacks are written under infrastructure/docker/tenants/ (gitignored)
```

## API

- `GET /api/health`
- `GET /api/ready`
- `/api/v1/organisations|users|groups|applications|roles|access-requests|service-accounts|events|integrations`

## Docs

- [Architecture](docs/architecture/overview.md)
- [Threat model](docs/security/threat-model.md)
- [ADRs](docs/adr/)
- [Backups](docs/operations/backup.md)
