/**
 * Fills the development database: the ENERCEON product, a demo customer with
 * a license, and an administrator from DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD.
 * Stop `npm run dev` first: the embedded database allows one process at a time.
 *
 *   npm run seed:dev
 *
 * The demo key is written to .data/dev-license-key.txt, not printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { customers, products, users } from "../src/db/schema";
import { createCustomer, createProduct } from "../src/lib/catalog";
import { createLicense } from "../src/lib/licenses";
import { hashPassword } from "../src/lib/passwords";
import { newId } from "../src/lib/ids";
import { loadEnv, run } from "./load-env";

run(async () => {
  loadEnv();
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("pglite:")) {
    console.error("seed:dev only fills the embedded development database (DATABASE_URL=pglite:...).");
    process.exit(1);
  }

  const { db, close } = await createDatabase(url);
  const actor = { email: "seed", ip: null };
  try {
    let [product] = await db.select().from(products).where(eq(products.code, "ENERCEON"));
    if (!product) {
      await createProduct(db, actor, { code: "ENERCEON", name: "ENERCEON", keyPrefix: "ENRC" });
      [product] = await db.select().from(products).where(eq(products.code, "ENERCEON"));
    }
    let [customer] = await db.select().from(customers).where(eq(customers.name, "Demo Customer"));
    if (!customer) {
      await createCustomer(db, actor, { name: "Demo Customer", contactName: "Demo Contact", country: "Pakistan" });
      [customer] = await db.select().from(customers).where(eq(customers.name, "Demo Customer"));
    }
    const license = await createLicense(db, actor, { productId: product.id, customerId: customer.id, maxActivations: 1, reference: "DEV" });
    const keyFile = path.join(process.cwd(), ".data", "dev-license-key.txt");
    mkdirSync(path.dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, `${license.key}\n`);
    console.log(`Created a demo license for ENERCEON; its key is in ${path.relative(process.cwd(), keyFile)}.`);

    const email = process.env.DEV_ADMIN_EMAIL?.toLowerCase();
    const password = process.env.DEV_ADMIN_PASSWORD;
    if (email && password) {
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (!existing) {
        await db.insert(users).values({
          id: newId("usr"),
          email,
          name: "Development Admin",
          passwordHash: await hashPassword(password),
          role: "admin",
          status: "active",
          approvedAt: new Date(),
          approvedBy: "seed",
        });
        console.log(`Created administrator ${email}; the password is DEV_ADMIN_PASSWORD in .env.local.`);
      }
    }
  } finally {
    await close();
  }
});
