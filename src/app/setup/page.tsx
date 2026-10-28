import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { KeyMark } from "@/components/ui";
import { getDb } from "@/db/client";
import { adminExists } from "@/lib/accounts";
import { appName, env } from "@/lib/env";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "First-time setup" };

/** Exists only until the first administrator is created, and only when SETUP_TOKEN is set. */
export default async function SetupPage() {
  await connection();
  if (!env().SETUP_TOKEN || (await adminExists(await getDb()))) notFound();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <KeyMark />
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Set up {appName()}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Create the first administrator. You need the setup code from the server&apos;s <code>SETUP_TOKEN</code> setting. Remove that
          setting afterwards.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
