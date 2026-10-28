"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/forms";
import { buttonClass, cx, Notice, type ButtonVariant } from "./ui";

/** Disabled while its form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size,
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  name?: string;
  value?: string;
  /** Asks the browser to confirm first. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, size)}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

/** The action's overall message, green or red. */
export function FormMessage({ state }: { state: FormState | undefined }) {
  if (!state?.message) return null;
  return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

/** Offers text as a file download, made in the browser. */
export function DownloadButton({ text, fileName, children }: { text: string; fileName: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={buttonClass("primary")}
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </button>
  );
}
