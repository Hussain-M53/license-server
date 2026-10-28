import { createHash } from "node:crypto";
import { afterAll } from "vitest";
import { createDatabase, type Db } from "@/db/client";
import { createCustomer, createProduct, type Actor } from "@/lib/catalog";
import { createLicense } from "@/lib/licenses";
import type { MachineIds } from "@/lib/machine";

export const actor: Actor = { email: "support@example.com", ip: "203.0.113.1" };

/** A fresh in-memory database, migrated, closed after the test file. */
export async function testDb(): Promise<Db> {
  const { db, close } = await createDatabase("pglite:memory");
  afterAll(close);
  return db;
}

let counter = 0;

/** A product, a customer and a license for it; returns the key in full. */
export async function seedLicense(db: Db, options: { maxActivations?: number; productCode?: string; prefix?: string } = {}) {
  counter++;
  const productCode = options.productCode ?? `PRODUCT${counter}`;
  const product = await createProduct(db, actor, {
    code: productCode,
    name: `Product ${counter}`,
    keyPrefix: options.prefix ?? `P${String(counter).padStart(3, "0")}`,
  });
  const customer = await createCustomer(db, actor, { name: `Customer ${counter}` });
  const license = await createLicense(db, actor, {
    productId: product.productId,
    customerId: customer.customerId,
    maxActivations: options.maxActivations ?? 1,
  });
  if (!license.ok) throw new Error(`seed failed: ${license.message}`);
  return { productCode, productId: product.productId!, customerId: customer.customerId!, licenseId: license.licenseId!, key: license.key! };
}

/** Hashed ids the way fingerprint.ps1 makes them. */
export function machineIds(computer: string, ...names: (keyof MachineIds)[]): MachineIds {
  const ids: MachineIds = {};
  for (const name of names.length ? names : (["board", "os", "disk"] as const)) {
    ids[name] = createHash("sha256").update(`fp1|TEST|${name}|${computer}-${name}`).digest("base64url");
  }
  return ids;
}

export function activationRequest(productCode: string, key: string, computer: string, ids = machineIds(computer)) {
  return {
    product: productCode,
    key,
    machine: { fpv: 1 as const, ids, name: computer, windows: "Windows Server 2022 (20348)" },
    app: { version: "1.1.0" },
    installationId: `inst-${computer}`,
  };
}
