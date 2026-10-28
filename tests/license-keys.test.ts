import { describe, expect, it } from "vitest";
import { CROCKFORD } from "@/lib/crockford";
import { newId } from "@/lib/ids";
import { generateLicenseKey, keyCheckCharacter, maskedKey, parseLicenseKey } from "@/lib/license-keys";

describe("license keys", () => {
  it("have the prefix, five groups of five and a valid check character", () => {
    const key = generateLicenseKey("ENRC");
    expect(key).toMatch(/^ENRC(-[0-9A-HJKMNP-TV-Z]{5}){5}$/);
    expect(parseLicenseKey(key)?.canonical).toBe(key);
  });

  it("are different every time", () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateLicenseKey("ENRC")));
    expect(keys.size).toBe(500);
  });

  it("are accepted the way people type them", () => {
    const key = generateLicenseKey("ENRC");
    const body = key.slice(5);
    const forms = [
      key.toLowerCase(),
      key.replace(/-/g, ""),
      `  ${key.replace(/-/g, " ")}  `,
      key.replace(/-/g, "\u2013"),
      `enrc${body.toLowerCase()}`,
      // Full-width characters, as some keyboards produce.
      key.replace(/[A-Z0-9]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0)),
    ];
    for (const form of forms) expect(parseLicenseKey(form)?.canonical, form).toBe(key);
  });

  it("read I and L as 1 and O as 0 in the random part", () => {
    const random = "0011ABCDEFGHJKMNPQRSTVWX";
    const key = `ENRC-${random}${keyCheckCharacter(random)}`;
    const canonical = parseLicenseKey(key)!.canonical;
    expect(parseLicenseKey(key.replace("0011", "OoIl"))?.canonical).toBe(canonical);
  });

  it("catch any single wrong character and swapped neighbours", () => {
    const key = generateLicenseKey("ENRC");
    const body = key.slice(5).replace(/-/g, "");
    for (let i = 0; i < body.length; i++) {
      for (const char of CROCKFORD) {
        if (char === body[i]) continue;
        // 0 and Z differ by 31, the modulus: the one substitution the check misses.
        if ((char === "0" && body[i] === "Z") || (char === "Z" && body[i] === "0")) continue;
        const typo = body.slice(0, i) + char + body.slice(i + 1);
        expect(parseLicenseKey(`ENRC${typo}`), `${i}:${char}`).toBeNull();
      }
    }
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === body[i + 1]) continue;
      if (Math.abs(CROCKFORD.indexOf(body[i]) - CROCKFORD.indexOf(body[i + 1])) === 31) continue;
      const swapped = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      expect(parseLicenseKey(`ENRC${swapped}`), `swap ${i}`).toBeNull();
    }
  });

  it("reject things that are not keys", () => {
    // Fixed, so that a cut or extended key cannot pass the check by chance.
    const random = "7KQ2MX9D4THV6WP3RZ8BNF1C";
    const key = `ENRC-${random}${keyCheckCharacter(random)}`;
    expect(parseLicenseKey(key)).not.toBeNull();
    for (const bad of ["", "ENRC", key.slice(0, -1), `${key}X`, `1NRC${key.slice(4)}`, `E${key.slice(4)}`, "x".repeat(200), 42, null]) {
      expect(parseLicenseKey(bad), String(bad)).toBeNull();
    }
  });

  it("refuse to generate with a bad prefix", () => {
    expect(() => generateLicenseKey("en")).toThrow();
    expect(() => generateLicenseKey("TOOLONGPREFIX")).toThrow();
  });

  it("are masked to the prefix and the last group", () => {
    const key = generateLicenseKey("ENRC");
    const parsed = parseLicenseKey(key)!;
    expect(maskedKey(parsed.prefix, parsed.hint)).toBe(`ENRC-...-${key.slice(-5)}`);
  });
});

describe("ids", () => {
  it("are prefixed, unique and sort by time", () => {
    const first = newId("lic", 1_700_000_000_000);
    const second = newId("lic", 1_700_000_000_001);
    expect(first).toMatch(/^lic_[0-9a-hjkmnp-tv-z]{26}$/);
    expect(first < second).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => newId("act"))).size).toBe(1000);
  });
});
