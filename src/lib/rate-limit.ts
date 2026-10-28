import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window counters kept in the database, so limits hold across all
 * serverless instances.
 */
export type RateLimit = { name: string; limit: number; windowSeconds: number };

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

function windowOf(now: Date, windowSeconds: number) {
  const size = windowSeconds * 1000;
  const start = Math.floor(now.getTime() / size) * size;
  return { start: new Date(start), retryAfterSeconds: Math.max(1, Math.ceil((start + size - now.getTime()) / 1000)) };
}

/** Counts one attempt and says whether it is within the limit. */
export async function hitRateLimit(db: Db, rule: RateLimit, subject: string, now = new Date()): Promise<RateLimitResult> {
  const window = windowOf(now, rule.windowSeconds);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `${rule.name}:${subject}`, windowStart: window.start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (Math.random() < 0.01) await pruneRateLimits(db, now);
  return { allowed: row.count <= rule.limit, count: row.count, retryAfterSeconds: window.retryAfterSeconds };
}

/** Says whether another attempt would be within the limit, without counting one. */
export async function peekRateLimit(db: Db, rule: RateLimit, subject: string, now = new Date()): Promise<RateLimitResult> {
  const window = windowOf(now, rule.windowSeconds);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, `${rule.name}:${subject}`), eq(rateLimits.windowStart, window.start)));
  const count = row?.count ?? 0;
  return { allowed: count < rule.limit, count, retryAfterSeconds: window.retryAfterSeconds };
}

/** Drops counters older than a day. */
export async function pruneRateLimits(db: Db, now = new Date()): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
}
