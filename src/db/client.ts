import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/** A database or a transaction: every data function takes one of these. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * `pglite:memory` or `pglite:<folder>` runs an embedded Postgres for local
 * development and tests, created and migrated on first use. Anything else is
 * a Postgres connection string (Neon in production), migrated separately by
 * `npm run db:migrate` before a deploy.
 */
export async function createDatabase(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  if (url.startsWith("pglite:")) {
    const location = url.slice("pglite:".length);
    const client = location === "memory" ? new PGlite() : new PGlite(path.resolve(location));
    const db = drizzlePglite({ client, schema });
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db, close: () => client.close() };
  }
  // Neon's pooled endpoint runs PgBouncer in transaction mode, which cannot
  // keep prepared statements between transactions.
  const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return { db: drizzlePostgres({ client, schema }), close: () => client.end({ timeout: 5 }) };
}

// One database per process; kept on globalThis so development reloads reuse it
// (two embedded databases on one folder would corrupt it).
const globalForDb = globalThis as unknown as { licenseServerDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.licenseServerDb ??= createDatabase(env().DATABASE_URL)
    .then(({ db }) => db)
    .catch((error: unknown) => {
      globalForDb.licenseServerDb = undefined;
      throw error;
    });
  return globalForDb.licenseServerDb;
}
