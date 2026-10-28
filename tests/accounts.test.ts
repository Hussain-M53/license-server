import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import {
  approveUser,
  authenticate,
  changePassword,
  changeRole,
  createResetLink,
  createSession,
  declineUser,
  deleteSession,
  resetPassword,
  sessionUser,
  setupFirstAdmin,
  setUserDisabled,
  signUp,
} from "@/lib/accounts";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/passwords";
import { testDb } from "./support/db";

let db: Db;
const ip = "203.0.113.20";
const setupToken = process.env.SETUP_TOKEN!;
const strong = "correct horse battery staple";

beforeAll(async () => {
  db = await testDb();
});

async function signedUp(email: string, name = "Sam Support") {
  expect(await signUp(db, { name, email, password: strong, confirm: strong }, { ip, allowedDomains: [] })).toEqual({ ok: true });
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user;
}

describe("passwords", () => {
  it("hash with a salt and verify", async () => {
    const hash = await hashPassword(strong);
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await hashPassword(strong)).not.toBe(hash);
    expect(await verifyPassword(hash, strong)).toBe(true);
    expect(await verifyPassword(hash, `${strong}!`)).toBe(false);
    expect(await verifyPassword(null, strong)).toBe(false);
    expect(await verifyPassword("garbage", strong)).toBe(false);
  });

  it("reject short, guessable and personal passwords", () => {
    expect(passwordProblems("short")).toContain("Use at least 12 characters.");
    expect(passwordProblems("mypassword2026")).toContain("This password is too easy to guess.");
    expect(passwordProblems("aaaaaaaaaaaaaaaa")).toContain("This password is too easy to guess.");
    expect(passwordProblems("mustafa-is-great!", { email: "mustafa@example.com" })).toContain(
      "Do not use your name or e-mail in the password.",
    );
    expect(passwordProblems(strong, { email: "sam@example.com", name: "Sam Support" })).toEqual([]);
  });
});

describe("first administrator", () => {
  it("needs the setup code, works once, and then setup is closed", async () => {
    const input = { name: "Ayesha Admin", email: "Admin@Example.com", password: strong, confirm: strong };
    expect(await setupFirstAdmin(db, { ...input, token: "wrong-token-wrong-token-wrong" }, { ip, setupToken })).toMatchObject({
      ok: false,
      errors: { token: expect.any(Array) },
    });
    expect(await setupFirstAdmin(db, { ...input, token: setupToken }, { ip, setupToken: undefined })).toMatchObject({ ok: false });
    const created = await setupFirstAdmin(db, { ...input, token: setupToken }, { ip, setupToken });
    expect(created).toMatchObject({ ok: true });
    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com"));
    expect(admin).toMatchObject({ role: "admin", status: "active" });
    const again = await setupFirstAdmin(db, { ...input, email: "other@example.com", token: setupToken }, { ip, setupToken });
    expect(again).toMatchObject({ ok: false, message: expect.stringContaining("already") });
  });
});

describe("sign-up and approval", () => {
  it("creates pending accounts that cannot sign in until approved", async () => {
    const user = await signedUp("Pending.Person@Example.com");
    expect(user).toMatchObject({ email: "pending.person@example.com", status: "pending", role: null });
    expect(await authenticate(db, { email: "pending.person@example.com", password: strong }, { ip })).toMatchObject({
      ok: false,
      message: expect.stringContaining("waiting"),
    });
    const admin = { email: "admin@example.com", ip };
    expect(await approveUser(db, admin, user.id, "support")).toMatchObject({ ok: true });
    expect(await approveUser(db, admin, user.id, "admin")).toMatchObject({ ok: false });
    const signIn = await authenticate(db, { email: " PENDING.person@example.com ", password: strong }, { ip });
    expect(signIn).toMatchObject({ ok: true, user: { role: "support" } });
  });

  it("does not reveal that an e-mail is already registered", async () => {
    await signedUp("taken@example.com");
    const again = await signUp(db, { name: "Someone", email: "taken@example.com", password: `${strong}2`, confirm: `${strong}2` }, { ip, allowedDomains: [] });
    expect(again).toEqual({ ok: true });
  });

  it("can be limited to company e-mail domains", async () => {
    const result = await signUp(db, { name: "Out Sider", email: "x@gmail.com", password: strong, confirm: strong }, { ip, allowedDomains: ["vizualtechs.com"] });
    expect(result).toMatchObject({ ok: false, errors: { email: ["Use your @vizualtechs.com address."] } });
  });

  it("validates the form", async () => {
    const result = await signUp(db, { name: "", email: "nope", password: "short", confirm: "other" }, { ip, allowedDomains: [] });
    expect(Object.keys(result.errors ?? {}).sort()).toEqual(["confirm", "email", "name", "password"]);
  });

  it("lets a declined request disappear", async () => {
    const user = await signedUp("declined@example.com");
    expect(await declineUser(db, { email: "admin@example.com", ip }, user.id)).toMatchObject({ ok: true });
    expect(await db.select().from(users).where(eq(users.id, user.id))).toEqual([]);
  });
});

describe("sign-in", () => {
  it("locks an account after five wrong passwords", async () => {
    const user = await signedUp("locked@example.com");
    await approveUser(db, { email: "admin@example.com", ip }, user.id, "viewer");
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      expect(await authenticate(db, { email: "locked@example.com", password: "wrong password" }, { ip, now })).toMatchObject({
        message: "The e-mail or password is not correct.",
      });
    }
    expect(await authenticate(db, { email: "locked@example.com", password: strong }, { ip, now })).toMatchObject({
      ok: false,
      message: expect.stringContaining("Too many"),
    });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await authenticate(db, { email: "locked@example.com", password: strong }, { ip, now: later })).toMatchObject({ ok: true });
  });

  it("gives the same answer for unknown e-mails and wrong passwords", async () => {
    const unknown = await authenticate(db, { email: "nobody@example.com", password: strong }, { ip });
    const wrong = await authenticate(db, { email: "admin@example.com", password: "not the password" }, { ip });
    expect(unknown).toEqual(wrong);
  });
});

describe("sessions", () => {
  it("last eight hours and end on sign-out or when the account is disabled", async () => {
    const user = await signedUp("session@example.com");
    const admin = await db.select().from(users).where(eq(users.email, "admin@example.com")).then(([row]) => row);
    await approveUser(db, { email: admin.email, ip }, user.id, "viewer");
    const now = new Date();
    const { token } = await createSession(db, user.id, { ip, userAgent: "test", now });
    expect(await sessionUser(db, token, now)).toMatchObject({ email: "session@example.com", role: "viewer" });
    expect(await sessionUser(db, token, new Date(now.getTime() + 8 * 3600_000 + 1000))).toBeNull();
    expect(await sessionUser(db, "forged-token", now)).toBeNull();

    const [stored] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(stored.id).not.toBe(token);

    await deleteSession(db, token);
    expect(await sessionUser(db, token, now)).toBeNull();

    const second = await createSession(db, user.id, { ip, userAgent: "test", now });
    expect(await setUserDisabled(db, { ...admin, ip }, user.id, true)).toMatchObject({ ok: true });
    expect(await sessionUser(db, second.token, now)).toBeNull();
    expect(await authenticate(db, { email: "session@example.com", password: strong }, { ip })).toMatchObject({
      message: "This account has been disabled.",
    });
  });
});

describe("team rules", () => {
  it("always keep one active administrator, and nobody changes their own role", async () => {
    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com"));
    const self = { id: admin.id, email: admin.email, ip };
    expect(await changeRole(db, self, admin.id, "viewer")).toMatchObject({ ok: false });
    expect(await setUserDisabled(db, self, admin.id, true)).toMatchObject({ ok: false });

    const other = await signedUp("second.admin@example.com");
    await approveUser(db, self, other.id, "admin");
    const otherActor = { id: other.id, email: other.email, ip };
    expect(await changeRole(db, otherActor, admin.id, "support")).toMatchObject({ ok: true });
    expect(await changeRole(db, self, other.id, "viewer")).toMatchObject({ ok: false, message: expect.stringContaining("at least one") });
    expect(await changeRole(db, otherActor, admin.id, "admin")).toMatchObject({ ok: true });
  });
});

describe("password reset links", () => {
  it("work once, within a day, and sign the user out everywhere", async () => {
    const user = await signedUp("forgetful@example.com");
    const admin = { email: "admin@example.com", ip };
    await approveUser(db, admin, user.id, "support");
    const session = await createSession(db, user.id, { ip, userAgent: null });
    const link = await createResetLink(db, admin, user.id);
    if (!link.ok) throw new Error(link.message);

    const newPassword = "a whole new passphrase here";
    expect(await resetPassword(db, link.token, { password: newPassword, confirm: "different" }, { ip })).toMatchObject({ ok: false });
    expect(await resetPassword(db, link.token, { password: newPassword, confirm: newPassword }, { ip })).toMatchObject({ ok: true });
    expect(await resetPassword(db, link.token, { password: newPassword, confirm: newPassword }, { ip })).toMatchObject({ ok: false });
    expect(await sessionUser(db, session.token)).toBeNull();
    expect(await authenticate(db, { email: "forgetful@example.com", password: newPassword }, { ip })).toMatchObject({ ok: true });

    const old = await createResetLink(db, admin, user.id);
    const newer = await createResetLink(db, admin, user.id);
    if (!old.ok || !newer.ok) throw new Error("links");
    expect(await resetPassword(db, old.token, { password: newPassword, confirm: newPassword }, { ip })).toMatchObject({ ok: false });
    const tomorrow = new Date(Date.now() + 25 * 3600_000);
    expect(await resetPassword(db, newer.token, { password: newPassword, confirm: newPassword }, { ip, now: tomorrow })).toMatchObject({
      ok: false,
      message: expect.stringContaining("expired"),
    });
  });

  it("change a password only with the current one, keeping this session", async () => {
    const user = await signedUp("changer@example.com", "Chris Changer");
    await approveUser(db, { email: "admin@example.com", ip }, user.id, "viewer");
    const here = await createSession(db, user.id, { ip, userAgent: null });
    const elsewhere = await createSession(db, user.id, { ip, userAgent: null });
    const me = { id: user.id, email: user.email, name: user.name, role: "viewer" as const };
    const next = "another strong passphrase";
    expect(await changePassword(db, me, { current: "wrong", password: next, confirm: next }, { ip, currentSessionToken: here.token })).toMatchObject({
      errors: { current: expect.any(Array) },
    });
    expect(await changePassword(db, me, { current: strong, password: next, confirm: next }, { ip, currentSessionToken: here.token })).toMatchObject({
      ok: true,
    });
    expect(await sessionUser(db, here.token)).not.toBeNull();
    expect(await sessionUser(db, elsewhere.token)).toBeNull();
  });
});
