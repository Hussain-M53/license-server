/** Plain-language descriptions of audit log entries. */

const REFUSALS: Record<string, string> = {
  BAD_REQUEST: "incomplete request",
  RATE_LIMITED: "too many attempts",
  KEY_MALFORMED: "mistyped key",
  PRODUCT_UNKNOWN: "unknown product",
  KEY_INVALID: "key does not exist",
  KEY_WRONG_PRODUCT: "key for another product",
  KEY_SUSPENDED: "license suspended",
  KEY_REVOKED: "license revoked",
  MACHINE_UNIDENTIFIED: "computer not identifiable",
  ACTIVATION_LIMIT: "already in use on another computer",
};

export type EventTone = "green" | "amber" | "red" | "gray" | "blue";

type Details = Record<string, unknown> | null | undefined;

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

export function describeEvent(type: string, details: Details): { title: string; detail: string; tone: EventTone } {
  const d = details ?? {};
  const computer = text(d.computer);
  const method = d.method === "offline" ? " (offline)" : "";
  switch (type) {
    case "activation.created":
      return { title: `Activated on ${computer}${method}`, detail: text(d.windows), tone: "green" };
    case "activation.renewed":
      return { title: `Activated again on ${computer}${method}`, detail: "Same computer, no extra place used", tone: "blue" };
    case "activation.denied":
      return {
        title: `Activation refused: ${REFUSALS[text(d.code)] ?? text(d.code)}`,
        detail: [computer && `from ${computer}`, text(d.key), text(d.product)].filter(Boolean).join(" · "),
        tone: d.code === "ACTIVATION_LIMIT" ? "red" : "amber",
      };
    case "activation.reset":
      return { title: `Activation of ${computer} reset`, detail: text(d.reason), tone: "amber" };
    case "license.created":
      return { title: "License created", detail: [text(d.key), d.reference ? `ref. ${text(d.reference)}` : ""].filter(Boolean).join(" · "), tone: "blue" };
    case "license.updated":
      return { title: "License details changed", detail: "", tone: "gray" };
    case "license.suspended":
      return { title: "License suspended", detail: text(d.reason), tone: "amber" };
    case "license.resumed":
      return { title: "License resumed", detail: text(d.reason), tone: "green" };
    case "license.revoked":
      return { title: "License revoked", detail: text(d.reason), tone: "red" };
    case "license.key_revealed":
      return { title: "Key revealed", detail: "", tone: "gray" };
    case "customer.created":
      return { title: `Customer ${text(d.name)} added`, detail: "", tone: "blue" };
    case "customer.updated":
      return { title: "Customer details changed", detail: Array.isArray(d.changed) ? d.changed.join(", ") : "", tone: "gray" };
    case "product.created":
      return { title: `Product ${text(d.name)} added`, detail: `${text(d.code)}, keys start with ${text(d.keyPrefix)}`, tone: "blue" };
    case "user.signed_in":
      return { title: "Signed in", detail: "", tone: "gray" };
    case "user.sign_in_failed":
      return { title: "Sign-in failed", detail: d.unknown ? "No such account" : "Wrong password", tone: "amber" };
    case "user.locked":
      return { title: "Account locked for 15 minutes", detail: "Five wrong passwords", tone: "red" };
    case "user.signed_up":
      return { title: "Requested dashboard access", detail: text(d.name), tone: "blue" };
    case "user.sign_up_repeated":
      return { title: "Requested access again with a known e-mail", detail: "", tone: "gray" };
    case "user.approved":
      return { title: `Approved ${text(d.user)} as ${text(d.role)}`, detail: "", tone: "green" };
    case "user.declined":
      return { title: `Declined ${text(d.user)}`, detail: "", tone: "gray" };
    case "user.role_changed":
      return { title: `Made ${text(d.user)} ${text(d.role)}`, detail: "", tone: "blue" };
    case "user.disabled":
      return { title: `Disabled ${text(d.user)}`, detail: "", tone: "amber" };
    case "user.enabled":
      return { title: `Enabled ${text(d.user)}`, detail: "", tone: "green" };
    case "user.reset_link_created":
      return { title: `Created a password reset link for ${text(d.user)}`, detail: "", tone: "gray" };
    case "user.password_reset":
      return { title: "Password reset with a link", detail: "", tone: "gray" };
    case "user.password_changed":
      return { title: "Password changed", detail: "", tone: "gray" };
    case "setup.completed":
      return { title: "First administrator created", detail: "", tone: "green" };
    case "setup.refused":
      return { title: "Setup attempted with a wrong code", detail: "", tone: "red" };
    default:
      return { title: type, detail: "", tone: "gray" };
  }
}
