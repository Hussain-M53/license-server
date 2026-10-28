import Link from "next/link";
import { KeyMark } from "@/components/ui";
import { appName } from "@/lib/env";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-2 text-center">
        <KeyMark />
        <span className="sr-only">{appName()}</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      <p className="mt-6 text-xs text-zinc-500">{appName()}</p>
    </main>
  );
}
