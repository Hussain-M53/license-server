import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { activate } from "@/lib/activation";
import { formatOfflineRequest, licenseFileName, parseOfflineRequest, REQUEST_BEGIN, REQUEST_END } from "@/lib/offline";
import { activationRequest, seedLicense, testDb } from "./support/db";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

describe("offline activation requests", () => {
  it("round-trip through the armored text format", () => {
    const request = activationRequest("ENERCEON", "ENRC-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", "PLANT-PC");
    const text = formatOfflineRequest(request);
    expect(text.startsWith(REQUEST_BEGIN)).toBe(true);
    expect(text.split("\r\n").every((line) => line.length <= 64 || line.startsWith("-----"))).toBe(true);
    const parsed = parseOfflineRequest(`Saved by Setup\r\n\r\n${text}\r\nthanks`);
    expect(parsed).toEqual({ ok: true, request });
  });

  it("survive line-ending changes, URL-safe base64 and extra spaces", () => {
    const request = activationRequest("ENERCEON", "ENRC-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", "PLANT-PC");
    const text = formatOfflineRequest(request).replace(/\r\n/g, "\n   ").replace(/\+/g, "-").replace(/\//g, "_");
    expect(parseOfflineRequest(text).ok).toBe(true);
  });

  it("reject other text with a helpful message", () => {
    expect(parseOfflineRequest("hello")).toMatchObject({ ok: false, message: expect.stringContaining("not an activation request") });
    expect(parseOfflineRequest(`${REQUEST_BEGIN}\n!!!\n${REQUEST_END}`)).toMatchObject({ ok: false, message: expect.stringContaining("damaged") });
    const wrongShape = Buffer.from(JSON.stringify({ v: 1, type: "something-else" })).toString("base64");
    expect(parseOfflineRequest(`${REQUEST_BEGIN}\n${wrongShape}\n${REQUEST_END}`)).toMatchObject({ ok: false });
    expect(parseOfflineRequest("x".repeat(20_000))).toMatchObject({ ok: false, message: expect.stringContaining("too large") });
  });

  it("activate exactly like online requests, marked offline", async () => {
    const seed = await seedLicense(db);
    const parsed = parseOfflineRequest(formatOfflineRequest(activationRequest(seed.productCode, seed.key, "AIR-GAPPED")));
    if (!parsed.ok) throw new Error(parsed.message);
    const result = await activate(db, parsed.request, { ip: "203.0.113.9", method: "offline" });
    expect(result).toMatchObject({ ok: true, status: 201 });
  });

  it("name license files after the product and computer", () => {
    expect(licenseFileName("ENERCEON", "PLANT PC #2")).toBe("ENERCEON-PLANT-PC-2.lic");
    expect(licenseFileName("ENERCEON", "***")).toBe("ENERCEON.lic");
  });
});
