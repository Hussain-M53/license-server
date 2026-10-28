import "server-only";
import { z } from "zod";

/** Treats an empty variable (common in hosting dashboards) as not set. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const base64Secret = (bytes: number, exact: boolean) =>
  z
    .string()
    .refine(
      (value) => {
        if (!BASE64.test(value)) return false;
        const length = Buffer.from(value, "base64").length;
        return exact ? length === bytes : length >= bytes;
      },
      exact ? `must be exactly ${bytes} random bytes, base64-encoded` : `must be at least ${bytes} random bytes, base64-encoded`,
    );

const schema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  /** Public address of this server, e.g. https://license.enerceon.com */
  APP_URL: z.url().transform((value) => value.replace(/\/+$/, "")),
  /** Name shown in the dashboard. */
  APP_NAME: optional(z.string().max(60)),
  /** `iss` of every license; defaults to APP_URL. Products check it, so never change it once issued. */
  LICENSE_ISSUER: optional(z.string().min(1).max(200)),
  /** PKCS#8 PEM of the P-256 signing key. Newlines may be written as \n. */
  LICENSE_SIGNING_KEY: z
    .string()
    .min(1, "is required")
    .transform((value) => value.replace(/\\n/g, "\n")),
  /** Name of the signing key; products look the public key up by it. */
  LICENSE_SIGNING_KID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "must be 1-64 letters, digits, dots, dashes or underscores"),
  /** Keys are looked up by HMAC so the database never holds them in the clear. */
  KEY_HMAC_SECRET: base64Secret(32, false),
  /** AES-256 key for the encrypted copy of each license key. */
  KEY_ENCRYPTION_KEY: base64Secret(32, true),
  /** One-time code that unlocks /setup to create the first administrator. */
  SETUP_TOKEN: optional(z.string().min(24, "must be at least 24 characters")),
  /** Comma-separated e-mail domains allowed to request dashboard access; empty allows any. */
  SIGNUP_ALLOWED_DOMAINS: optional(z.string()).transform((value) =>
    (value ?? "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  ),
  ACTIVATIONS_PER_HOUR_PER_IP: optional(z.coerce.number().int().min(1)).transform((value) => value ?? 30),
  INVALID_KEYS_PER_HOUR_PER_IP: optional(z.coerce.number().int().min(1)).transform((value) => value ?? 10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated configuration. Read lazily so that building the app needs no secrets. */
export function env(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Names and rules only: never echo a value, it may be a secret.
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"} ${issue.message}`);
    throw new Error(`License server configuration is incomplete:\n${problems.join("\n")}\nSee .env.example.`);
  }
  cached = result.data;
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";

/** Display name; read directly so pages that only show it need no secrets. */
export function appName(): string {
  return process.env.APP_NAME?.trim() || "License Server";
}

export function licenseIssuer(): string {
  return env().LICENSE_ISSUER ?? env().APP_URL;
}
