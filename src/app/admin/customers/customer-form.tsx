"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextArea, TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { createCustomerAction, updateCustomerAction } from "../actions";

type Values = Partial<Record<"name" | "contactName" | "email" | "phone" | "country" | "notes", string>>;

/** New customer when `customerId` is absent, otherwise edits that customer. */
export function CustomerForm({ customerId, values = {}, then }: { customerId?: string; values?: Values; then?: string }) {
  const [state, action] = useActionState(
    customerId ? updateCustomerAction.bind(null, customerId) : createCustomerAction,
    {} as FormState,
  );
  const current: Values = state.values ?? values;
  return (
    <form action={action} className="grid max-w-xl gap-5">
      <FormMessage state={state} />
      {then && <input type="hidden" name="then" value={then} />}
      <TextField label="Company or customer name" name="name" required defaultValue={current.name} errors={state.errors?.name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Contact person" name="contactName" defaultValue={current.contactName} errors={state.errors?.contactName} />
        <TextField label="Phone or WhatsApp" name="phone" defaultValue={current.phone} errors={state.errors?.phone} />
        <TextField label="E-mail" name="email" type="email" defaultValue={current.email} errors={state.errors?.email} />
        <TextField label="Country" name="country" defaultValue={current.country} errors={state.errors?.country} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={current.notes} errors={state.errors?.notes} />
      <div>
        <SubmitButton pendingText="Saving…">{customerId ? "Save" : "Add customer"}</SubmitButton>
      </div>
    </form>
  );
}
