"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/policy";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction.bind(null, token), {} as FormState);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        errors={state.errors?.password}
      />
      <TextField label="New password again" name="confirm" type="password" autoComplete="new-password" required errors={state.errors?.confirm} />
      <div className="pt-2">
        <SubmitButton pendingText="Saving…">Save password</SubmitButton>
      </div>
    </form>
  );
}
