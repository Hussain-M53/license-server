"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/policy";
import { signUpAction } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, {} as FormState);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <TextField label="Your name" name="name" autoComplete="name" required defaultValue={state.values?.name} errors={state.errors?.name} />
      <TextField
        label="Work e-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.errors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words make a good one.`}
        errors={state.errors?.password}
      />
      <TextField label="Password again" name="confirm" type="password" autoComplete="new-password" required errors={state.errors?.confirm} />
      <div className="pt-2">
        <SubmitButton pendingText="Sending…">Request access</SubmitButton>
      </div>
    </form>
  );
}
