"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Shown when a page fails unexpectedly. The reference matches the server log entry. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-600">
          The page could not be shown. Try again; if it keeps happening, tell the administrator
          {digest ? (
            <>
              {" "}
              and mention reference <code className="font-mono">{digest}</code>
            </>
          ) : null}
          .
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
            Try again
          </button>
          <Link href="/" className={buttonClass("secondary")}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
