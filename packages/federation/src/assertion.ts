import { SignJWT, jwtVerify, generateKeyPair, exportJWK, importJWK, decodeJwt, type JWK, type JWTPayload } from "jose";
import { assertNotIndigenousIdentityClaim, type AttributeAssertion } from "@blakid/identity";

export type FederationKeypair = {
  organisationId: string;
  publicJwk: JWK;
  privateJwk: JWK;
  createdAt: string;
};

export type SignedFederationPayload = {
  iss: string;
  aud: string;
  sub: string;
  name?: string;
  attributes: AttributeAssertion[];
};

export async function generateFederationKeypair(organisationId: string, createdAt: string): Promise<FederationKeypair> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  publicJwk.kid = organisationId;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  privateJwk.kid = organisationId;
  privateJwk.alg = "RS256";
  return { organisationId, publicJwk, privateJwk, createdAt };
}

export async function signFederationAssertion(
  keypair: FederationKeypair,
  input: {
    audienceOrgId: string;
    subject: string;
    name?: string;
    attributes: AttributeAssertion[];
    now: Date;
    expiresInSeconds?: number;
  },
): Promise<string> {
  assertNotIndigenousIdentityClaim(input.attributes);
  const key = await importJWK(keypair.privateJwk, "RS256");
  return new SignJWT({
    name: input.name,
    attributes: input.attributes,
    blakid_federation: true,
  })
    .setProtectedHeader({ alg: "RS256", kid: keypair.organisationId, typ: "JWT" })
    .setIssuer(keypair.organisationId)
    .setAudience(input.audienceOrgId)
    .setSubject(input.subject)
    .setIssuedAt(input.now)
    .setExpirationTime(Math.floor(input.now.getTime() / 1000) + (input.expiresInSeconds ?? 300))
    .sign(key);
}

export function peekFederationIssuer(token: string): string {
  const payload = decodeJwt(token);
  if (!payload.iss) throw new Error("federation assertion missing issuer");
  return String(payload.iss);
}

export async function verifyFederationAssertion(
  token: string,
  audienceOrgId: string,
  issuerKey: FederationKeypair,
): Promise<SignedFederationPayload> {
  const key = await importJWK(issuerKey.publicJwk, "RS256");
  const { payload } = await jwtVerify(token, key, {
    audience: audienceOrgId,
    issuer: issuerKey.organisationId,
  });
  return asPayload(payload);
}

function asPayload(payload: JWTPayload): SignedFederationPayload {
  const attributes = Array.isArray(payload.attributes) ? (payload.attributes as AttributeAssertion[]) : [];
  assertNotIndigenousIdentityClaim(attributes);
  return {
    iss: String(payload.iss),
    aud: String(payload.aud),
    sub: String(payload.sub),
    name: typeof payload.name === "string" ? payload.name : undefined,
    attributes,
  };
}
