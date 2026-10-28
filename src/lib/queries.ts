import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activations, customers, events, licenses, products, users, type LicenseStatus } from "@/db/schema";

/**
 * Read-side data access for the dashboard. Each function returns only what a
 * page shows: never key hashes, encrypted keys or password hashes.
 */

export const PAGE_SIZE = 50;

// Correlated subqueries are written out in SQL: drizzle leaves column names
// unqualified in single-table queries, which would bind them to the inner table.
const activeComputers = sql<number>`(select count(*)::int from activations a where a.license_id = "licenses"."id" and a.status = 'active')`;
const firstComputer = sql<string | null>`(select a.machine_name from activations a where a.license_id = "licenses"."id" and a.status = 'active' order by a.activated_at limit 1)`;

export type LicenseFilter = "active" | "unused" | "suspended" | "revoked";

export async function listLicenses(
  db: Db,
  options: { q?: string; productId?: string; filter?: LicenseFilter; customerId?: string; page?: number },
) {
  const conditions: SQL[] = [];
  if (options.productId) conditions.push(eq(licenses.productId, options.productId));
  if (options.customerId) conditions.push(eq(licenses.customerId, options.customerId));
  if (options.filter === "suspended" || options.filter === "revoked") conditions.push(eq(licenses.status, options.filter));
  if (options.filter === "active") conditions.push(eq(licenses.status, "active"), sql`${activeComputers} > 0`);
  if (options.filter === "unused") conditions.push(eq(licenses.status, "active"), sql`${activeComputers} = 0`);
  const q = options.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(ilike(customers.name, pattern), ilike(licenses.reference, pattern), like(licenses.keyHint, q.toUpperCase().slice(-5)))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, options.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: licenses.id,
        keyPrefix: products.keyPrefix,
        keyHint: licenses.keyHint,
        status: licenses.status,
        maxActivations: licenses.maxActivations,
        reference: licenses.reference,
        createdAt: licenses.createdAt,
        productName: products.name,
        customerId: customers.id,
        customerName: customers.name,
        computers: activeComputers,
        firstComputer,
      })
      .from(licenses)
      .innerJoin(products, eq(products.id, licenses.productId))
      .innerJoin(customers, eq(customers.id, licenses.customerId))
      .where(where)
      .orderBy(desc(licenses.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(licenses)
      .innerJoin(customers, eq(customers.id, licenses.customerId))
      .where(where),
  ]);
  return { rows, total, page };
}

export async function licenseDetail(db: Db, id: string) {
  const [license] = await db
    .select({
      id: licenses.id,
      status: licenses.status,
      keyHint: licenses.keyHint,
      maxActivations: licenses.maxActivations,
      kind: licenses.kind,
      reference: licenses.reference,
      notes: licenses.notes,
      createdAt: licenses.createdAt,
      createdBy: licenses.createdBy,
      updatedAt: licenses.updatedAt,
      productCode: products.code,
      productName: products.name,
      keyPrefix: products.keyPrefix,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(licenses)
    .innerJoin(products, eq(products.id, licenses.productId))
    .innerJoin(customers, eq(customers.id, licenses.customerId))
    .where(eq(licenses.id, id));
  if (!license) return null;
  const [computers, timeline] = await Promise.all([
    db
      .select({
        id: activations.id,
        machineName: activations.machineName,
        windowsVersion: activations.windowsVersion,
        appVersion: activations.appVersion,
        method: activations.method,
        status: activations.status,
        activatedAt: activations.activatedAt,
        lastSeenAt: activations.lastSeenAt,
        resetAt: activations.resetAt,
        resetBy: activations.resetBy,
        resetReason: activations.resetReason,
      })
      .from(activations)
      .where(eq(activations.licenseId, id))
      .orderBy(activations.status, desc(activations.activatedAt)),
    db.select().from(events).where(eq(events.licenseId, id)).orderBy(desc(events.at)).limit(100),
  ]);
  return { license, computers, timeline };
}

export async function listCustomers(db: Db, options: { q?: string; page?: number }) {
  const q = options.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : undefined;
  const where = pattern
    ? or(ilike(customers.name, pattern), ilike(customers.contactName, pattern), ilike(customers.email, pattern), ilike(customers.phone, pattern))
    : undefined;
  const page = Math.max(1, options.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        contactName: customers.contactName,
        email: customers.email,
        phone: customers.phone,
        country: customers.country,
        createdAt: customers.createdAt,
        licenseCount: sql<number>`(select count(*)::int from licenses l where l.customer_id = "customers"."id")`,
      })
      .from(customers)
      .where(where)
      .orderBy(customers.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(customers).where(where),
  ]);
  return { rows, total, page };
}

export async function customerDetail(db: Db, id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer ?? null;
}

export async function productOptions(db: Db) {
  return db.select({ id: products.id, name: products.name, code: products.code }).from(products).orderBy(products.name);
}

export async function customerOptions(db: Db) {
  return db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name);
}

export async function listProducts(db: Db) {
  return db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      keyPrefix: products.keyPrefix,
      createdAt: products.createdAt,
      licenseCount: sql<number>`(select count(*)::int from licenses l where l.product_id = "products"."id")`,
    })
    .from(products)
    .orderBy(products.name);
}

export const EVENT_GROUPS = {
  activations: "activation.",
  licenses: "license.",
  customers: "customer.",
  team: "user.",
} as const;
export type EventGroup = keyof typeof EVENT_GROUPS;

export async function listEvents(db: Db, options: { q?: string; group?: EventGroup; page?: number; pageSize?: number }) {
  const conditions: SQL[] = [];
  if (options.group) conditions.push(like(events.type, `${EVENT_GROUPS[options.group]}%`));
  const q = options.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(ilike(events.actor, pattern), ilike(events.ip, pattern), sql`${events.details}::text ilike ${pattern}`)!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const pageSize = options.pageSize ?? 100;
  const page = Math.max(1, options.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: events.id,
        at: events.at,
        type: events.type,
        actor: events.actor,
        ip: events.ip,
        licenseId: events.licenseId,
        customerId: events.customerId,
        details: events.details,
        customerName: customers.name,
      })
      .from(events)
      .leftJoin(customers, eq(customers.id, events.customerId))
      .where(where)
      .orderBy(desc(events.at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(events).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function overview(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 3600_000);
  const [[licenseCounts], [computerCount], [customerCount], [refused], [pending], recent] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) filter (where ${licenses.status} = 'active')::int`,
        suspended: sql<number>`count(*) filter (where ${licenses.status} = 'suspended')::int`,
        unused: sql<number>`count(*) filter (where ${licenses.status} = 'active' and ${activeComputers} = 0)::int`,
      })
      .from(licenses),
    db.select({ value: count() }).from(activations).where(eq(activations.status, "active")),
    db.select({ value: count() }).from(customers),
    db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.type, "activation.denied"), gte(events.at, since))),
    db.select({ value: count() }).from(users).where(and(eq(users.status, "pending"), isNull(users.role))),
    db
      .select({
        id: events.id,
        at: events.at,
        type: events.type,
        actor: events.actor,
        ip: events.ip,
        licenseId: events.licenseId,
        customerId: events.customerId,
        details: events.details,
        customerName: customers.name,
      })
      .from(events)
      .leftJoin(customers, eq(customers.id, events.customerId))
      .where(inArray(events.type, ["activation.created", "activation.renewed", "activation.denied", "activation.reset", "license.created"]))
      .orderBy(desc(events.at))
      .limit(12),
  ]);
  return {
    licenses: licenseCounts,
    computers: computerCount.value,
    customers: customerCount.value,
    refusedLast30Days: refused.value,
    pendingUsers: pending.value,
    recent,
  };
}

export async function listUsers(db: Db) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      approvedBy: users.approvedBy,
      lastSignInAt: users.lastSignInAt,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .orderBy(users.status, users.name);
}

export function isLicenseFilter(value: unknown): value is LicenseFilter {
  return value === "active" || value === "unused" || value === "suspended" || value === "revoked";
}

export type LicenseDisplayStatus = { label: string; tone: "green" | "amber" | "red" | "gray" };

export function licenseDisplayStatus(status: LicenseStatus, computers: number): LicenseDisplayStatus {
  if (status === "revoked") return { label: "Revoked", tone: "red" };
  if (status === "suspended") return { label: "Suspended", tone: "amber" };
  return computers > 0 ? { label: "Active", tone: "green" } : { label: "Not activated", tone: "gray" };
}
