import Link from "next/link";
import type { ReactNode } from "react";

/** Presentational building blocks shared by every page. No state, so usable anywhere. */

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
    variant === "secondary" && "border border-zinc-300 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50",
    variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-500",
    variant === "ghost" && "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  );
}

export function LinkButton({
  href,
  variant,
  size,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-zinc-500 hover:text-zinc-800">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** No inner padding, for tables. */
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-zinc-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "px-5 py-4"}>{children}</div>
    </section>
  );
}

export type Tone = "green" | "amber" | "red" | "gray" | "blue";

const BADGE_TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

const NOTICE_TONES = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof NOTICE_TONES;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", NOTICE_TONES[tone])}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {children && <p className="mt-1 text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx("bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-top text-zinc-700", className)}>{children}</td>;
}

export function Details({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {items.map(([label, value], index) => (
        <div key={index} className="contents">
          <dt className="text-sm text-zinc-500">{label}</dt>
          <dd className="text-sm text-zinc-900">{value || <span className="text-zinc-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-sm text-zinc-600">
      <span>
        Page {page} of {pages} · {total} in all
      </span>
      <span className="flex gap-2">
        {page > 1 && <LinkButton href={href(page - 1)} variant="secondary" size="sm">Previous</LinkButton>}
        {page < pages && <LinkButton href={href(page + 1)} variant="secondary" size="sm">Next</LinkButton>}
      </span>
    </nav>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap font-mono text-[0.95em]">{children}</span>;
}

/** A key with only its prefix and last group showing, e.g. ENRC-…-D9MD6. */
export function MaskedKey({ prefix, hint }: { prefix: string; hint: string }) {
  return (
    <Mono>
      {prefix}-…-{hint}
    </Mono>
  );
}

/** Builds a URL with search parameters, leaving out empty ones. */
export function withParams(path: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(name, String(value));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** The app's mark: a key on an indigo tile. */
export function KeyMark() {
  return (
    <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.03 5.91c-.57-.1-1.17.03-1.58.44L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.82c0-.6.24-1.17.66-1.59l6.4-6.4c.41-.41.54-1.01.44-1.58A6 6 0 1 1 21.75 8.25Z"
        />
      </svg>
    </div>
  );
}
