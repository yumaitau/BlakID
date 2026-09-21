import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import type { Principal } from "@blakid/authz";

const COOKIE = "blakid_session";

function secret() {
  const value = process.env.BLAKID_SESSION_SECRET ?? "dev-only-blakid-session-secret-change";
  return new TextEncoder().encode(value.padEnd(32, "0").slice(0, 32));
}

export async function sealPrincipal(principal: Principal): Promise<string> {
  return new EncryptJWT({ principal } as JWTPayload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .encrypt(secret());
}

export async function unsealPrincipal(token: string): Promise<Principal | null> {
  try {
    const { payload } = await jwtDecrypt(token, secret());
    return (payload as { principal?: Principal }).principal ?? null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  const secure =
    process.env.BLAKID_ENV === "production" || (process.env.BLAKID_PUBLIC_BASE_URL ?? "").startsWith("https://")
      ? "; Secure"
      : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionCookie(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  const match = parts.find((p) => p.startsWith(`${COOKIE}=`));
  return match ? match.slice(COOKIE.length + 1) : null;
}

export { COOKIE as SESSION_COOKIE };
