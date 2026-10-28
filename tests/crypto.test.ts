import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signEs256, verifyEs256 } from "@/lib/jws";
import { issueLicenseToken, publicSigningJwk, signingKey, verifyLicenseToken } from "@/lib/license-token";
import { decryptLicenseKey, encryptLicenseKey, keyHash, tokenDigest } from "@/lib/secrets";

describe("key storage", () => {
  it("hashes keys stably and differently per key", () => {
    expect(keyHash("ENRC-AAAAA")).toBe(keyHash("ENRC-AAAAA"));
    expect(keyHash("ENRC-AAAAA")).not.toBe(keyHash("ENRC-AAAAB"));
    expect(keyHash("ENRC-AAAAA")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("encrypts keys so only the same license row can decrypt them", () => {
    const stored = encryptLicenseKey("ENRC-SECRET", "lic_1");
    expect(stored).not.toContain("SECRET");
    expect(decryptLicenseKey(stored, "lic_1")).toBe("ENRC-SECRET");
    expect(() => decryptLicenseKey(stored, "lic_2")).toThrow();
    expect(encryptLicenseKey("ENRC-SECRET", "lic_1")).not.toBe(stored);
  });

  it("detects a tampered ciphertext", () => {
    const [version, iv, data, tag] = encryptLicenseKey("ENRC-SECRET", "lic_1").split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptLicenseKey([version, iv, flipped.toString("base64url"), tag].join("."), "lic_1")).toThrow();
  });

  it("digests tokens", () => {
    expect(tokenDigest("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });
});

describe("ES256 compact JWS", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const keys = new Map([["k1", publicKey]]);

  it("round-trips", () => {
    const token = signEs256({ hello: "world" }, privateKey, "k1");
    const verified = verifyEs256(token, keys);
    expect(verified?.payload).toEqual({ hello: "world" });
    expect(verified?.header).toEqual({ alg: "ES256", typ: "license+jwt", kid: "k1" });
  });

  it("rejects a changed payload, header or signature", () => {
    const token = signEs256({ name: "ACME" }, privateKey, "k1");
    const [header, payload, signature] = token.split(".");
    const otherPayload = Buffer.from(JSON.stringify({ name: "EVIL" })).toString("base64url");
    expect(verifyEs256(`${header}.${otherPayload}.${signature}`, keys)).toBeNull();
    const otherHeader = Buffer.from(JSON.stringify({ alg: "ES256", typ: "license+jwt", kid: "k2" })).toString("base64url");
    expect(verifyEs256(`${otherHeader}.${payload}.${signature}`, new Map([["k2", publicKey]]))).toBeNull();
    const bad = Buffer.from(signature, "base64url");
    bad[10] ^= 1;
    expect(verifyEs256(`${header}.${payload}.${bad.toString("base64url")}`, keys)).toBeNull();
  });

  it("rejects other algorithms, types, unknown keys and other keys", () => {
    const token = signEs256({ a: 1 }, privateKey, "k1");
    const [, payload] = token.split(".");
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "license+jwt", kid: "k1" })).toString("base64url");
    expect(verifyEs256(`${none}.${payload}.`, keys)).toBeNull();
    expect(verifyEs256(token, keys, "JWT")).toBeNull();
    expect(verifyEs256(token, new Map())).toBeNull();
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey;
    expect(verifyEs256(token, new Map([["k1", other]]))).toBeNull();
    expect(verifyEs256("not.a.token", keys)).toBeNull();
    expect(verifyEs256(`${token}.extra`, keys)).toBeNull();
  });

  it("refuses keys that are not P-256", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(() => signEs256({}, rsa, "k1")).toThrow(/P-256/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "P-384" }).privateKey;
    expect(() => signEs256({}, p384, "k1")).toThrow(/P-256/);
    expect(() => signEs256({}, publicKey, "k1")).toThrow(/private/);
  });
});

describe("license tokens", () => {
  it("carry the claims and verify with the published public key", () => {
    const token = issueLicenseToken(
      {
        aud: "ENERCEON",
        sub: "lic_1",
        jti: "act_1",
        kind: "perpetual",
        cus: { id: "cus_1", name: "ACME" },
        key: "ENRC-...-AAAAA",
        mch: { fpv: 1, ids: { board: "b", os: "o" }, name: "SERVER-01" },
      },
      new Date("2026-10-18T10:00:00Z"),
    );
    const claims = verifyLicenseToken(token);
    expect(claims).toMatchObject({ iss: "http://localhost:3100", aud: "ENERCEON", sub: "lic_1", ver: 1 });
    expect(claims?.iat).toBe(Date.UTC(2026, 9, 18, 10) / 1000);

    const jwk = publicSigningJwk();
    expect(jwk).toMatchObject({ kty: "EC", crv: "P-256", kid: "test-1", alg: "ES256", use: "sig" });
    expect(jwk).not.toHaveProperty("d");
    const fromJwk = createPublicKey({ key: jwk, format: "jwk" });
    expect(verifyEs256(token, new Map([["test-1", fromJwk]]))).not.toBeNull();
    expect(signingKey().type).toBe("private");
  });
});
