import { KeyMark, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { appName } from "@/lib/env";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <KeyMark />
        <h1 className="text-3xl font-semibold tracking-tight">{appName()}</h1>
        <p className="mt-3 text-zinc-600">
          Activates software licenses, and lets the publisher&apos;s staff manage customers, keys and computers.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/offline" variant="secondary">
            Activate a computer without internet
          </LinkButton>
          {user ? <LinkButton href="/admin">Open the dashboard</LinkButton> : <LinkButton href="/auth/sign-in">Staff sign-in</LinkButton>}
        </div>
      </div>
    </main>
  );
}
