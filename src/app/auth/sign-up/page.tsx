import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Request access" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Request access</h1>
      <p className="mt-1 text-sm text-zinc-600">An administrator approves new accounts before they can sign in.</p>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-zinc-600">
        Already approved?{" "}
        <Link href="/auth/sign-in" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </>
  );
}
