import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/auth/sign-in">) {
  if (await getCurrentUser()) redirect("/admin");
  const { reset, next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-600">For staff who issue and manage licenses.</p>
      {reset === "1" && (
        <div className="mt-4">
          <Notice tone="success">Your password was changed. Sign in with the new one.</Notice>
        </div>
      )}
      <SignInForm next={typeof next === "string" ? next : undefined} />
      <p className="mt-6 text-center text-sm text-zinc-600">
        No account?{" "}
        <Link href="/auth/sign-up" className="font-medium text-indigo-600 hover:text-indigo-500">
          Request access
        </Link>
      </p>
    </>
  );
}
