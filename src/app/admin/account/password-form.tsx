"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/policy";
import { changePasswordAction } from "../actions";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <TextField label="Current password" name="current" type="password" autoComplete="current-password" required errors={state.errors?.current} />
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
      <SubmitButton pendingText="Saving…">Change password</SubmitButton>
    </form>
  );
}
