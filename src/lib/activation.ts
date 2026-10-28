import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { activations, customers, licenses, products } from "@/db/schema";
import { recordEvent } from "./audit";
import { env } from "./env";
import { newId } from "./ids";
import { maskedKey, parseLicenseKey } from "./license-keys";
import { issueLicenseToken } from "./license-token";
import { FINGERPRINT_VERSION, MACHINE_ID_NAMES, machineMatches, type MachineIds } from "./machine";
import { hitRateLimit, peekRateLimit, type RateLimit } from "./rate-limit";
import { keyHash } from "./secrets";

const hashedId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}]*$/u);

/** What an installer or product sends to activate (also inside offline request files). */
export const activationRequestSchema = z.object({
  product: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,32}$/),
  key: z.string().max(100),
  machine: z.object({
    fpv: z.literal(FINGERPRINT_VERSION),
    ids: z.object({ board: hashedId.optional(), os: hashedId.optional(), disk: hashedId.optional() }),
    name: text(64).min(1),
    /** e.g. "Windows Server 2022 (20348)" */
    windows: text(100).optional(),
  }),
  app: z.object({ version: text(32).optional() }).optional(),
  /** Random id the installer keeps per installation folder. */
  installationId: text(64).optional(),
});

export type ActivationRequest = z.infer<typeof activationRequestSchema>;

export type ActivationErrorCode =
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "KEY_MALFORMED"
  | "PRODUCT_UNKNOWN"
  | "KEY_INVALID"
  | "KEY_WRONG_PRODUCT"
  | "KEY_SUSPENDED"
  | "KEY_REVOKED"
  | "MACHINE_UNIDENTIFIED"
  | "ACTIVATION_LIMIT";

/** Shown to the person installing, so plain language only. */
const FAILURES: Record<ActivationErrorCode, { status: ActivationFailure["status"]; message: string }> = {
  BAD_REQUEST: { status: 400, message: "The activation request is incomplete. Update the installer and try again." },
  RATE_LIMITED: { status: 429, message: "Too many activation attempts from this network. Wait an hour and try again." },
  KEY_MALFORMED: { status: 400, message: "This is not a valid license key. Check that it was typed correctly." },
  PRODUCT_UNKNOWN: { status: 404, message: "This product is not registered with the license server." },
  KEY_INVALID: { status: 404, message: "This license key does not exist. Check that it was typed correctly." },
  KEY_WRONG_PRODUCT: { status: 403, message: "This license key is for a different product." },
  KEY_SUSPENDED: { status: 403, message: "This license key is suspended. Contact your supplier." },
  KEY_REVOKED: { status: 403, message: "This license key has been cancelled. Contact your supplier." },
  MACHINE_UNIDENTIFIED: {
    status: 400,
    message: "This computer could not be identified, so the license cannot be bound to it. Contact your supplier.",
  },
  ACTIVATION_LIMIT: {
    status: 409,
    message: "This license key is already in use on another computer. Contact your supplier to move it to this one.",
  },
};

export type ActivationFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 429;
  code: ActivationErrorCode;
  message: string;
  /** With ACTIVATION_LIMIT: the computers already holding the key. */
  activations?: { computer: string; activatedAt: string }[];
  /** With RATE_LIMITED. */
  retryAfterSeconds?: number;
};

export type ActivationSuccess = {
  ok: true;
  /** 201 for a new activation, 200 when this computer already had one. */
  status: 200 | 201;
  reused: boolean;
  /** The signed license file. */
  license: string;
  licenseId: string;
  activationId: string;
  productCode: string;
  customerName: string;
};

export type ActivationResult = ActivationSuccess | ActivationFailure;

export type ActivationContext = { ip: string | null; method: "online" | "offline"; now?: Date };

function failure(code: ActivationErrorCode, extra: Partial<ActivationFailure> = {}): ActivationFailure {
  return { ok: false, code, ...FAILURES[code], ...extra };
}

function presentIds(ids: ActivationRequest["machine"]["ids"]): MachineIds {
  const present: MachineIds = {};
  for (const name of MACHINE_ID_NAMES) if (ids[name]) present[name] = ids[name];
  return present;
}

/**
 * Binds a license key to a computer and returns a signed license file.
 *
 * 1. The request and key must be well formed, and the computer identifiable.
 * 2. The key must exist, belong to the requested product, and be active.
 * 3. A computer that already holds the key gets a fresh license file.
 * 4. Otherwise a new activation is created while the key has room for it.
 *
 * The license row is locked for the decision, so two computers activating
 * the same key at the same moment cannot both take the last place.
 * Every outcome is written to the audit log.
 */
export async function activate(db: Db, input: unknown, context: ActivationContext): Promise<ActivationResult> {
  const now = context.now ?? new Date();
  const base = { actor: "client", ip: context.ip };

  const deny = async (target: Db, code: ActivationErrorCode, details: Record<string, unknown>, extra?: Partial<ActivationFailure>) => {
    await recordEvent(target, {
      ...base,
      type: "activation.denied",
      licenseId: typeof details.licenseId === "string" ? details.licenseId : null,
      customerId: typeof details.customerId === "string" ? details.customerId : null,
      details: { code, method: context.method, ...details, licenseId: undefined, customerId: undefined },
    });
    return failure(code, extra);
  };

  const parsed = activationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return deny(db, "BAD_REQUEST", { fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))] });
  }
  const request = parsed.data;
  const requestDetails = {
    product: request.product,
    computer: request.machine.name,
    appVersion: request.app?.version,
  };

  const key = parseLicenseKey(request.key);
  if (!key) return deny(db, "KEY_MALFORMED", requestDetails);
  const keyDetails = { ...requestDetails, key: maskedKey(key.prefix, key.hint) };

  const ids = presentIds(request.machine.ids);
  if (Object.keys(ids).length === 0) return deny(db, "MACHINE_UNIDENTIFIED", keyDetails);

  const [product] = await db.select().from(products).where(eq(products.code, request.product));
  if (!product) return deny(db, "PRODUCT_UNKNOWN", keyDetails);

  return db.transaction(async (tx) => {
    const [license] = await tx
      .select()
      .from(licenses)
      .where(eq(licenses.keyHash, keyHash(key.canonical)))
      .for("update");
    if (!license) return deny(tx, "KEY_INVALID", keyDetails);
    const licenseDetails = { ...keyDetails, licenseId: license.id, customerId: license.customerId };
    if (license.productId !== product.id) return deny(tx, "KEY_WRONG_PRODUCT", licenseDetails);
    if (license.status === "suspended") return deny(tx, "KEY_SUSPENDED", licenseDetails);
    if (license.status === "revoked") return deny(tx, "KEY_REVOKED", licenseDetails);

    const [customer] = await tx
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.id, license.customerId));
    const current = await tx
      .select()
      .from(activations)
      .where(and(eq(activations.licenseId, license.id), eq(activations.status, "active")))
      .orderBy(activations.activatedAt);
    const existing = current.find(
      (activation) => activation.fingerprintVersion === request.machine.fpv && machineMatches(activation.machineIds, ids),
    );

    const machine = {
      machineName: request.machine.name,
      windowsVersion: request.machine.windows,
      appVersion: request.app?.version,
      installationId: request.installationId,
    };
    let activationId: string;
    if (existing) {
      activationId = existing.id;
      // Keep ids this request could not read, refresh the ones it could, so a
      // replaced disk or reinstalled Windows does not slowly erode the match.
      await tx
        .update(activations)
        .set({ ...machine, machineIds: { ...existing.machineIds, ...ids }, lastSeenAt: now })
        .where(eq(activations.id, existing.id));
    } else {
      if (current.length >= license.maxActivations) {
        return deny(tx, "ACTIVATION_LIMIT", licenseDetails, {
          activations: current.map((activation) => ({
            computer: activation.machineName,
            activatedAt: activation.activatedAt.toISOString(),
          })),
        });
      }
      activationId = newId("act");
      await tx.insert(activations).values({
        id: activationId,
        licenseId: license.id,
        fingerprintVersion: request.machine.fpv,
        machineIds: ids,
        method: context.method,
        activatedAt: now,
        lastSeenAt: now,
        ...machine,
      });
    }

    await recordEvent(tx, {
      ...base,
      type: existing ? "activation.renewed" : "activation.created",
      licenseId: license.id,
      activationId,
      customerId: license.customerId,
      details: { ...keyDetails, method: context.method, windows: request.machine.windows },
    });

    const token = issueLicenseToken(
      {
        aud: product.code,
        sub: license.id,
        jti: activationId,
        kind: license.kind,
        cus: { id: customer.id, name: customer.name },
        key: maskedKey(product.keyPrefix, license.keyHint),
        mch: { fpv: request.machine.fpv, ids, name: request.machine.name },
      },
      now,
    );
    return {
      ok: true,
      status: existing ? 200 : 201,
      reused: Boolean(existing),
      license: token,
      licenseId: license.id,
      activationId,
      productCode: product.code,
      customerName: customer.name,
    } satisfies ActivationSuccess;
  });
}

export function activationLimits(): { attempts: RateLimit; invalidKeys: RateLimit } {
  return {
    attempts: { name: "activate", limit: env().ACTIVATIONS_PER_HOUR_PER_IP, windowSeconds: 3600 },
    invalidKeys: { name: "invalid-key", limit: env().INVALID_KEYS_PER_HOUR_PER_IP, windowSeconds: 3600 },
  };
}

/**
 * `activate` behind the per-network limits: attempts per hour, and fewer
 * tries with keys that do not exist, which is what guessing looks like.
 */
export async function activateWithLimits(db: Db, input: unknown, context: ActivationContext): Promise<ActivationResult> {
  const limits = activationLimits();
  const subject = context.ip ?? "unknown";
  const now = context.now ?? new Date();
  const attempts = await hitRateLimit(db, limits.attempts, subject, now);
  const guesses = await peekRateLimit(db, limits.invalidKeys, subject, now);
  if (!attempts.allowed || !guesses.allowed) {
    const retryAfterSeconds = attempts.allowed ? guesses.retryAfterSeconds : attempts.retryAfterSeconds;
    return failure("RATE_LIMITED", { retryAfterSeconds });
  }
  const result = await activate(db, input, context);
  if (!result.ok && (result.code === "KEY_INVALID" || result.code === "KEY_MALFORMED")) {
    await hitRateLimit(db, limits.invalidKeys, subject, now);
  }
  return result;
}
