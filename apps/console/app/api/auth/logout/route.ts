import { clearSessionCookie } from "../../../../lib/session.ts";

export async function POST(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const headers = new Headers({ "Set-Cookie": clearSessionCookie() });
  if (accept.includes("application/json")) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  headers.set("Location", "/sign-in");
  return new Response(null, { status: 303, headers });
}
