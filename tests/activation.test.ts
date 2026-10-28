import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { activations, events } from "@/db/schema";
import { activate, activateWithLimits, type ActivationFailure, type ActivationSuccess } from "@/lib/activation";
import { generateLicenseKey } from "@/lib/license-keys";
import { verifyLicenseToken } from "@/lib/license-token";
import { changeLicenseStatus, resetActivation } from "@/lib/licenses";
import { actor, activationRequest, machineIds, seedLicense, testDb } from "./support/db";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

const online = { ip: "198.51.100.7", method: "online" as const };

async function succeed(input: unknown, context = online): Promise<ActivationSuccess> {
  const result = await activate(db, input, context);
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return result;
}

async function fail(input: unknown, context = online): Promise<ActivationFailure> {
  const result = await activate(db, input, context);
  if (result.ok) throw new Error("expected a failure");
  return result;
}

describe("activation", () => {
  it("binds a new key to the first computer and returns a signed license", async () => {
    const seed = await seedLicense(db);
    const result = await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01"));
    expect(result).toMatchObject({ status: 201, reused: false, licenseId: seed.licenseId, productCode: seed.productCode });

    const claims = verifyLicenseToken(result.license)!;
    expect(claims).toMatchObject({
      aud: seed.productCode,
      sub: seed.licenseId,
      jti: result.activationId,
      kind: "perpetual",
      cus: { id: seed.customerId, name: result.customerName },
      mch: { fpv: 1, name: "SERVER-01", ids: machineIds("SERVER-01") },
    });
    expect(claims.key).toBe(`${seed.key.slice(0, 4)}-...-${seed.key.slice(-5)}`);
    expect(JSON.stringify(claims)).not.toContain(seed.key);

    const [row] = await db.select().from(activations).where(eq(activations.id, result.activationId));
    expect(row).toMatchObject({ machineName: "SERVER-01", method: "online", status: "active", appVersion: "1.1.0" });
  });

  it("gives the same computer the same activation again, using no extra place", async () => {
    const seed = await seedLicense(db);
    const first = await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01"));
    const again = await succeed(activationRequest(seed.productCode, seed.key.toLowerCase(), "SERVER-01"));
    expect(again).toMatchObject({ status: 200, reused: true, activationId: first.activationId });
  });

  it("recognises the computer after Windows was reinstalled, and remembers the new id", async () => {
    const seed = await seedLicense(db);
    const original = machineIds("SERVER-01");
    const first = await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01", original));
    const reinstalled = { ...original, os: machineIds("NEW-WINDOWS").os };
    const again = await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01", reinstalled));
    expect(again.activationId).toBe(first.activationId);
    const [row] = await db.select().from(activations).where(eq(activations.id, first.activationId));
    expect(row.machineIds).toEqual(reinstalled);

    // Later the disk is replaced too: still the same computer, because the
    // record followed the reinstall.
    const newDisk = { ...reinstalled, disk: machineIds("NEW-DISK").disk };
    expect((await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01", newDisk))).activationId).toBe(first.activationId);
  });

  it("refuses a second computer and says where the key is in use", async () => {
    const seed = await seedLicense(db);
    await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01"));
    const refused = await fail(activationRequest(seed.productCode, seed.key, "SERVER-02"));
    expect(refused).toMatchObject({ status: 409, code: "ACTIVATION_LIMIT" });
    expect(refused.activations).toEqual([{ computer: "SERVER-01", activatedAt: expect.any(String) }]);
  });

  it("refuses a disk moved into another computer", async () => {
    const seed = await seedLicense(db);
    const ids = machineIds("SERVER-01");
    await succeed(activationRequest(seed.productCode, seed.key, "SERVER-01", ids));
    const moved = { ...ids, board: machineIds("OTHER").board };
    expect((await fail(activationRequest(seed.productCode, seed.key, "SERVER-01", moved))).code).toBe("ACTIVATION_LIMIT");
  });

  it("allows as many computers as the license says", async () => {
    const seed = await seedLicense(db, { maxActivations: 2 });
    await succeed(activationRequest(seed.productCode, seed.key, "PC-1"));
    await succeed(activationRequest(seed.productCode, seed.key, "PC-2"));
    const refused = await fail(activationRequest(seed.productCode, seed.key, "PC-3"));
    expect(refused.activations?.map((a) => a.computer)).toEqual(["PC-1", "PC-2"]);
  });

  it("frees the place when support resets the activation", async () => {
    const seed = await seedLicense(db);
    const first = await succeed(activationRequest(seed.productCode, seed.key, "OLD-SERVER"));
    await fail(activationRequest(seed.productCode, seed.key, "NEW-SERVER"));
    expect(await resetActivation(db, actor, first.activationId, "Server replaced")).toMatchObject({ ok: true });
    const moved = await succeed(activationRequest(seed.productCode, seed.key, "NEW-SERVER"));
    expect(moved.status).toBe(201);
    expect(moved.activationId).not.toBe(first.activationId);
  });

  it("lets only one of two computers racing for the last place win", async () => {
    const seed = await seedLicense(db);
    const results = await Promise.all(
      ["RACE-1", "RACE-2", "RACE-3"].map((computer) => activate(db, activationRequest(seed.productCode, seed.key, computer), online)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const rows = await db
      .select()
      .from(activations)
      .where(and(eq(activations.licenseId, seed.licenseId), eq(activations.status, "active")));
    expect(rows).toHaveLength(1);
  });

  it("refuses suspended and revoked licenses, and accepts a resumed one", async () => {
    const seed = await seedLicense(db);
    await changeLicenseStatus(db, actor, seed.licenseId, "suspend", "Invoice unpaid");
    expect((await fail(activationRequest(seed.productCode, seed.key, "PC"))).code).toBe("KEY_SUSPENDED");
    await changeLicenseStatus(db, actor, seed.licenseId, "resume", "Paid");
    await succeed(activationRequest(seed.productCode, seed.key, "PC"));
    await changeLicenseStatus(db, actor, seed.licenseId, "revoke", "Contract ended");
    expect((await fail(activationRequest(seed.productCode, seed.key, "PC"))).code).toBe("KEY_REVOKED");
  });

  it("refuses keys for another product, unknown products and unknown keys", async () => {
    const first = await seedLicense(db);
    const second = await seedLicense(db);
    expect((await fail(activationRequest(second.productCode, first.key, "PC"))).code).toBe("KEY_WRONG_PRODUCT");
    expect((await fail(activationRequest("NOSUCHPRODUCT", first.key, "PC"))).code).toBe("PRODUCT_UNKNOWN");
    const unknown = await fail(activationRequest(first.productCode, generateLicenseKey(first.key.slice(0, 4)), "PC"));
    expect(unknown).toMatchObject({ status: 404, code: "KEY_INVALID" });
  });

  it("refuses malformed keys, unidentifiable computers and bad requests", async () => {
    const seed = await seedLicense(db);
    const typo = `${seed.key.slice(0, -1)}${seed.key.endsWith("0") ? "1" : "0"}`;
    expect((await fail(activationRequest(seed.productCode, typo, "PC"))).code).toBe("KEY_MALFORMED");
    expect((await fail(activationRequest(seed.productCode, "hello", "PC"))).code).toBe("KEY_MALFORMED");
    expect((await fail(activationRequest(seed.productCode, seed.key, "PC", {}))).code).toBe("MACHINE_UNIDENTIFIED");
    expect((await fail({ product: seed.productCode })).code).toBe("BAD_REQUEST");
    expect((await fail(null)).code).toBe("BAD_REQUEST");
    const badId = activationRequest(seed.productCode, seed.key, "PC", { board: "raw-serial-number" });
    expect((await fail(badId)).code).toBe("BAD_REQUEST");
    const control = activationRequest(seed.productCode, seed.key, "PC\u0007");
    expect((await fail(control)).code).toBe("BAD_REQUEST");
  });

  it("writes every outcome to the audit log, without the key", async () => {
    const seed = await seedLicense(db);
    const ok = await succeed(activationRequest(seed.productCode, seed.key, "AUDITED"));
    await fail(activationRequest(seed.productCode, seed.key, "INTRUDER"));
    const log = await db.select().from(events).where(eq(events.licenseId, seed.licenseId)).orderBy(events.at);
    expect(log.map((event) => event.type)).toEqual(["license.created", "activation.created", "activation.denied"]);
    expect(log[1]).toMatchObject({ actor: "client", ip: online.ip, activationId: ok.activationId });
    expect(log[2].details).toMatchObject({ code: "ACTIVATION_LIMIT", computer: "INTRUDER" });
    expect(JSON.stringify(log)).not.toContain(seed.key);
  });
});

describe("activation limits per network", () => {
  it("stops guessing after a few unknown keys, but not normal use", async () => {
    const seed = await seedLicense(db);
    const guesser = { ip: "192.0.2.50", method: "online" as const };
    for (let i = 0; i < 10; i++) {
      const result = await activateWithLimits(db, activationRequest(seed.productCode, generateLicenseKey("ZZZZ"), "PC"), guesser);
      expect(result.ok ? "ok" : result.code).toMatch(/KEY_INVALID|KEY_MALFORMED/);
    }
    const blocked = await activateWithLimits(db, activationRequest(seed.productCode, seed.key, "PC"), guesser);
    expect(blocked).toMatchObject({ ok: false, status: 429, code: "RATE_LIMITED" });
    expect((blocked as ActivationFailure).retryAfterSeconds).toBeGreaterThan(0);

    const honest = await activateWithLimits(db, activationRequest(seed.productCode, seed.key, "PC"), { ...guesser, ip: "192.0.2.51" });
    expect(honest.ok).toBe(true);
  });

  it("caps attempts per hour from one address", async () => {
    const seed = await seedLicense(db);
    const busy = { ip: "192.0.2.60", method: "online" as const };
    for (let i = 0; i < 30; i++) {
      expect((await activateWithLimits(db, activationRequest(seed.productCode, seed.key, "SAME-PC"), busy)).ok).toBe(true);
    }
    expect(await activateWithLimits(db, activationRequest(seed.productCode, seed.key, "SAME-PC"), busy)).toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
