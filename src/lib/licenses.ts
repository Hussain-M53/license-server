import "server-only";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { activations, customers, licenses, products, type LicenseStatus } from "@/db/schema";
import { recordEvent } from "./audit";
import type { Actor } from "./catalog";
import { invalid, isUniqueViolation, optionalText, type FormState } from "./forms";
import { newId } from "./ids";
import { generateLicenseKey, maskedKey, parseLicenseKey } from "./license-keys";
import { decryptLicenseKey, encryptLicenseKey, keyHash } from "./secrets";

export const licenseInput = z.object({
  productId: z.string().min(1, "Choose a product."),
  customerId: z.string().min(1, "Choose a customer."),
  maxActivations: z.coerce
    .number({ message: "Enter a number." })
    .int("Enter a whole number.")
    .min(1, "At least 1 computer.")
    .max(1000, "At most 1000 computers."),
  reference: optionalText(80),
  notes: optionalText(2000),
});

export type NewLicense = FormState & { licenseId?: string; key?: string };

/** Issues a key. The full key is returned once here; afterwards only admins can reveal it. */
export async function createLicense(db: Db, actor: Actor, input: unknown): Promise<NewLicense> {
  const parsed = licenseInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { productId, customerId, ...rest } = parsed.data;
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!product || !customer) return { ok: false, message: "Choose a product and a customer that exist." };

  // A collision of 120 random bits will not happen; the retry only keeps the code honest.
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = generateLicenseKey(product.keyPrefix);
    const parsedKey = parseLicenseKey(key)!;
    const id = newId("lic");
    try {
      await db.transaction(async (tx) => {
        await tx.insert(licenses).values({
          id,
          productId,
          customerId,
          keyHash: keyHash(parsedKey.canonical),
          keyCiphertext: encryptLicenseKey(parsedKey.canonical, id),
          keyHint: parsedKey.hint,
          createdBy: actor.email,
          ...rest,
        });
        await recordEvent(tx, {
          type: "license.created",
          actor: actor.email,
          ip: actor.ip,
          licenseId: id,
          customerId,
          details: {
            product: product.code,
            key: maskedKey(product.keyPrefix, parsedKey.hint),
            maxActivations: rest.maxActivations,
            reference: rest.reference,
          },
        });
      });
      return { ok: true, licenseId: id, key: parsedKey.canonical };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Could not generate a unique license key");
}

export const licenseUpdateInput = licenseInput.pick({ maxActivations: true, reference: true, notes: true });

export async function updateLicense(db: Db, actor: Actor, licenseId: string, input: unknown): Promise<FormState> {
  const parsed = licenseUpdateInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [license] = await db.select().from(licenses).where(eq(licenses.id, licenseId));
  if (!license) return { ok: false, message: "This license no longer exists." };
  const [{ active }] = await db
    .select({ active: count() })
    .from(activations)
    .where(and(eq(activations.licenseId, licenseId), eq(activations.status, "active")));
  if (parsed.data.maxActivations < active) {
    return {
      ok: false,
      message: `${active} computers are using this key. Reset activations before lowering the number below that.`,
      errors: { maxActivations: [`At least ${active}.`] },
    };
  }
  await db.update(licenses).set(parsed.data).where(eq(licenses.id, licenseId));
  await recordEvent(db, {
    type: "license.updated",
    actor: actor.email,
    ip: actor.ip,
    licenseId,
    customerId: license.customerId,
    details: {
      maxActivations:
        license.maxActivations !== parsed.data.maxActivations ? [license.maxActivations, parsed.data.maxActivations] : undefined,
      reference: license.reference !== parsed.data.reference ? parsed.data.reference : undefined,
      notesChanged: license.notes !== parsed.data.notes || undefined,
    },
  });
  return { ok: true, message: "Saved." };
}

export type StatusChange = "suspend" | "resume" | "revoke";

const TRANSITIONS: Record<StatusChange, { from: LicenseStatus[]; to: LicenseStatus; event: string }> = {
  suspend: { from: ["active"], to: "suspended", event: "license.suspended" },
  resume: { from: ["suspended"], to: "active", event: "license.resumed" },
  revoke: { from: ["active", "suspended"], to: "revoked", event: "license.revoked" },
};

const reasonInput = z.string().trim().min(3, "Give a reason (it goes into the audit log).").max(500);

/**
 * Suspend (reversible) or revoke (permanent). In phase 1 both stop new
 * activations; computers that already hold a license file keep working.
 */
export async function changeLicenseStatus(
  db: Db,
  actor: Actor,
  licenseId: string,
  change: StatusChange,
  reason: unknown,
): Promise<FormState> {
  const parsedReason = reasonInput.safeParse(reason ?? "");
  if (!parsedReason.success) return { ok: false, errors: { reason: parsedReason.error.issues.map((i) => i.message) } };
  const rule = TRANSITIONS[change];
  return db.transaction(async (tx) => {
    const [license] = await tx.select().from(licenses).where(eq(licenses.id, licenseId)).for("update");
    if (!license) return { ok: false, message: "This license no longer exists." };
    if (!rule.from.includes(license.status)) return { ok: false, message: `The license is ${license.status}; it cannot be changed that way.` };
    await tx.update(licenses).set({ status: rule.to }).where(eq(licenses.id, licenseId));
    await recordEvent(tx, {
      type: rule.event,
      actor: actor.email,
      ip: actor.ip,
      licenseId,
      customerId: license.customerId,
      details: { reason: parsedReason.data },
    });
    return { ok: true, message: `The license is now ${rule.to}.` };
  });
}

/**
 * Frees a computer's place, e.g. when the customer replaces a server. In
 * phase 1 the old computer keeps its license file; phase 2 check-ins end it.
 */
export async function resetActivation(
  db: Db,
  actor: Actor,
  activationId: string,
  reason: unknown,
  now = new Date(),
): Promise<FormState> {
  const parsedReason = reasonInput.safeParse(reason ?? "");
  if (!parsedReason.success) return { ok: false, errors: { reason: parsedReason.error.issues.map((i) => i.message) } };
  return db.transaction(async (tx) => {
    const [activation] = await tx.select().from(activations).where(eq(activations.id, activationId)).for("update");
    if (!activation || activation.status !== "active") return { ok: false, message: "This activation is not active." };
    await tx
      .update(activations)
      .set({ status: "reset", resetAt: now, resetBy: actor.email, resetReason: parsedReason.data })
      .where(eq(activations.id, activationId));
    const [license] = await tx.select({ customerId: licenses.customerId }).from(licenses).where(eq(licenses.id, activation.licenseId));
    await recordEvent(tx, {
      type: "activation.reset",
      actor: actor.email,
      ip: actor.ip,
      licenseId: activation.licenseId,
      activationId,
      customerId: license?.customerId,
      details: { computer: activation.machineName, reason: parsedReason.data },
    });
    return { ok: true, message: `${activation.machineName} no longer holds this key. The customer can now activate another computer.` };
  });
}

/** Decrypts the stored copy of a key; every reveal is audited. */
export async function revealLicenseKey(db: Db, actor: Actor, licenseId: string): Promise<string | null> {
  const [license] = await db.select().from(licenses).where(eq(licenses.id, licenseId));
  if (!license) return null;
  const key = decryptLicenseKey(license.keyCiphertext, license.id);
  await recordEvent(db, {
    type: "license.key_revealed",
    actor: actor.email,
    ip: actor.ip,
    licenseId,
    customerId: license.customerId,
  });
  return key;
}

/** Finds the license of a full key pasted into the search box. */
export async function findLicenseIdByKey(db: Db, text: string): Promise<string | null> {
  const key = parseLicenseKey(text);
  if (!key) return null;
  const [license] = await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.keyHash, keyHash(key.canonical)));
  return license?.id ?? null;
}
