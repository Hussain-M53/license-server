"use client";

import { useActionState } from "react";
import { CopyButton, FormMessage, SubmitButton } from "@/components/client";
import { TextArea, TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import type { StatusChange as Change } from "@/lib/licenses";
import {
  changeLicenseStatusAction,
  resetActivationAction,
  revealKeyAction,
  updateLicenseAction,
  type RevealState,
} from "../../actions";

export function RevealKey({ licenseId }: { licenseId: string }) {
  const [state, action] = useActionState(revealKeyAction.bind(null, licenseId), {} as RevealState);
  if (state.key) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
        <code className="select-all font-mono text-sm tracking-wide">{state.key}</code>
        <CopyButton text={state.key} />
      </div>
    );
  }
  return (
    <form action={action}>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm" pendingText="Revealing…" confirm="Show the whole key? This is recorded in the audit log.">
        Reveal key
      </SubmitButton>
    </form>
  );
}

export function EditLicense({ licenseId, values }: { licenseId: string; values: Record<string, string> }) {
  const [state, action] = useActionState(updateLicenseAction.bind(null, licenseId), {} as FormState);
  const current = state.values ?? values;
  return (
    <details className="group" open={state.ok === false}>
      <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:underline">Edit details</summary>
      <form action={action} className="mt-3 space-y-3">
        <FormMessage state={state} />
        <TextField
          label="Computers allowed"
          name="maxActivations"
          type="number"
          min={1}
          max={1000}
          required
          defaultValue={current.maxActivations}
          errors={state.errors?.maxActivations}
          className="w-28"
        />
        <TextField label="Reference" name="reference" defaultValue={current.reference} errors={state.errors?.reference} />
        <TextArea label="Notes" name="notes" defaultValue={current.notes} errors={state.errors?.notes} />
        <SubmitButton size="sm" pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
    </details>
  );
}

export function ResetActivation({ activationId, computer }: { activationId: string; computer: string }) {
  const [state, action] = useActionState(resetActivationAction.bind(null, activationId), {} as FormState);
  return (
    <details className="inline-block text-left" open={state.ok === false}>
      <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:underline">Reset</summary>
      <form action={action} className="mt-2 w-64 space-y-2">
        <FormMessage state={state} />
        <p className="text-xs text-zinc-600">Frees the place {computer} holds, so the key can be activated on another computer.</p>
        <TextField label="Reason" name="reason" required placeholder="e.g. server replaced" errors={state.errors?.reason} />
        <SubmitButton variant="danger" size="sm" pendingText="Resetting…">
          Reset activation
        </SubmitButton>
      </form>
    </details>
  );
}

const CHANGES: Record<Change, { label: string; help: string; variant: "secondary" | "danger" }> = {
  suspend: { label: "Suspend", help: "Stops new activations until resumed.", variant: "secondary" },
  resume: { label: "Resume", help: "Allows activations again.", variant: "secondary" },
  revoke: { label: "Revoke", help: "Permanent: the key can never be activated again.", variant: "danger" },
};

export function StatusChange({ licenseId, change }: { licenseId: string; change: Change }) {
  const [state, action] = useActionState(changeLicenseStatusAction.bind(null, licenseId, change), {} as FormState);
  const { label, help, variant } = CHANGES[change];
  return (
    <details open={state.ok === false}>
      <summary className="cursor-pointer text-sm font-medium text-zinc-800 hover:underline">{label}…</summary>
      <form action={action} className="mt-2 space-y-2">
        <FormMessage state={state} />
        <p className="text-xs text-zinc-600">{help}</p>
        <TextField label="Reason" name="reason" required errors={state.errors?.reason} />
        <SubmitButton
          variant={variant}
          size="sm"
          pendingText="Saving…"
          confirm={change === "revoke" ? "Revoke this license permanently?" : undefined}
        >
          {label} license
        </SubmitButton>
      </form>
    </details>
  );
}
