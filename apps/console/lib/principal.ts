import type { Principal } from "@blakid/authz";
import { readSessionCookie, unsealPrincipal } from "./session.ts";

export async function principalFromRequest(request: Request): Promise<Principal | null> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    const bearer = request.headers.get("authorization");
    if (bearer?.startsWith("Bearer ")) {
      return unsealPrincipal(bearer.slice(7));
    }
    return null;
  }
  return unsealPrincipal(token);
}

export function requestContext(request: Request) {
  return {
    sourceIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}
