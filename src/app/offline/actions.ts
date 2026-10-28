"use server";

import { getDb } from "@/db/client";
import { activateWithLimits } from "@/lib/activation";
import { clientIp } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { formatDate } from "@/lib/format";
import { licenseFileName, MAX_REQUEST_FILE_BYTES, parseOfflineRequest } from "@/lib/offline";

export type OfflineState = FormState & {
  license?: string;
  fileName?: string;
  customer?: string;
  computer?: string;
  reused?: boolean;
  inUse?: { computer: string; since: string }[];
};

/** Public: the key inside the request is the credential, as with online activation. */
export async function offlineActivateAction(_previous: OfflineState, formData: FormData): Promise<OfflineState> {
  const text = formData.get("request");
  if (typeof text !== "string" || !text.trim()) return { ok: false, message: "Paste the activation request or choose its file." };
  if (text.length > MAX_REQUEST_FILE_BYTES) return { ok: false, message: "This file is too large to be an activation request." };
  const parsed = parseOfflineRequest(text);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const result = await activateWithLimits(await getDb(), parsed.request, { ip: await clientIp(), method: "offline" });
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      inUse: result.activations?.map((activation) => ({ computer: activation.computer, since: formatDate(activation.activatedAt) })),
    };
  }
  return {
    ok: true,
    license: result.license,
    fileName: licenseFileName(result.productCode, parsed.request.machine.name),
    customer: result.customerName,
    computer: parsed.request.machine.name,
    reused: result.reused,
  };
}
