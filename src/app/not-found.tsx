import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-600">There is nothing at this address, or it no longer exists.</p>
        <div className="mt-6">
          <Link href="/" className={buttonClass("secondary")}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
