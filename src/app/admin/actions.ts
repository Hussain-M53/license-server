"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  approveUser,
  changePassword,
  changeRole,
  createResetLink,
  declineUser,
  setUserDisabled,
} from "@/lib/accounts";
import { currentSessionToken, requireActor } from "@/lib/auth";
import { createCustomer, createProduct, updateCustomer } from "@/lib/catalog";
import { env } from "@/lib/env";
import { formValues, withValues, type FormState } from "@/lib/forms";
import { changeLicenseStatus, createLicense, resetActivation, revealLicenseKey, updateLicense, type StatusChange } from "@/lib/licenses";

/**
 * Every dashboard change. Each action checks the session and role itself:
 * a page only showing a button to the right people is not a security boundary.
 */

function done<T extends FormState>(result: T): T {
  if (result.ok) refresh();
  return result;
}

// Customers -------------------------------------------------------------------

export async function createCustomerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("support");
  const result = await createCustomer(await getDb(), actor, formValues(formData));
  if (!result.ok || !result.customerId) return withValues(result, formData);
  redirect(
    formData.get("then") === "license"
      ? `/admin/licenses/new?customer=${result.customerId}`
      : `/admin/customers/${result.customerId}`,
  );
}

export async function updateCustomerAction(customerId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("support");
  return done(withValues(await updateCustomer(await getDb(), actor, customerId, formValues(formData)), formData));
}

// Products --------------------------------------------------------------------

export async function createProductAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("admin");
  return done(withValues(await createProduct(await getDb(), actor, formValues(formData)), formData));
}

// Licenses --------------------------------------------------------------------

export type NewLicenseState = FormState & { key?: string; licenseId?: string };

export async function createLicenseAction(_previous: NewLicenseState, formData: FormData): Promise<NewLicenseState> {
  const actor = await requireActor("support");
  const result = await createLicense(await getDb(), actor, formValues(formData));
  return withValues(result, formData);
}

export async function updateLicenseAction(licenseId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("support");
  return done(withValues(await updateLicense(await getDb(), actor, licenseId, formValues(formData)), formData));
}

export async function changeLicenseStatusAction(
  licenseId: string,
  change: StatusChange,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor(change === "revoke" ? "admin" : "support");
  return done(await changeLicenseStatus(await getDb(), actor, licenseId, change, formData.get("reason")));
}

export async function resetActivationAction(activationId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("support");
  return done(await resetActivation(await getDb(), actor, activationId, formData.get("reason")));
}

export type RevealState = FormState & { key?: string };

export async function revealKeyAction(licenseId: string): Promise<RevealState> {
  const actor = await requireActor("admin");
  const key = await revealLicenseKey(await getDb(), actor, licenseId);
  return key ? { ok: true, key } : { ok: false, message: "This license no longer exists." };
}

// Team ------------------------------------------------------------------------

export async function approveUserAction(userId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("admin");
  return done(await approveUser(await getDb(), actor, userId, formData.get("role")));
}

export async function declineUserAction(userId: string): Promise<FormState> {
  const actor = await requireActor("admin");
  return done(await declineUser(await getDb(), actor, userId));
}

export async function changeRoleAction(userId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("admin");
  return done(await changeRole(await getDb(), actor, userId, formData.get("role")));
}

export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<FormState> {
  const actor = await requireActor("admin");
  return done(await setUserDisabled(await getDb(), actor, userId, disabled));
}

export type ResetLinkState = FormState & { link?: string; email?: string };

export async function createResetLinkAction(userId: string): Promise<ResetLinkState> {
  const actor = await requireActor("admin");
  const result = await createResetLink(await getDb(), actor, userId);
  if (!result.ok) return result;
  return { ok: true, email: result.email, link: `${env().APP_URL}/auth/reset/${result.token}` };
}

// Account ---------------------------------------------------------------------

export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor("viewer");
  return changePassword(await getDb(), actor, formValues(formData), { ip: actor.ip, currentSessionToken: await currentSessionToken() });
}
