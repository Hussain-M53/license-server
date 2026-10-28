"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/client";
import { TextField } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import { signInAction } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, {} as FormState);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        defaultValue={state.values?.email}
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <div className="pt-2">
        <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      </div>
      <p className="text-xs text-zinc-500">Forgot your password? Ask an administrator for a reset link.</p>
    </form>
  );
}
