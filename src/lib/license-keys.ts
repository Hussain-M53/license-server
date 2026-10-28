import { randomBytes } from "node:crypto";
import { CROCKFORD, crockfordEncode, crockfordNormalize, crockfordValue } from "./crockford";

/**
 * License keys look like `ENRC-7KQ2M-X9D4T-HV6WP-3RZ8B-NF1C5`: the product's
 * prefix, then 24 random Crockford characters (120 bits) and one check
 * character, in groups of five.
 *
 * The check character only catches typing mistakes before a request is sent;
 * the server lookup is what decides whether a key is real. The installer has
 * the same check (installer-kit/scripts/setup-helper.ps1); keep them equal.
 */
const RANDOM_LENGTH = 24;
const BODY_LENGTH = RANDOM_LENGTH + 1;
const GROUP_LENGTH = 5;
export const KEY_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;

/** Weighted sum of the character values, modulo 31. */
export function keyCheckCharacter(random: string): string {
  let sum = 0;
  for (let i = 0; i < random.length; i++) sum += (i + 1) * crockfordValue(random[i]);
  return CROCKFORD[sum % 31];
}

function format(prefix: string, body: string): string {
  const groups = body.match(new RegExp(`.{1,${GROUP_LENGTH}}`, "g")) ?? [];
  return [prefix, ...groups].join("-");
}

export function generateLicenseKey(prefix: string): string {
  if (!KEY_PREFIX_PATTERN.test(prefix)) throw new Error("Key prefix must be 2-8 upper-case letters or digits");
  const random = crockfordEncode(randomBytes(15));
  return format(prefix, random + keyCheckCharacter(random));
}

export type ParsedLicenseKey = {
  prefix: string;
  /** The one spelling of the key that is hashed and stored. */
  canonical: string;
  /** Last group, safe to show in lists and support conversations. */
  hint: string;
};

/**
 * Accepts a key the way people type or paste it: any case, with or without
 * dashes and spaces, and with I, L or O in place of 1 and 0. Returns null when
 * it cannot be a key.
 */
export function parseLicenseKey(input: unknown): ParsedLicenseKey | null {
  if (typeof input !== "string" || input.length > 100) return null;
  const compact = input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-\u2010-\u2015_]/g, "");
  if (compact.length <= BODY_LENGTH) return null;
  const prefix = compact.slice(0, -BODY_LENGTH);
  if (!KEY_PREFIX_PATTERN.test(prefix)) return null;
  const body = crockfordNormalize(compact.slice(-BODY_LENGTH));
  if (![...body].every((char) => crockfordValue(char) >= 0)) return null;
  if (keyCheckCharacter(body.slice(0, RANDOM_LENGTH)) !== body[RANDOM_LENGTH]) return null;
  return { prefix, canonical: format(prefix, body), hint: body.slice(-GROUP_LENGTH) };
}

/** `ENRC-...-NF1C5`: how a key is shown when the whole key must stay hidden. */
export function maskedKey(prefix: string, hint: string): string {
  return `${prefix}-...-${hint}`;
}
