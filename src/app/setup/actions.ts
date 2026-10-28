"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { setupFirstAdmin } from "@/lib/accounts";
import { clientIp, startSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { formValues, withValues, type FormState } from "@/lib/forms";
import { hitRateLimit } from "@/lib/rate-limit";

export async function setupAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, { name: "setup", limit: 10, windowSeconds: 3600 }, ip ?? "unknown")).allowed) {
    return { ok: false, message: "Too many attempts from this network. Try again in an hour." };
  }
  const result = await setupFirstAdmin(db, formValues(formData), { ip, setupToken: env().SETUP_TOKEN });
  if (!result.ok || !result.userId) return withValues(result, formData);
  await startSession(result.userId);
  redirect("/admin");
}
