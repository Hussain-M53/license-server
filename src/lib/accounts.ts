import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { passwordResets, sessions, users, type Role } from "@/db/schema";
import { recordEvent } from "./audit";
import type { Actor } from "./catalog";
import { invalid, type FormState } from "./forms";
import { newId } from "./ids";
import { hashPassword, passwordProblems, verifyPassword } from "./passwords";
import { randomToken, tokenDigest } from "./secrets";

export const SESSION_HOURS = 8;
export const RESET_LINK_HOURS = 24;
const MAX_FAILED_SIGN_INS = 5;
const LOCK_MINUTES = 15;

const ROLE_RANK: Record<Role, number> = { viewer: 1, support: 2, admin: 3 };

export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export type SessionUser = { id: string; email: string; name: string; role: Role };

const email = z.email("Enter a valid e-mail address.").trim().toLowerCase().max(254);
const name = z.string().trim().min(1, "Enter your name.").max(80, "Use at most 80 characters.");

const newAccountInput = z
  .object({ name, email, password: z.string(), confirm: z.string() })
  .superRefine((value, context) => {
    for (const message of passwordProblems(value.password, value)) context.addIssue({ code: "custom", path: ["password"], message });
    if (value.password !== value.confirm) context.addIssue({ code: "custom", path: ["confirm"], message: "The passwords differ." });
  });

/**
 * Requests dashboard access. The account waits for an administrator's
 * approval; nothing tells the requester whether the e-mail was already known.
 */
export async function signUp(
  db: Db,
  input: unknown,
  context: { ip: string | null; allowedDomains: string[] },
): Promise<FormState> {
  const parsed = newAccountInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { name, email, password } = parsed.data;
  const domain = email.split("@")[1];
  if (context.allowedDomains.length > 0 && !context.allowedDomains.includes(domain)) {
    return { ok: false, errors: { email: [`Use your ${context.allowedDomains.map((d) => `@${d}`).join(" or ")} address.`] } };
  }
  const passwordHash = await hashPassword(password);
  const inserted = await db
    .insert(users)
    .values({ id: newId("usr"), email, name, passwordHash, status: "pending" })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  await recordEvent(db, {
    type: inserted.length ? "user.signed_up" : "user.sign_up_repeated",
    actor: email,
    ip: context.ip,
    details: { name },
  });
  return { ok: true };
}

/**
 * Creates the first administrator, once, for whoever knows SETUP_TOKEN.
 * Serialised with an advisory lock so two simultaneous attempts cannot both succeed.
 */
export async function setupFirstAdmin(
  db: Db,
  input: unknown,
  context: { ip: string | null; setupToken: string | undefined },
): Promise<FormState & { userId?: string }> {
  if (!context.setupToken) return { ok: false, message: "Setup is turned off. Set SETUP_TOKEN on the server to use it." };
  const parsed = newAccountInput.and(z.object({ token: z.string() })).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const given = Buffer.from(parsed.data.token.trim());
  const expected = Buffer.from(context.setupToken);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await recordEvent(db, { type: "setup.refused", actor: parsed.data.email, ip: context.ip });
    return { ok: false, errors: { token: ["This setup code is not correct."] } };
  }
  const passwordHash = await hashPassword(parsed.data.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7311001)`);
    if (await adminExists(tx)) return { ok: false, message: "Setup has already been completed. Sign in instead." };
    const now = new Date();
    const [created] = await tx
      .insert(users)
      .values({
        id: newId("usr"),
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: "admin",
        status: "active",
        approvedAt: now,
        approvedBy: "setup",
      })
      .onConflictDoUpdate({
        // An earlier pending request with this e-mail becomes the administrator.
        target: users.email,
        set: { name: parsed.data.name, passwordHash, role: "admin", status: "active", approvedAt: now, approvedBy: "setup" },
      })
      .returning({ id: users.id });
    await recordEvent(tx, { type: "setup.completed", actor: parsed.data.email, ip: context.ip });
    return { ok: true, userId: created.id };
  });
}

export async function adminExists(db: Db): Promise<boolean> {
  const [{ admins }] = await db
    .select({ admins: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return admins > 0;
}

const signInInput = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(1024) });

export type SignInResult = { ok: true; user: SessionUser } | { ok: false; message: string };

/**
 * Checks credentials. Five wrong passwords lock the account for 15 minutes.
 * Only a correct password reveals that an account is pending or disabled.
 */
export async function authenticate(db: Db, input: unknown, context: { ip: string | null; now?: Date }): Promise<SignInResult> {
  const now = context.now ?? new Date();
  const parsed = signInInput.safeParse(input);
  const wrong = { ok: false as const, message: "The e-mail or password is not correct." };
  if (!parsed.success) return wrong;
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (user?.lockedUntil && user.lockedUntil > now) {
    return { ok: false, message: "Too many wrong passwords. Try again in 15 minutes, or ask an administrator for a reset link." };
  }
  const valid = await verifyPassword(user?.passwordHash ?? null, parsed.data.password);
  if (!user || !valid) {
    if (user) {
      const failures = user.failedSignIns + 1;
      const locked = failures >= MAX_FAILED_SIGN_INS;
      await db
        .update(users)
        .set({ failedSignIns: locked ? 0 : failures, lockedUntil: locked ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id));
      await recordEvent(db, { type: locked ? "user.locked" : "user.sign_in_failed", actor: user.email, ip: context.ip });
    } else {
      await recordEvent(db, { type: "user.sign_in_failed", actor: parsed.data.email, ip: context.ip, details: { unknown: true } });
    }
    return wrong;
  }
  if (user.status === "pending") return { ok: false, message: "Your access request is waiting for an administrator's approval." };
  if (user.status === "disabled" || !user.role) return { ok: false, message: "This account has been disabled." };
  await db.update(users).set({ failedSignIns: 0, lockedUntil: null, lastSignInAt: now }).where(eq(users.id, user.id));
  await recordEvent(db, { type: "user.signed_in", actor: user.email, ip: context.ip });
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function createSession(
  db: Db,
  userId: string,
  context: { ip: string | null; userAgent: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = context.now ?? new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000);
  await db.insert(sessions).values({
    id: tokenDigest(token),
    userId,
    expiresAt,
    createdAt: now,
    ip: context.ip,
    userAgent: context.userAgent?.slice(0, 300) ?? null,
  });
  // Housekeeping: expired sessions are useless.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.expiresAt} < ${now}`));
  return { token, expiresAt };
}

/** The signed-in user for a session token, if the session is current and the account active. */
export async function sessionUser(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenDigest(token)), gt(sessions.expiresAt, now)));
  if (!row || row.status !== "active" || !row.role) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, tokenDigest(token)));
}

// ---------------------------------------------------------------------------
// Team management (administrators)

type TeamResult = FormState;

async function guardLastAdmin(db: Db, userId: string): Promise<TeamResult | null> {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return { ok: false, message: "This user no longer exists." };
  if (target.role === "admin" && target.status === "active") {
    const [{ others }] = await db
      .select({ others: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId)));
    if (others === 0) return { ok: false, message: "There must always be at least one active administrator." };
  }
  return null;
}

const roleInput = z.enum(["admin", "support", "viewer"], { message: "Choose a role." });

export async function approveUser(db: Db, actor: Actor, userId: string, role: unknown, now = new Date()): Promise<TeamResult> {
  const parsedRole = roleInput.safeParse(role);
  if (!parsedRole.success) return { ok: false, message: "Choose a role." };
  const updated = await db
    .update(users)
    .set({ status: "active", role: parsedRole.data, approvedAt: now, approvedBy: actor.email })
    .where(and(eq(users.id, userId), eq(users.status, "pending")))
    .returning({ email: users.email });
  if (!updated.length) return { ok: false, message: "This request was already handled." };
  await recordEvent(db, { type: "user.approved", actor: actor.email, ip: actor.ip, details: { user: updated[0].email, role: parsedRole.data } });
  return { ok: true, message: `${updated[0].email} can now sign in as ${parsedRole.data}.` };
}

export async function declineUser(db: Db, actor: Actor, userId: string): Promise<TeamResult> {
  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.status, "pending")))
    .returning({ email: users.email });
  if (!deleted.length) return { ok: false, message: "This request was already handled." };
  await recordEvent(db, { type: "user.declined", actor: actor.email, ip: actor.ip, details: { user: deleted[0].email } });
  return { ok: true, message: `The request from ${deleted[0].email} was declined.` };
}

export async function changeRole(db: Db, actor: Actor & { id: string }, userId: string, role: unknown): Promise<TeamResult> {
  const parsedRole = roleInput.safeParse(role);
  if (!parsedRole.success) return { ok: false, message: "Choose a role." };
  if (userId === actor.id) return { ok: false, message: "Ask another administrator to change your own role." };
  if (parsedRole.data !== "admin") {
    const blocked = await guardLastAdmin(db, userId);
    if (blocked) return blocked;
  }
  const updated = await db
    .update(users)
    .set({ role: parsedRole.data })
    .where(and(eq(users.id, userId), eq(users.status, "active")))
    .returning({ email: users.email });
  if (!updated.length) return { ok: false, message: "Only active users have a role." };
  await recordEvent(db, { type: "user.role_changed", actor: actor.email, ip: actor.ip, details: { user: updated[0].email, role: parsedRole.data } });
  return { ok: true, message: `${updated[0].email} is now ${parsedRole.data}.` };
}

export async function setUserDisabled(db: Db, actor: Actor & { id: string }, userId: string, disabled: boolean): Promise<TeamResult> {
  if (userId === actor.id) return { ok: false, message: "You cannot disable your own account." };
  if (disabled) {
    const blocked = await guardLastAdmin(db, userId);
    if (blocked) return blocked;
  }
  const updated = await db
    .update(users)
    .set({ status: disabled ? "disabled" : "active" })
    .where(and(eq(users.id, userId), eq(users.status, disabled ? "active" : "disabled"), sql`${users.role} is not null`))
    .returning({ email: users.email });
  if (!updated.length) return { ok: false, message: "Nothing to change." };
  if (disabled) await db.delete(sessions).where(eq(sessions.userId, userId));
  await recordEvent(db, {
    type: disabled ? "user.disabled" : "user.enabled",
    actor: actor.email,
    ip: actor.ip,
    details: { user: updated[0].email },
  });
  return { ok: true, message: `${updated[0].email} is ${disabled ? "disabled" : "enabled again"}.` };
}

/**
 * One-time link for a user who forgot the password. There is no e-mail: the
 * administrator passes the link on. Earlier unused links stop working.
 */
export async function createResetLink(
  db: Db,
  actor: Actor,
  userId: string,
  now = new Date(),
): Promise<{ ok: true; token: string; email: string } | { ok: false; message: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status !== "active") return { ok: false, message: "Only active users can get a reset link." };
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.update(passwordResets).set({ used: true }).where(and(eq(passwordResets.userId, userId), eq(passwordResets.used, false)));
    await tx.insert(passwordResets).values({
      id: tokenDigest(token),
      userId,
      expiresAt: new Date(now.getTime() + RESET_LINK_HOURS * 3600_000),
      createdBy: actor.email,
      createdAt: now,
    });
    await recordEvent(tx, { type: "user.reset_link_created", actor: actor.email, ip: actor.ip, details: { user: user.email } });
  });
  return { ok: true, token, email: user.email };
}

/** The account a reset link is for, while the link is usable. */
export async function resetLinkUser(db: Db, token: string, now = new Date()): Promise<{ id: string; email: string; name: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, status: users.status })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.id, tokenDigest(token)), eq(passwordResets.used, false), gt(passwordResets.expiresAt, now)));
  return row && row.status === "active" ? { id: row.id, email: row.email, name: row.name } : null;
}

const newPasswordInput = z
  .object({ password: z.string(), confirm: z.string() })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], message: "The passwords differ." });

async function storeNewPassword(db: Db, user: { id: string; email: string; name: string }, password: string): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), failedSignIns: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
}

export async function resetPassword(db: Db, token: string, input: unknown, context: { ip: string | null; now?: Date }): Promise<FormState> {
  const now = context.now ?? new Date();
  const parsed = newPasswordInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await resetLinkUser(db, token, now);
  if (!user) return { ok: false, message: "This link has expired or was already used. Ask an administrator for a new one." };
  const problems = passwordProblems(parsed.data.password, user);
  if (problems.length) return { ok: false, errors: { password: problems } };
  // Claim the link first, so it works only once even if submitted twice.
  const claimed = await db
    .update(passwordResets)
    .set({ used: true })
    .where(and(eq(passwordResets.id, tokenDigest(token)), eq(passwordResets.used, false)))
    .returning({ id: passwordResets.id });
  if (!claimed.length) return { ok: false, message: "This link was already used." };
  await storeNewPassword(db, user, parsed.data.password);
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await recordEvent(db, { type: "user.password_reset", actor: user.email, ip: context.ip });
  return { ok: true, message: "Your password was changed. Sign in with the new one." };
}

export async function changePassword(
  db: Db,
  user: SessionUser,
  input: unknown,
  context: { ip: string | null; currentSessionToken: string },
): Promise<FormState> {
  const parsed = newPasswordInput.and(z.object({ current: z.string() })).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await verifyPassword(row.passwordHash, parsed.data.current))) {
    return { ok: false, errors: { current: ["This is not your current password."] } };
  }
  const problems = passwordProblems(parsed.data.password, user);
  if (problems.length) return { ok: false, errors: { password: problems } };
  await storeNewPassword(db, user, parsed.data.password);
  // Sign out everywhere else.
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, tokenDigest(context.currentSessionToken))));
  await recordEvent(db, { type: "user.password_changed", actor: user.email, ip: context.ip });
  return { ok: true, message: "Your password was changed. Other sessions were signed out." };
}
