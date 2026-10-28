import { sign, verify, type KeyObject } from "node:crypto";

/**
 * Compact JWS (RFC 7515) signed with ES256 (ECDSA P-256 + SHA-256), the
 * format of license files. Verification is strict: one algorithm, one token
 * type, a known key id and a 64-byte signature, nothing else is accepted.
 */
export const LICENSE_TOKEN_TYPE = "license+jwt";

export type JwsHeader = { alg: "ES256"; typ: string; kid: string };

export function assertP256(key: KeyObject): void {
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("License signing keys must be EC P-256 keys");
  }
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

export function signEs256(payload: Record<string, unknown>, privateKey: KeyObject, kid: string, typ = LICENSE_TOKEN_TYPE): string {
  if (privateKey.type !== "private") throw new Error("A private key is required to sign");
  assertP256(privateKey);
  const header: JwsHeader = { alg: "ES256", typ, kid };
  const input = `${encode(header)}.${encode(payload)}`;
  const signature = sign("sha256", Buffer.from(input, "ascii"), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Returns the header and payload of a valid token, or null. */
export function verifyEs256(
  token: string,
  publicKeys: ReadonlyMap<string, KeyObject>,
  typ = LICENSE_TOKEN_TYPE,
): { header: JwsHeader; payload: Record<string, unknown> } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || !parts.every((part) => SEGMENT.test(part))) return null;
  const header = decodeJson(parts[0]);
  if (!isObject(header) || header.alg !== "ES256" || header.typ !== typ || typeof header.kid !== "string") return null;
  if ("crit" in header) return null;
  const key = publicKeys.get(header.kid);
  if (!key) return null;
  const signature = Buffer.from(parts[2], "base64url");
  if (signature.length !== 64) return null;
  const valid = verify(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"),
    { key, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!valid) return null;
  const payload = decodeJson(parts[1]);
  if (!isObject(payload)) return null;
  return { header: header as JwsHeader, payload };
}
