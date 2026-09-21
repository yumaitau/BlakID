# Control plane

Operator console and `/api/v1` live in `apps/console` for the MVP single origin (`console.blakid.au` in production). Domain logic is `packages/control-plane`. This folder exists so the documented layout stays obvious: Yuma operators work here, not in customer directories.
