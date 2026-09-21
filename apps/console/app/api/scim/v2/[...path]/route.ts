import { z } from "zod";
import { sharedRateLimiter } from "@blakid/guard";
import { scimUserToResource } from "@blakid/scim";
import { getBlakID } from "../../../../../lib/blakid.ts";

export const dynamic = "force-dynamic";

function limited(request: Request): Response | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const hit = sharedRateLimiter().hit(`scim:${ip}`);
  if (!hit.ok) return Response.json({ detail: "rate limit" }, { status: 429 });
  return null;
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = bearer(request);
  if (!token) return Response.json({ detail: "unauthorized" }, { status: 401 });
  const { path } = await context.params;
  const app = getBlakID();
  try {
    const users = await app.scimUsers(token);
    if (path[0] === "Users" && path[1]) {
      const user = users.find((u) => u.id === path[1]);
      if (!user) return Response.json({ detail: "not found" }, { status: 404 });
      return Response.json(scimUserToResource(user));
    }
    return Response.json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.length,
      Resources: users.map(scimUserToResource),
    });
  } catch (error) {
    return Response.json({ detail: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const blocked = limited(request);
  if (blocked) return blocked;
  const token = bearer(request);
  if (!token) return Response.json({ detail: "unauthorized" }, { status: 401 });
  const body = z
    .object({
      userName: z.string().optional(),
      displayName: z.string().optional(),
      active: z.boolean().optional(),
      emails: z.array(z.object({ value: z.string(), primary: z.boolean().optional() })).optional(),
      name: z.object({ formatted: z.string().optional() }).optional(),
    })
    .parse(await request.json());
  try {
    const result = await getBlakID().handleInboundScim(token, "create", body);
    return Response.json(scimUserToResource(result.user), { status: 201 });
  } catch (error) {
    return Response.json({ detail: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = bearer(request);
  if (!token) return Response.json({ detail: "unauthorized" }, { status: 401 });
  const { path } = await context.params;
  const id = path.at(-1);
  const body = (await request.json()) as { Operations?: Array<{ op: string; value: { active?: boolean } }>; active?: boolean };
  const active = body.active ?? body.Operations?.find((op) => "active" in (op.value ?? {}))?.value.active;
  try {
    const result = await getBlakID().handleInboundScim(token, "patch", { id, active });
    return Response.json(scimUserToResource(result.user));
  } catch (error) {
    return Response.json({ detail: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = bearer(request);
  if (!token) return Response.json({ detail: "unauthorized" }, { status: 401 });
  const { path } = await context.params;
  try {
    await getBlakID().handleInboundScim(token, "delete", { id: path.at(-1) });
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ detail: error instanceof Error ? error.message : "error" }, { status: 400 });
  }
}
