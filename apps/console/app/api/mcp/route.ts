import { z } from "zod";
import { MCP_TOOLS } from "@blakid/mcp";
import { getBlakID } from "../../../lib/blakid.ts";
import { principalFromRequest } from "../../../lib/principal.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tools: MCP_TOOLS });
}

export async function POST(request: Request) {
  const principal = await principalFromRequest(request);
  if (!principal) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = z
    .object({
      tool: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional(),
      organisationId: z.string().optional(),
    })
    .parse(await request.json());
  const organisationId = body.organisationId ?? principal.organisationId;
  if (!organisationId) return Response.json({ error: "organisationId required" }, { status: 400 });
  try {
    const result = await getBlakID().invokeMcp(principal, organisationId, body.tool, body.arguments ?? {});
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}
