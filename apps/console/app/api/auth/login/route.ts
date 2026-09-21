import { z } from "zod";
import { sharedRateLimiter } from "@blakid/guard";
import { createTestPrincipal } from "@blakid/control-plane";
import { getBlakID } from "../../../../lib/blakid.ts";
import { requestContext } from "../../../../lib/principal.ts";
import { sealPrincipal, sessionCookie } from "../../../../lib/session.ts";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organisationSlug: z.string().optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limited = sharedRateLimiter().hit(`login:${ip}`);
  if (!limited.ok) {
    return Response.json({ error: "Too many sign-in attempts" }, { status: 429, headers: { "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)) } });
  }
  const body = schema.parse(await request.json());
  const bootstrapEmail = process.env.BLAKID_BOOTSTRAP_OPERATOR_EMAIL ?? "josh@yuma.example";
  const bootstrapPassword = process.env.BLAKID_BOOTSTRAP_OPERATOR_PASSWORD ?? "change-me-operator";
  const ctx = requestContext(request);

  if (!body.organisationSlug && body.email === bootstrapEmail && body.password === bootstrapPassword) {
    const principal = createTestPrincipal({
      role: "YUMA_PLATFORM_OPERATOR",
      organisationId: null,
      email: bootstrapEmail,
      name: process.env.BLAKID_BOOTSTRAP_OPERATOR_NAME ?? "Josh",
      actorId: "operator-bootstrap",
    });
    const token = await sealPrincipal(principal);
    return new Response(JSON.stringify({ principal, redirect: "/operator" }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(token),
      },
    });
  }

  if (!body.organisationSlug) {
    return Response.json({ error: "organisationSlug required for organisation sign-in" }, { status: 400 });
  }

  const app = getBlakID();
  const org = await app.store.getOrganisationBySlug(body.organisationSlug);
  if (!org) return Response.json({ error: "Unknown organisation" }, { status: 404 });
  try {
    const result = await app.loginWithPassword(org.id, body.email, body.password, ctx);
    const members = await app.store.listMembers(org.id);
    const member = members.find((m) => m.email === body.email.toLowerCase());
    const principal = createTestPrincipal({
      role: member?.role ?? "USER",
      organisationId: org.id,
      email: result.user.email,
      name: result.user.name,
      actorId: result.user.id,
      sessionId: result.session.id,
    });
    const token = await sealPrincipal(principal);
    const redirect = principal.role === "USER" ? "/portal" : `/o/${org.slug}`;
    return new Response(JSON.stringify({ principal, redirect }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(token),
      },
    });
  } catch {
    return Response.json({ error: "Sign-in failed" }, { status: 401 });
  }
}
