import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { customers, products } from "@/db/schema";
import { recordEvent } from "./audit";
import { invalid, isUniqueViolation, optionalText, type FormState } from "./forms";
import { newId } from "./ids";
import { KEY_PREFIX_PATTERN } from "./license-keys";

/** Who is acting, for the audit log. */
export type Actor = { email: string; ip: string | null };

export const productInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,32}$/, "Use 2-32 capital letters, digits, dashes or underscores."),
  name: z.string().trim().min(1, "Enter the product's name.").max(80, "Use at most 80 characters."),
  keyPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(KEY_PREFIX_PATTERN, "Use 2-8 capital letters or digits, starting with a letter."),
});

export async function createProduct(db: Db, actor: Actor, input: unknown): Promise<FormState & { productId?: string }> {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const id = newId("prd");
  try {
    await db.insert(products).values({ id, ...parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Another product already uses this code or key prefix." };
    throw error;
  }
  await recordEvent(db, { type: "product.created", actor: actor.email, ip: actor.ip, details: parsed.data });
  return { ok: true, message: `${parsed.data.name} was added.`, productId: id };
}

export const customerInput = z.object({
  name: z.string().trim().min(1, "Enter the customer's name.").max(120, "Use at most 120 characters."),
  contactName: optionalText(120),
  email: z
    .union([z.literal(""), z.email("Enter a valid e-mail address.").trim().toLowerCase()])
    .optional()
    .transform((value) => value || null),
  phone: optionalText(40),
  country: optionalText(60),
  notes: optionalText(2000),
});

export async function createCustomer(db: Db, actor: Actor, input: unknown): Promise<FormState & { customerId?: string }> {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const id = newId("cus");
  await db.insert(customers).values({ id, ...parsed.data, createdBy: actor.email });
  await recordEvent(db, {
    type: "customer.created",
    actor: actor.email,
    ip: actor.ip,
    customerId: id,
    details: { name: parsed.data.name },
  });
  return { ok: true, message: `${parsed.data.name} was added.`, customerId: id };
}

export async function updateCustomer(db: Db, actor: Actor, customerId: string, input: unknown): Promise<FormState> {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [before] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!before) return { ok: false, message: "This customer no longer exists." };
  await db.update(customers).set(parsed.data).where(eq(customers.id, customerId));
  const changed = Object.keys(parsed.data).filter(
    (field) => before[field as keyof typeof before] !== parsed.data[field as keyof typeof parsed.data],
  );
  await recordEvent(db, {
    type: "customer.updated",
    actor: actor.email,
    ip: actor.ip,
    customerId,
    details: { changed },
  });
  return { ok: true, message: "Saved." };
}
