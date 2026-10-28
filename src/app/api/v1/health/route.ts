import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/** GET /api/v1/health: for uptime checks and for installers testing the connection. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ status: "ok", time: new Date().toISOString() }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
