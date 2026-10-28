import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./policy";

/**
 * Passwords are hashed with scrypt at the strength OWASP recommends
 * (N=2^17, r=8, p=1), with a random salt per password. The parameters are
 * stored with each hash so they can be raised later without breaking
 * existing accounts.
 */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: 256 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

// Checked when no account matches, so a wrong e-mail takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;

/** Constant-time check. Pass null for an unknown account; the result is then false. */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const hash = stored ?? (await (dummyHash ??= hashPassword(randomBytes(16).toString("hex"))));
  const [scheme, n, r, p, salt, expected] = hash.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger)) return false;
  const expectedKey = Buffer.from(expected, "base64url");
  const actualKey = await derive(password, Buffer.from(salt, "base64url"), params);
  return stored !== null && expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}

/** Problems with a proposed password, as sentences for the form; empty when it is acceptable. */
export function passwordProblems(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  const lower = password.toLowerCase();
  const personal = [context.email?.split("@")[0], ...(context.name?.split(/\s+/) ?? [])]
    .map((part) => part?.toLowerCase() ?? "")
    .filter((part) => part.length >= 4);
  if (personal.some((part) => lower.includes(part))) problems.push("Do not use your name or e-mail in the password.");
  if (/^(.)\1+$/.test(password) || COMMON.some((word) => lower.includes(word))) {
    problems.push("This password is too easy to guess.");
  }
  return problems;
}

// Fragments of the most common long passwords; anything containing one is rejected.
const COMMON = [
  "password",
  "passw0rd",
  "123456789",
  "987654321",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "11111111",
  "abcdefgh",
  "iloveyou",
  "letmein",
  "welcome1",
  "admin123",
  "changeme",
];
