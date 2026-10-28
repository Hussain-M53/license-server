import type { Metadata } from "next";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Request sent" };

export default function PendingPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Request sent</h1>
      <p className="mt-2 text-sm text-zinc-600">
        An administrator will review your request. Once it is approved, sign in with the e-mail and password you just chose. There is
        no confirmation e-mail; ask your administrator if it takes long.
      </p>
      <div className="mt-6">
        <LinkButton href="/auth/sign-in" variant="secondary">
          Back to sign-in
        </LinkButton>
      </div>
    </>
  );
}
