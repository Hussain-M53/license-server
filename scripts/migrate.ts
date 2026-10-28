/**
 * Applies database migrations (./drizzle). Run before deploying a version with
 * schema changes:
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * Prefers DATABASE_URL_UNPOOLED (Neon's direct endpoint) when it is set.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase, MIGRATIONS_FOLDER } from "../src/db/client";
import { loadEnv, run } from "./load-env";

run(async () => {
  loadEnv();

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first.");
    process.exit(1);
  }

  if (url.startsWith("pglite:")) {
    // The embedded database migrates itself when opened.
    const { close } = await createDatabase(url);
    await close();
  } else {
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await client.end({ timeout: 5 });
    }
  }
  console.log(`Database is up to date (${new URL(url.replace(/^pglite:/, "pglite://local/")).host || "local"}).`);
});
