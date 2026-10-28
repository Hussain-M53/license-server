import type { Metadata } from "next";
import { Card, Details, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "../../auth/actions";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <Details
            items={[
              ["Name", user.name],
              ["E-mail", user.email],
              ["Role", <span key="role" className="capitalize">{user.role}</span>],
            ]}
          />
          <p className="mt-4 text-xs text-zinc-500">Sessions last 8 hours. An administrator can change your role.</p>
          <form action={signOutAction} className="mt-4">
            <button type="submit" className="text-sm font-medium text-indigo-600 hover:underline">
              Sign out
            </button>
          </form>
        </Card>
        <Card title="Change password">
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}
