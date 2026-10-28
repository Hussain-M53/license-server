import { z } from "zod";
import { activationRequestSchema, type ActivationRequest } from "./activation";

/**
 * Offline activation, for computers without internet: the installer saves an
 * activation request file, someone uploads it on the /offline page from any
 * connected device, and takes the license file back to the computer.
 *
 * A request file is armored base64 JSON, so it survives e-mail, USB sticks
 * and copy-paste:
 *
 *   -----BEGIN LICENSE ACTIVATION REQUEST-----
 *   eyJ2IjoxLCJ0eXBlIjoiYWN0aXZhdGlvbi1yZXF1ZXN0IiwicHJvZHVjdCI6...
 *   -----END LICENSE ACTIVATION REQUEST-----
 *
 * The installer writes it (installer-kit/scripts/setup-helper.ps1); keep the
 * two in step.
 */
export const REQUEST_BEGIN = "-----BEGIN LICENSE ACTIVATION REQUEST-----";
export const REQUEST_END = "-----END LICENSE ACTIVATION REQUEST-----";
export const MAX_REQUEST_FILE_BYTES = 16 * 1024;

const requestFileSchema = activationRequestSchema.extend({
  v: z.literal(1),
  type: z.literal("activation-request"),
  createdAt: z.string().max(40).optional(),
});

export function formatOfflineRequest(request: ActivationRequest, createdAt = new Date()): string {
  const json = JSON.stringify({ v: 1, type: "activation-request", ...request, createdAt: createdAt.toISOString() });
  const lines = Buffer.from(json, "utf8").toString("base64").match(/.{1,64}/g) ?? [];
  return [REQUEST_BEGIN, ...lines, REQUEST_END, ""].join("\r\n");
}

export type ParsedOfflineRequest = { ok: true; request: ActivationRequest } | { ok: false; message: string };

export function parseOfflineRequest(text: string): ParsedOfflineRequest {
  if (text.length > MAX_REQUEST_FILE_BYTES) return { ok: false, message: "This file is too large to be an activation request." };
  const begin = text.indexOf(REQUEST_BEGIN);
  const end = text.indexOf(REQUEST_END, begin + 1);
  if (begin < 0 || end < 0) {
    return { ok: false, message: "This is not an activation request. Use the file the installer saved." };
  }
  const body = text
    .slice(begin + REQUEST_BEGIN.length, end)
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  let json: unknown;
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("not base64");
    json = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
  } catch {
    return { ok: false, message: "The activation request is damaged. Save it again from the installer." };
  }
  const parsed = requestFileSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, message: "The activation request is incomplete. Save it again with the latest installer." };
  }
  // Re-parsing with the plain request schema drops the file-only fields.
  return { ok: true, request: activationRequestSchema.parse(parsed.data) };
}

/** File name for a license file, e.g. `ENERCEON-OFFICE-PC.lic`. */
export function licenseFileName(productCode: string, computer: string): string {
  const safeComputer = computer.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${productCode}${safeComputer ? `-${safeComputer}` : ""}.lic`;
}
