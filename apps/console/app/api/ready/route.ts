import { getBlakID } from "../../../lib/blakid.ts";

export async function GET() {
  const ready = await getBlakID().ready();
  const status = ready.status === "ready" ? 200 : 503;
  return Response.json(
    {
      status: ready.status,
      tenants: ready.tenants,
    },
    { status },
  );
}
