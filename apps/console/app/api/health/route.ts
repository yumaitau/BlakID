import { AUTHENTIK_VERSION, DEFAULT_REGION } from "@blakid/config";
import { getBlakID } from "../../../lib/blakid.ts";

export async function GET() {
  const app = getBlakID();
  const health = await app.health();
  return Response.json({
    status: "ok",
    service: "blakid-control-plane",
    region: DEFAULT_REGION,
    authentik: AUTHENTIK_VERSION,
    identityEngine: "authentik",
    tenants: health.tenants,
  });
}
