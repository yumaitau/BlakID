import { z } from "zod";
import { isJsonRpc, MCP_TOOLS, mcpToolDescriptors } from "@blakid/mcp";
import { getBlakID } from "../../../lib/blakid.ts";
import { principalFromRequest } from "../../../lib/principal.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tools: MCP_TOOLS, protocol: "mcp", jsonrpc: "2.0" });
}

export async function POST(request: Request) {
  const principal = await principalFromRequest(request);
  if (!principal) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const raw = await request.json();
  const organisationId =
    (typeof raw.organisationId === "string" ? raw.organisationId : null) ??
    (typeof raw.params?.organisationId === "string" ? raw.params.organisationId : null) ??
    principal.organisationId;
  if (!organisationId) return Response.json({ error: "organisationId required" }, { status: 400 });
  const app = getBlakID();
  try {
    if (isJsonRpc(raw)) {
      if (raw.method === "tools/list") {
        return Response.json({ jsonrpc: "2.0", id: raw.id ?? null, result: { tools: mcpToolDescriptors() } });
      }
      if (raw.method === "tools/call") {
        const name = String(raw.params?.name ?? "");
        const result = await app.invokeMcp(principal, organisationId, name, raw.params?.arguments ?? {});
        return Response.json({ jsonrpc: "2.0", id: raw.id ?? null, result });
      }
      return Response.json(
        { jsonrpc: "2.0", id: raw.id ?? null, error: { code: -32601, message: `Unknown method ${raw.method}` } },
        { status: 400 },
      );
    }
    const body = z
      .object({
        tool: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional(),
        organisationId: z.string().optional(),
      })
      .parse(raw);
    const result = await app.invokeMcp(principal, organisationId, body.tool, body.arguments ?? {});
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}
