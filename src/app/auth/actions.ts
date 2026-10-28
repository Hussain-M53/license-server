"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { authenticate, resetPassword, signUp } from "@/lib/accounts";
import { clientIp, endSession, startSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { formValues, withValues, type FormState } from "@/lib/forms";
import { hitRateLimit } from "@/lib/rate-limit";

const SIGN_IN_LIMIT = { name: "sign-in", limit: 20, windowSeconds: 15 * 60 };
const SIGN_UP_LIMIT = { name: "sign-up", limit: 5, windowSeconds: 3600 };
const RESET_LIMIT = { name: "reset", limit: 10, windowSeconds: 3600 };

/** Only dashboard paths, so the sign-in page cannot be used to send people elsewhere. */
function afterSignIn(next: FormDataEntryValue | null): string {
  return typeof next === "string" && /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, SIGN_IN_LIMIT, ip ?? "unknown")).allowed) {
    return withValues({ ok: false, message: "Too many sign-in attempts from this network. Try again in 15 minutes." }, formData);
  }
  const result = await authenticate(db, formValues(formData), { ip });
  if (!result.ok) return withValues({ ok: false, message: result.message }, formData);
  await startSession(result.user.id);
  redirect(afterSignIn(formData.get("next")));
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, SIGN_UP_LIMIT, ip ?? "unknown")).allowed) {
    return withValues({ ok: false, message: "Too many requests from this network. Try again later." }, formData);
  }
  const result = await signUp(db, formValues(formData), { ip, allowedDomains: env().SIGNUP_ALLOWED_DOMAINS });
  if (!result.ok) return withValues(result, formData);
  redirect("/auth/pending");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/auth/sign-in");
}

export async function resetPasswordAction(token: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, RESET_LIMIT, ip ?? "unknown")).allowed) {
    return { ok: false, message: "Too many attempts from this network. Try again later." };
  }
  const result = await resetPassword(db, token, formValues(formData), { ip });
  if (!result.ok) return result;
  redirect("/auth/sign-in?reset=1");
}
