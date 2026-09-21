import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

export type Sealed = {
  ciphertext: string;
  keyId: string;
  createdAt: string;
};

export interface KeyVault {
  readonly keyId: string;
  encrypt(plaintext: string, now?: Date): Promise<Sealed>;
  decrypt(sealed: Sealed): Promise<string>;
}

export class ProductionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionKeyError";
  }
}

/** Local AES-256-GCM. Production must name a KMS key; this vault refuses to impersonate KMS. */
export class AesGcmVault implements KeyVault {
  readonly keyId: string;
  private readonly key: Buffer;

  constructor(keyMaterial: string, keyId = "local-aes") {
    this.keyId = keyId;
    this.key = createHash("sha256").update(keyMaterial).digest();
  }

  async encrypt(plaintext: string, now = new Date()): Promise<Sealed> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([iv, tag, body]).toString("base64url");
    return { ciphertext, keyId: this.keyId, createdAt: now.toISOString() };
  }

  async decrypt(sealed: Sealed): Promise<string> {
    if (sealed.keyId !== this.keyId) throw new Error(`Unknown key ${sealed.keyId}`);
    const raw = Buffer.from(sealed.ciphertext, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }
}

export function vaultFromEnv(env: NodeJS.ProcessEnv = process.env): KeyVault {
  if (env.BLAKID_ENV === "production" && !env.BLAKID_KMS_KEY_ID) {
    throw new ProductionKeyError("Production requires BLAKID_KMS_KEY_ID. Refusing to store signing keys with a local key.");
  }
  if (env.BLAKID_KMS_KEY_ID) {
    const material = env.BLAKID_KMS_DATA_KEY;
    if (!material) {
      throw new ProductionKeyError("BLAKID_KMS_KEY_ID is set but BLAKID_KMS_DATA_KEY is missing. Wrap a data key with KMS and inject it.");
    }
    return new AesGcmVault(material, env.BLAKID_KMS_KEY_ID);
  }
  return new AesGcmVault(env.BLAKID_DATA_KEY ?? "dev-only-data-key-not-for-production", "local-dev");
}

export function signingKeyExpired(createdAt: string | null | undefined, now: Date, maxAgeDays: number): boolean {
  if (!createdAt) return true;
  return now.getTime() - new Date(createdAt).getTime() > maxAgeDays * 86400000;
}
