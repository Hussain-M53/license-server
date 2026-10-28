/**
 * Crockford's base32: digits and upper-case letters without I, L, O and U, so
 * keys can be read aloud and typed without confusing similar characters.
 */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Value of a Crockford character, or -1. */
export function crockfordValue(char: string): number {
  return CROCKFORD.indexOf(char);
}

/** Maps the letters people mistype for digits (I, L, O) to the digits. */
export function crockfordNormalize(text: string): string {
  return text.toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
}

/** Encodes bytes, five bits per character. */
export function crockfordEncode(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) output += CROCKFORD[(buffer << (5 - bits)) & 31];
  return output;
}
