# Architecture

```
BlakID control plane + console + portal
        │
        ├── organisation A ── authentik + Postgres + Redis
        ├── organisation B ── authentik + Postgres + Redis
        └── organisation C ── authentik + Postgres + Redis
```

- Control plane metadata database is not a user directory.
- Public API: `/api/v1/*`, `/api/health`, `/api/ready`.
- Identity engine image pin: `ghcr.io/goauthentik/server:2026.8.3` in `packages/config`.
- Local runtime may use in-memory authentik stand-ins for unit tests; Compose dedicated stacks for integration.
