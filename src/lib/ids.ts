import { randomBytes } from "node:crypto";
import { crockfordEncode, CROCKFORD } from "./crockford";

export type IdPrefix = "prd" | "cus" | "lic" | "act" | "evt" | "usr";

/**
 * A unique, time-sortable id in ULID layout (10 characters of milliseconds and
 * 16 of randomness), lower case and prefixed with what it identifies,
 * e.g. `lic_01k7m3z8qv4c9ea2f6r1xw0bnt`.
 */
export function newId(prefix: IdPrefix, now = Date.now()): string {
  let time = now;
  let timePart = "";
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  return `${prefix}_${timePart}${crockfordEncode(randomBytes(10))}`.toLowerCase();
}
