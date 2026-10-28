import type { Metadata } from "next";
import { LinkButton, Notice } from "@/components/ui";
import { getDb } from "@/db/client";
import { resetLinkUser } from "@/lib/accounts";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPage({ params }: PageProps<"/auth/reset/[token]">) {
  const { token } = await params;
  const user = token.length <= 100 ? await resetLinkUser(await getDb(), token) : null;
  if (!user) {
    return (
      <>
        <h1 className="text-xl font-semibold">Link not valid</h1>
        <div className="mt-4">
          <Notice tone="warning">This link has expired or was already used. Ask an administrator for a new one.</Notice>
        </div>
        <div className="mt-6">
          <LinkButton href="/auth/sign-in" variant="secondary">
            Back to sign-in
          </LinkButton>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-zinc-600">For {user.email}. You will be signed out everywhere else.</p>
      <ResetForm token={token} />
    </>
  );
}
