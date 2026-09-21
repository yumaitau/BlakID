# authentik upgrades

Pinned in `packages/config/src/index.ts` as `AUTHENTIK_VERSION`.

1. Read upstream release notes.
2. Update the pin.
3. Run unit tests.
4. Run authentik integration tests against two dedicated stacks.
5. Stage.
6. Canary a volunteer organisation.
7. Production rollout.

Never deploy an untested `latest` tag.
