import "server-only";
import { createPrivateKey, createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";
import { env, licenseIssuer } from "./env";
import { assertP256, signEs256, verifyEs256 } from "./jws";
import type { MachineIds } from "./machine";

/**
 * Claims of a license file. Products verify the signature with the public key
 * they were built with, then compare `mch.ids` with the computer they run on.
 */
export type LicenseClaims = {
  /** This server, e.g. https://license.enerceon.com */
  iss: string;
  /** Product code, e.g. ENERCEON. */
  aud: string;
  /** License id. */
  sub: string;
  /** Activation id: one per computer. */
  jti: string;
  iat: number;
  /** Format version of these claims. */
  ver: 1;
  /** "perpetual" in phase 1. */
  kind: string;
  cus: { id: string; name: string };
  /** Last group of the key, to tell keys apart in support conversations. */
  key: string;
  mch: { fpv: number; ids: MachineIds; name: string };
};

let signingKeyCache: { pem: string; key: KeyObject } | undefined;

export function signingKey(): KeyObject {
  const pem = env().LICENSE_SIGNING_KEY;
  if (signingKeyCache?.pem !== pem) {
    const key = createPrivateKey(pem);
    assertP256(key);
    signingKeyCache = { pem, key };
  }
  return signingKeyCache.key;
}

export function issueLicenseToken(claims: Omit<LicenseClaims, "iss" | "ver" | "iat">, now = new Date()): string {
  const payload: LicenseClaims = {
    iss: licenseIssuer(),
    aud: claims.aud,
    sub: claims.sub,
    jti: claims.jti,
    iat: Math.floor(now.getTime() / 1000),
    ver: 1,
    kind: claims.kind,
    cus: claims.cus,
    key: claims.key,
    mch: claims.mch,
  };
  return signEs256(payload, signingKey(), env().LICENSE_SIGNING_KID);
}

/** The public half of the signing key as a JWK, as products embed it. */
export function publicSigningJwk(): JsonWebKey & { kid: string; alg: "ES256"; use: "sig" } {
  const { kty, crv, x, y } = createPublicKey(signingKey()).export({ format: "jwk" });
  return { kty, crv, x, y, kid: env().LICENSE_SIGNING_KID, alg: "ES256", use: "sig" };
}

/** Checks a license file issued by this server (used by tests and support tools). */
export function verifyLicenseToken(token: string): LicenseClaims | null {
  const keys = new Map([[env().LICENSE_SIGNING_KID, createPublicKey(signingKey())]]);
  const verified = verifyEs256(token, keys);
  if (!verified || verified.payload.iss !== licenseIssuer()) return null;
  return verified.payload as LicenseClaims;
}
