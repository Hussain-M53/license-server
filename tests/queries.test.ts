import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { activate } from "@/lib/activation";
import { changeLicenseStatus, createLicense } from "@/lib/licenses";
import { licenseDetail, listCustomers, listEvents, listLicenses, listProducts, overview } from "@/lib/queries";
import { actor, activationRequest, seedLicense, testDb } from "./support/db";

let db: Db;
let used: Awaited<ReturnType<typeof seedLicense>>;
let unusedId: string;
let suspended: Awaited<ReturnType<typeof seedLicense>>;

beforeAll(async () => {
  db = await testDb();
  used = await seedLicense(db, { maxActivations: 2 });
  await activate(db, activationRequest(used.productCode, used.key, "FIRST-PC"), { ip: null, method: "online" });
  await activate(db, activationRequest(used.productCode, used.key, "SECOND-PC"), { ip: null, method: "online" });
  // A second, unused license for the same product and customer.
  const second = await createLicense(db, actor, { productId: used.productId, customerId: used.customerId, maxActivations: 1, reference: "INV-77" });
  unusedId = second.licenseId!;
  suspended = await seedLicense(db);
  await changeLicenseStatus(db, actor, suspended.licenseId, "suspend", "Unpaid");
});

describe("dashboard queries", () => {
  it("count licenses per product and per customer", async () => {
    const products = await listProducts(db);
    expect(products.find((product) => product.id === used.productId)?.licenseCount).toBe(2);
    expect(products.find((product) => product.id === suspended.productId)?.licenseCount).toBe(1);
    const { rows } = await listCustomers(db, {});
    expect(rows.find((customer) => customer.id === used.customerId)?.licenseCount).toBe(2);
  });

  it("show the computers per license, and filter by state", async () => {
    const all = await listLicenses(db, {});
    const row = all.rows.find((license) => license.id === used.licenseId)!;
    expect(row).toMatchObject({ computers: 2, firstComputer: "FIRST-PC" });
    expect((await listLicenses(db, { filter: "active" })).rows.map((license) => license.id)).toEqual([used.licenseId]);
    expect((await listLicenses(db, { filter: "unused" })).rows.map((license) => license.id)).toEqual([unusedId]);
    expect((await listLicenses(db, { filter: "suspended" })).rows.map((license) => license.id)).toEqual([suspended.licenseId]);
    expect((await listLicenses(db, { q: "inv-77" })).rows.map((license) => license.id)).toEqual([unusedId]);
    expect((await listLicenses(db, { q: used.key.slice(-5).toLowerCase() })).rows.map((license) => license.id)).toEqual([used.licenseId]);
    expect((await listLicenses(db, { customerId: used.customerId })).total).toBe(2);
  });

  it("sum up the overview", async () => {
    const stats = await overview(db);
    expect(stats.licenses).toEqual({ active: 2, suspended: 1, unused: 1 });
    expect(stats.computers).toBe(2);
    expect(stats.customers).toBe(2);
  });

  it("give a license's computers and history", async () => {
    const detail = await licenseDetail(db, used.licenseId);
    expect(detail?.computers.map((computer) => computer.machineName).sort()).toEqual(["FIRST-PC", "SECOND-PC"]);
    expect(detail?.timeline.map((event) => event.type)).toContain("activation.created");
    expect(detail?.license).not.toHaveProperty("keyHash");
    expect(detail?.license).not.toHaveProperty("keyCiphertext");
    expect(await licenseDetail(db, "lic_missing")).toBeNull();
  });

  it("search the audit log by person, address and details", async () => {
    expect((await listEvents(db, { q: "SECOND-PC" })).rows.length).toBeGreaterThan(0);
    expect((await listEvents(db, { q: actor.email, group: "licenses" })).rows.every((event) => event.type.startsWith("license."))).toBe(true);
    expect((await listEvents(db, { q: "no-such-thing-anywhere" })).total).toBe(0);
  });
});
