"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { createProductAction } from "../actions";

export function ProductForm() {
  const [state, action] = useActionState(createProductAction, {} as FormState);
  const values = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-4" key={state.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <TextField label="Name" name="name" required placeholder="ENERCEON" defaultValue={values.name} errors={state.errors?.name} />
      <TextField
        label="Code"
        name="code"
        required
        placeholder="ENERCEON"
        defaultValue={values.code}
        hint="What the installer sends. Cannot be changed later."
        errors={state.errors?.code}
        className="uppercase"
      />
      <TextField
        label="Key prefix"
        name="keyPrefix"
        required
        placeholder="ENRC"
        maxLength={8}
        defaultValue={values.keyPrefix}
        hint="2 to 8 letters or digits at the start of every key. Cannot be changed later."
        errors={state.errors?.keyPrefix}
        className="uppercase"
      />
      <SubmitButton pendingText="Adding…">Add product</SubmitButton>
    </form>
  );
}
