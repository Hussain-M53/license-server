import { z } from "zod";

/** What a dashboard form action returns to its page. */
export type FormState = {
  ok?: boolean;
  /** Shown above the form. */
  message?: string;
  /** Problems per field name. */
  errors?: Record<string, string[] | undefined>;
  /** What was typed, to fill the form again after an error (never passwords). */
  values?: Record<string, string>;
};

const SECRET_FIELDS = new Set(["password", "confirm", "current", "token"]);

/** Attaches the submitted values, minus secrets, to a failed result. */
export function withValues<T extends FormState>(result: T, formData: FormData): T {
  if (result.ok) return result;
  const values = Object.fromEntries(Object.entries(formValues(formData)).filter(([name]) => !SECRET_FIELDS.has(name)));
  return { ...result, values };
}

export function invalid(error: z.ZodError, message = "Check the highlighted fields."): FormState {
  return { ok: false, message, errors: z.flattenError(error).fieldErrors as FormState["errors"] };
}

/** FormData as a plain object of strings (files and repeated names are not used by these forms). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData) if (typeof value === "string" && !name.startsWith("$ACTION")) values[name] = value;
  return values;
}

/** Optional free text: trimmed, and empty becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : null));

/** Did a write fail because a unique value already exists? */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
