"use client";

import { useActionState } from "react";
import { CopyButton, FormMessage, SubmitButton } from "@/components/client";
import { inputClass } from "@/components/fields";
import type { FormState } from "@/lib/forms";
import {
  approveUserAction,
  changeRoleAction,
  createResetLinkAction,
  declineUserAction,
  setUserDisabledAction,
  type ResetLinkState,
} from "../actions";

const ROLES = [
  ["support", "Support"],
  ["viewer", "Viewer"],
  ["admin", "Admin"],
] as const;

function RoleSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="role" defaultValue={defaultValue} aria-label="Role" className={`${inputClass()} w-auto py-1.5`}>
      {ROLES.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function ApproveRequest({ userId }: { userId: string }) {
  const [approved, approve] = useActionState(approveUserAction.bind(null, userId), {} as FormState);
  const [declined, decline] = useActionState(declineUserAction.bind(null, userId), {} as FormState);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormMessage state={approved.ok === false ? approved : declined.ok === false ? declined : undefined} />
      <form action={approve} className="flex items-center gap-2">
        <RoleSelect defaultValue="support" />
        <SubmitButton size="sm" pendingText="Approving…">
          Approve
        </SubmitButton>
      </form>
      <form action={decline}>
        <SubmitButton variant="ghost" size="sm" pendingText="Declining…" confirm="Decline this request?">
          Decline
        </SubmitButton>
      </form>
    </div>
  );
}

export function MemberControls({ userId, role, disabled }: { userId: string; role: string; disabled: boolean }) {
  const [roleState, saveRole] = useActionState(changeRoleAction.bind(null, userId), {} as FormState);
  const [statusState, toggle] = useActionState(setUserDisabledAction.bind(null, userId, !disabled), {} as FormState);
  const [linkState, makeLink] = useActionState(createResetLinkAction.bind(null, userId), {} as ResetLinkState);
  const problem = [roleState, statusState, linkState].find((state) => state.ok === false);
  return (
    <div className="flex flex-col items-end gap-2">
      {problem && <FormMessage state={problem} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!disabled && (
          <form action={saveRole} className="flex items-center gap-2">
            <RoleSelect defaultValue={role} />
            <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
              Save role
            </SubmitButton>
          </form>
        )}
        {!disabled && (
          <form action={makeLink}>
            <SubmitButton variant="ghost" size="sm" pendingText="Creating…">
              Password reset link
            </SubmitButton>
          </form>
        )}
        <form action={toggle}>
          <SubmitButton
            variant={disabled ? "secondary" : "ghost"}
            size="sm"
            pendingText="Saving…"
            confirm={disabled ? undefined : "Disable this account? They are signed out at once."}
          >
            {disabled ? "Enable" : "Disable"}
          </SubmitButton>
        </form>
      </div>
      {linkState.link && (
        <div className="max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left text-xs text-zinc-600">
          <p>
            Send this link to {linkState.email} yourself (for example by WhatsApp). It works once, for 24 hours.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono">{linkState.link}</code>
            <CopyButton text={linkState.link} />
          </div>
        </div>
      )}
    </div>
  );
}
