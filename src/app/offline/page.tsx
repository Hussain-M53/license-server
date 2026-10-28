import type { Metadata } from "next";
import Link from "next/link";
import { appName } from "@/lib/env";
import { OfflineForm } from "./offline-form";

export const metadata: Metadata = { title: "Activate without internet" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← {appName()}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Activate a computer that has no internet</h1>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-zinc-700">
        <li>
          On the computer you are installing on, choose <strong>This computer has no internet</strong> in Setup and save the activation
          request file.
        </li>
        <li>Bring that file to any device with internet (a USB stick, e-mail or chat is fine) and load it below.</li>
        <li>
          Download the license file, take it back to the computer, and choose <strong>Load license file</strong> in Setup.
        </li>
      </ol>
      <OfflineForm />
      <p className="mt-8 text-xs text-zinc-500">
        Each license key works on a limited number of computers. Activating offline uses a place just like activating online, and a
        computer that already holds the key gets its license file again without using another.
      </p>
    </main>
  );
}
