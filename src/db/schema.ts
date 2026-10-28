import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { MachineIds } from "@/lib/machine";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A product that can be licensed, e.g. ENERCEON. */
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  /** Upper-case code the product sends when activating, e.g. "ENERCEON". */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Start of every key for this product, e.g. "ENRC". */
  keyPrefix: text("key_prefix").notNull().unique(),
  createdAt: createdAt(),
});

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    notes: text("notes"),
    createdAt: createdAt(),
    createdBy: text("created_by"),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

export const LICENSE_STATUSES = ["active", "suspended", "revoked"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const licenses = pgTable(
  "licenses",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id),
    customerId: text("customer_id").notNull().references(() => customers.id),
    /** HMAC-SHA256 of the canonical key: lookups without storing the key. */
    keyHash: text("key_hash").notNull().unique(),
    /** AES-256-GCM copy of the key, so an admin can reveal it again. */
    keyCiphertext: text("key_ciphertext").notNull(),
    /** Last group of the key, for support conversations. */
    keyHint: text("key_hint").notNull(),
    status: text("status", { enum: LICENSE_STATUSES }).notNull().default("active"),
    maxActivations: integer("max_activations").notNull().default(1),
    kind: text("kind").notNull().default("perpetual"),
    /** Your quote or invoice number. */
    reference: text("reference"),
    notes: text("notes"),
    createdAt: createdAt(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("licenses_customer_idx").on(t.customerId),
    index("licenses_product_idx").on(t.productId),
    check("licenses_status_check", sql`${t.status} in ('active', 'suspended', 'revoked')`),
    check("licenses_max_activations_check", sql`${t.maxActivations} between 1 and 1000`),
  ],
);

export const ACTIVATION_STATUSES = ["active", "reset"] as const;

export const activations = pgTable(
  "activations",
  {
    id: text("id").primaryKey(),
    licenseId: text("license_id").notNull().references(() => licenses.id),
    fingerprintVersion: integer("fingerprint_version").notNull(),
    /** Hashed hardware and Windows ids of the computer (never raw serials). */
    machineIds: jsonb("machine_ids").$type<MachineIds>().notNull(),
    machineName: text("machine_name").notNull(),
    windowsVersion: text("windows_version"),
    appVersion: text("app_version"),
    installationId: text("installation_id"),
    method: text("method", { enum: ["online", "offline"] }).notNull(),
    status: text("status", { enum: ACTIVATION_STATUSES }).notNull().default("active"),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    resetBy: text("reset_by"),
    resetReason: text("reset_reason"),
  },
  (t) => [
    index("activations_license_idx").on(t.licenseId),
    check("activations_status_check", sql`${t.status} in ('active', 'reset')`),
    check("activations_method_check", sql`${t.method} in ('online', 'offline')`),
  ],
);

/** Append-only audit log of everything that happens. */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    /** Dashboard user's e-mail, or "client" for activations. */
    actor: text("actor"),
    ip: text("ip"),
    licenseId: text("license_id"),
    activationId: text("activation_id"),
    customerId: text("customer_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("events_at_idx").on(t.at), index("events_license_idx").on(t.licenseId)],
);

export const ROLES = ["admin", "support", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const USER_STATUSES = ["pending", "active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Dashboard accounts. New sign-ups stay pending until an admin approves them. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Always stored in lower case. */
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }),
    status: text("status", { enum: USER_STATUSES }).notNull().default("pending"),
    failedSignIns: integer("failed_sign_ins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  },
  (t) => [
    check("users_status_check", sql`${t.status} in ('pending', 'active', 'disabled')`),
    check("users_role_check", sql`${t.role} is null or ${t.role} in ('admin', 'support', 'viewer')`),
    check("users_active_role_check", sql`${t.status} <> 'active' or ${t.role} is not null`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself is only in the cookie. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time links an admin creates when a user forgets a password. */
export const passwordResets = pgTable("password_resets", {
  /** SHA-256 of the token in the link. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  used: boolean("used").notNull().default(false),
});

/** Fixed-window counters for rate limiting. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
