import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { events, licenses } from "@/db/schema";
import { activate } from "@/lib/activation";
import { createCustomer, createProduct, updateCustomer } from "@/lib/catalog";
import { changeLicenseStatus, createLicense, findLicenseIdByKey, revealLicenseKey, updateLicense } from "@/lib/licenses";
import { hitRateLimit, peekRateLimit } from "@/lib/rate-limit";
import { actor, activationRequest, seedLicense, testDb } from "./support/db";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

describe("products and customers", () => {
  it("need unique codes and prefixes", async () => {
    expect(await createProduct(db, actor, { code: "enerceon", name: "ENERCEON", keyPrefix: "enrc" })).toMatchObject({ ok: true });
    expect(await createProduct(db, actor, { code: "ENERCEON", name: "Copy", keyPrefix: "ENRX" })).toMatchObject({
      ok: false,
      message: expect.stringContaining("already"),
    });
    expect(await createProduct(db, actor, { code: "X", name: "", keyPrefix: "1AB" })).toMatchObject({
      ok: false,
      errors: { code: expect.any(Array), name: expect.any(Array), keyPrefix: expect.any(Array) },
    });
  });

  it("customers are validated and edits are audited", async () => {
    expect(await createCustomer(db, actor, { name: " ", email: "bad" })).toMatchObject({ ok: false });
    const created = await createCustomer(db, actor, { name: "ACME Properties", email: "IT@Acme.example", country: "Pakistan" });
    expect(created).toMatchObject({ ok: true });
    expect(await updateCustomer(db, actor, created.customerId!, { name: "ACME Properties Ltd", email: "it@acme.example" })).toMatchObject({
      ok: true,
    });
    const log = await db.select().from(events).where(eq(events.customerId, created.customerId!));
    expect(log.map((event) => event.type)).toEqual(["customer.created", "customer.updated"]);
  });
});

describe("licenses", () => {
  it("store only a hash and an encrypted copy of the key", async () => {
    const seed = await seedLicense(db);
    const [row] = await db.select().from(licenses).where(eq(licenses.id, seed.licenseId));
    expect(JSON.stringify(row)).not.toContain(seed.key);
    expect(row.keyHint).toBe(seed.key.slice(-5));
    expect(await revealLicenseKey(db, actor, seed.licenseId)).toBe(seed.key);
    expect(await findLicenseIdByKey(db, seed.key.toLowerCase())).toBe(seed.licenseId);
    const log = await db.select().from(events).where(eq(events.licenseId, seed.licenseId));
    expect(log.map((event) => event.type)).toContain("license.key_revealed");
  });

  it("need a product, a customer and a sensible number of computers", async () => {
    expect(await createLicense(db, actor, { productId: "", customerId: "", maxActivations: "0" })).toMatchObject({
      ok: false,
      errors: { productId: expect.any(Array), customerId: expect.any(Array), maxActivations: expect.any(Array) },
    });
    expect(await createLicense(db, actor, { productId: "prd_missing", customerId: "cus_missing", maxActivations: 1 })).toMatchObject({
      ok: false,
    });
  });

  it("cannot lower the number of computers below those in use", async () => {
    const seed = await seedLicense(db, { maxActivations: 2 });
    await activate(db, activationRequest(seed.productCode, seed.key, "A"), { ip: null, method: "online" });
    await activate(db, activationRequest(seed.productCode, seed.key, "B"), { ip: null, method: "online" });
    expect(await updateLicense(db, actor, seed.licenseId, { maxActivations: 1 })).toMatchObject({ ok: false });
    expect(await updateLicense(db, actor, seed.licenseId, { maxActivations: 3, reference: "INV-1001" })).toMatchObject({ ok: true });
  });

  it("follow the status rules: revoked is final, and a reason is required", async () => {
    const seed = await seedLicense(db);
    expect(await changeLicenseStatus(db, actor, seed.licenseId, "suspend", "")).toMatchObject({ ok: false, errors: { reason: expect.any(Array) } });
    expect(await changeLicenseStatus(db, actor, seed.licenseId, "resume", "Not suspended")).toMatchObject({ ok: false });
    expect(await changeLicenseStatus(db, actor, seed.licenseId, "revoke", "Fraud")).toMatchObject({ ok: true });
    expect(await changeLicenseStatus(db, actor, seed.licenseId, "resume", "Oops")).toMatchObject({ ok: false });
    expect(await changeLicenseStatus(db, actor, seed.licenseId, "suspend", "Again")).toMatchObject({ ok: false });
  });
});

describe("rate limits", () => {
  it("count within a window and start over in the next", async () => {
    const rule = { name: "test", limit: 2, windowSeconds: 60 };
    const now = new Date("2026-10-18T10:00:10Z");
    expect((await peekRateLimit(db, rule, "me", now)).allowed).toBe(true);
    expect((await hitRateLimit(db, rule, "me", now)).allowed).toBe(true);
    expect((await hitRateLimit(db, rule, "me", now)).allowed).toBe(true);
    const third = await hitRateLimit(db, rule, "me", now);
    expect(third).toMatchObject({ allowed: false, count: 3, retryAfterSeconds: 50 });
    expect((await peekRateLimit(db, rule, "me", now)).allowed).toBe(false);
    expect((await hitRateLimit(db, rule, "someone-else", now)).allowed).toBe(true);
    expect((await hitRateLimit(db, rule, "me", new Date("2026-10-18T10:01:00Z"))).allowed).toBe(true);
  });
});
