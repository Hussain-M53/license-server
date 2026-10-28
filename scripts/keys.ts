import { createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

export type PublicKeyring = {
  issuer: string;
  keys: { kty: string; crv: string; x: string; y: string; kid: string; alg: "ES256"; use: "sig" }[];
};

export function newSigningKey(): { privateKey: KeyObject; pem: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey, pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

/** The form products embed: issuer plus public JWKs. */
export function publicKeyring(issuer: string, kid: string, privateKey: KeyObject): PublicKeyring {
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  return { issuer, keys: [{ kty: jwk.kty!, crv: jwk.crv!, x: jwk.x!, y: jwk.y!, kid, alg: "ES256", use: "sig" }] };
}

/** PEM on one line with \n escapes, as hosting dashboards take environment variables. */
export function pemForEnv(pem: string): string {
  return pem.trim().replace(/\r?\n/g, "\\n");
}
