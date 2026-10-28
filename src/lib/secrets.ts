import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "./env";

/** Lookup value for a license key. The key itself is never stored in the clear. */
export function keyHash(canonicalKey: string): string {
  return createHmac("sha256", Buffer.from(env().KEY_HMAC_SECRET, "base64"))
    .update(canonicalKey, "utf8")
    .digest("base64url");
}

const ENCRYPTION_VERSION = "v1";

function encryptionKey(): Buffer {
  return Buffer.from(env().KEY_ENCRYPTION_KEY, "base64");
}

/**
 * AES-256-GCM copy of a license key, so an administrator can show it again.
 * The license id is authenticated with it: a copy moved to another row fails
 * to decrypt.
 */
export function encryptLicenseKey(canonicalKey: string, licenseId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`license-key:${licenseId}`, "utf8"));
  const data = Buffer.concat([cipher.update(canonicalKey, "utf8"), cipher.final()]);
  return [ENCRYPTION_VERSION, iv, data, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptLicenseKey(stored: string, licenseId: string): string {
  const [version, iv, data, tag] = stored.split(".");
  if (version !== ENCRYPTION_VERSION || !iv || !data || !tag) throw new Error("Unrecognised encrypted key");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`license-key:${licenseId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Random URL-safe token for sessions and reset links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** What is stored for a session or reset token: its SHA-256. */
export function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}
