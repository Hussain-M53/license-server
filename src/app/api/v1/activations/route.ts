import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { activateWithLimits, type ActivationErrorCode } from "@/lib/activation";

const MAX_BODY_BYTES = 16 * 1024;

const TITLES: Record<ActivationErrorCode | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE", string> = {
  BAD_REQUEST: "Bad request",
  RATE_LIMITED: "Too many requests",
  KEY_MALFORMED: "Malformed license key",
  PRODUCT_UNKNOWN: "Unknown product",
  KEY_INVALID: "Unknown license key",
  KEY_WRONG_PRODUCT: "License key for another product",
  KEY_SUSPENDED: "License suspended",
  KEY_REVOKED: "License revoked",
  MACHINE_UNIDENTIFIED: "Computer not identifiable",
  ACTIVATION_LIMIT: "Activation limit reached",
  UNSUPPORTED_MEDIA_TYPE: "Unsupported media type",
  PAYLOAD_TOO_LARGE: "Payload too large",
};

/** Errors as RFC 9457 problem details; `code` is what clients branch on. */
function problem(status: number, code: keyof typeof TITLES, detail: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ type: "about:blank", status, code, title: TITLES[code], detail, ...extra }), {
    status,
    headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", ...headers },
  });
}

/**
 * POST /api/v1/activations: called by installers and products to bind a
 * license key to a computer. The key is the credential; see activation.ts.
 */
export async function POST(request: NextRequest) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Send the activation request as application/json.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return problem(413, "PAYLOAD_TOO_LARGE", "The activation request is too large.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return problem(413, "PAYLOAD_TOO_LARGE", "The activation request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return problem(400, "BAD_REQUEST", "The activation request is not valid JSON.");
  }

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await activateWithLimits(await getDb(), body, { ip, method: "online" });
  if (!result.ok) {
    return problem(
      result.status,
      result.code,
      result.message,
      result.activations ? { activations: result.activations } : {},
      result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : {},
    );
  }
  return Response.json(
    {
      license: result.license,
      licenseId: result.licenseId,
      activationId: result.activationId,
      customer: result.customerName,
      reused: result.reused,
    },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
