import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { getBlakID } from "../../../../lib/blakid.ts";
import { principalFromRequest } from "../../../../lib/principal.ts";
import { sealPrincipal, sessionCookie } from "../../../../lib/session.ts";

export const dynamic = "force-dynamic";

const rpID = () => new URL(process.env.BLAKID_PUBLIC_BASE_URL ?? "http://127.0.0.1:3200").hostname;
const origin = () => process.env.BLAKID_PUBLIC_BASE_URL ?? "http://127.0.0.1:3200";

type StoredPasskey = {
  id: string;
  publicKey: Uint8Array<ArrayBufferLike>;
  counter: number;
  transports?: string[];
};

type Store = {
  challenges: Map<string, string>;
  credentials: Map<string, StoredPasskey[]>;
};

const g = globalThis as typeof globalThis & { __blakidPasskeys?: Store };
function store(): Store {
  if (!g.__blakidPasskeys) g.__blakidPasskeys = { challenges: new Map(), credentials: new Map() };
  return g.__blakidPasskeys;
}

export async function POST(request: Request) {
  const principal = await principalFromRequest(request);
  if (!principal) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json()) as { phase?: string; response?: unknown };
  const saved = store();
  const existing = saved.credentials.get(principal.actorId) ?? [];

  if (body.phase === "register-options") {
    const options = await generateRegistrationOptions({
      rpName: "BlakID",
      rpID: rpID(),
      userName: principal.email,
      userID: new TextEncoder().encode(principal.actorId),
      attestationType: "none",
      excludeCredentials: existing.map((cred) => ({ id: cred.id })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    saved.challenges.set(principal.actorId, options.challenge);
    return Response.json(options);
  }

  if (body.phase === "register-verify") {
    const expectedChallenge = saved.challenges.get(principal.actorId);
    if (!expectedChallenge) return Response.json({ error: "missing challenge" }, { status: 400 });
    const verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
    });
    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: "passkey rejected" }, { status: 400 });
    }
    const info = verification.registrationInfo;
    existing.push({
      id: info.credential.id,
      publicKey: info.credential.publicKey,
      counter: info.credential.counter,
    });
    saved.credentials.set(principal.actorId, existing);
    saved.challenges.delete(principal.actorId);
    return Response.json({ verified: true });
  }

  if (body.phase === "step-up-options") {
    if (existing.length === 0) return Response.json({ error: "register a passkey first" }, { status: 400 });
    const options = await generateAuthenticationOptions({
      rpID: rpID(),
      userVerification: "required",
      allowCredentials: existing.map((cred) => ({ id: cred.id })),
    });
    saved.challenges.set(principal.actorId, options.challenge);
    return Response.json(options);
  }

  if (body.phase === "step-up-verify") {
    const expectedChallenge = saved.challenges.get(principal.actorId);
    const response = body.response as { id?: string };
    const credential = existing.find((cred) => cred.id === response?.id);
    if (!expectedChallenge || !credential) return Response.json({ error: "missing passkey" }, { status: 400 });
    const verification = await verifyAuthenticationResponse({
      response: body.response as never,
      expectedChallenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
      },
    });
    if (!verification.verified) return Response.json({ error: "step-up failed" }, { status: 401 });
    credential.counter = verification.authenticationInfo.newCounter;
    const stepUpUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const token = await sealPrincipal({ ...principal, stepUpUntil });
    getBlakID();
    return new Response(JSON.stringify({ stepUpUntil }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
    });
  }

  return Response.json({ error: "unknown phase" }, { status: 400 });
}
