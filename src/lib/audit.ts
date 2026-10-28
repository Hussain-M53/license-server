import type { Db } from "@/db/client";
import { events } from "@/db/schema";
import { newId } from "./ids";

export type EventInput = {
  type: string;
  /** Dashboard user's e-mail, or "client" for requests from installed products. */
  actor?: string | null;
  ip?: string | null;
  licenseId?: string | null;
  activationId?: string | null;
  customerId?: string | null;
  /** Never put a license key, password or token in here. */
  details?: Record<string, unknown>;
};

/** Appends to the audit log, inside the caller's transaction when given one. */
export async function recordEvent(db: Db, event: EventInput): Promise<void> {
  await db.insert(events).values({ id: newId("evt"), ...event });
}
