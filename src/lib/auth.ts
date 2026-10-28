import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { Role } from "@/db/schema";
import { createSession, deleteSession, hasRole, sessionUser, SESSION_HOURS, type SessionUser } from "./accounts";
import type { Actor } from "./catalog";
import { isProduction } from "./env";

/**
 * Dashboard sessions: a random token in an HttpOnly cookie, its SHA-256 in
 * the database. In production the `__Host-` prefix makes browsers insist on
 * HTTPS, this exact host and no sub-domain sharing.
 */
export const SESSION_COOKIE = isProduction ? "__Host-ls_session" : "ls_session";

/** Client address as Vercel reports it. */
export async function clientIp(): Promise<string | null> {
  const list = await headers();
  return list.get("x-real-ip") ?? list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in user, checked against the database once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await sessionToken();
  if (!token || token.length > 100) return null;
  return sessionUser(await getDb(), token);
});

/**
 * For every dashboard page and action: signed in, with at least this role.
 * Pages call it themselves; a layout's check does not run on every navigation.
 */
export async function requireUser(minimum: Role = "viewer"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!hasRole(user.role, minimum)) redirect("/admin?denied=1");
  return user;
}

/** The signed-in user as the audit log records them. */
export async function requireActor(minimum: Role = "viewer"): Promise<SessionUser & Actor> {
  const user = await requireUser(minimum);
  return { ...user, ip: await clientIp() };
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(await getDb(), userId, {
    ip: await clientIp(),
    userAgent: (await headers()).get("user-agent"),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  const token = await sessionToken();
  if (token) await deleteSession(await getDb(), token);
  (await cookies()).delete(SESSION_COOKIE);
}

/** The current session token, for "sign out everywhere else". */
export async function currentSessionToken(): Promise<string> {
  return (await sessionToken()) ?? "";
}
