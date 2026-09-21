# BlakID

Sovereign identity infrastructure operated by Yuma IT for Indigenous organisations, ranger groups, community-controlled organisations, schools, health services and other trusted community institutions.

**Community-controlled identity. Australian-hosted infrastructure. Open standards. No identity lock-in.**

authentik is the identity engine. BlakID is the product around it: dedicated stacks, control plane, organisation administration, user portal, lifecycle, support access, and a public API that does not expose authentik internals.

Possessing a BlakID never proves Aboriginal or Torres Strait Islander identity. Membership and authority stay with the organisations that issue them.

## Stack

- Next.js 16, TypeScript, App Router, Tailwind, Zod
- Control-plane metadata: PostgreSQL + Drizzle
- Identity engine: pinned `ghcr.io/goauthentik/server@sha256:ab9b4e8cc4ab3f8d1198d2db6aeea66bafea1963b3f2843589e0d163f97d9849` (tag 2026.8.3)
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

## What ships

- Milestone 1: dedicated authentik stack, OIDC + PKCE, passkey/TOTP enrolment, lifecycle, audit, support access
- Milestone 2: SAML, catalogue, Entra/Google/OIDC/SAML sources, SCIM (no silent delete), delegated admins, security findings
- Milestone 3: temporary access, service and Hermes agent identities, signed webhooks, syslog/CSV/JSON export, MCP with write approval, bring-your-own-cloud role
- Milestone 4: pairwise signed federation. No global trust. A BlakID never proves Indigenous identity

## API

- `GET /api/health`
- `GET /api/ready`
- `/api/v1/organisations|users|groups|applications|roles|access-requests|service-accounts|agents|events|integrations|federation|webhooks|support-access|security`
- `POST /api/mcp` (JSON-RPC `tools/list`, `tools/call`)
- `/api/scim/v2/Users`
- `POST /api/auth/passkey` phases `register-options`, `register-verify`, `step-up-options`, `step-up-verify`
- `GET /api/v1/evidence` for an organisation administrator
- Public disclosure: `/security`

Audit export: `GET /api/v1/events?format=json|csv|syslog`

## Licence

Copyright (c) 2026 Yuma IT. Source is public. Redistribution requires a written licence. See [LICENSE](LICENSE).

## Docs

- [Architecture](docs/architecture/overview.md)
- [Threat model](docs/security/threat-model.md)
- [ADRs](docs/adr/)
- [Backups](docs/operations/backup.md)
- [Bring-your-own-cloud](docs/operations/byoc.md)
