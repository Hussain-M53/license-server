import Link from "next/link";
import { NavLink } from "@/components/client";
import { requireUser } from "@/lib/auth";
import { appName } from "@/lib/env";
import { signOutAction } from "../auth/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col bg-zinc-900 text-zinc-300 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <Link href="/admin" className="flex items-center gap-2.5 px-5 py-5 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">L</span>
          <span className="truncate text-sm font-semibold">{appName()}</span>
        </Link>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          <NavLink href="/admin" exact>
            Overview
          </NavLink>
          <NavLink href="/admin/licenses">Licenses</NavLink>
          <NavLink href="/admin/customers">Customers</NavLink>
          <NavLink href="/admin/products">Products</NavLink>
          <NavLink href="/admin/audit">Audit log</NavLink>
          {isAdmin && <NavLink href="/admin/team">Team</NavLink>}
        </nav>
        <div className="hidden border-t border-zinc-800 px-5 py-4 md:block">
          <Link href="/admin/account" className="block truncate text-sm font-medium text-white hover:underline">
            {user.name}
          </Link>
          <p className="truncate text-xs text-zinc-400">
            {user.email} · {user.role}
          </p>
          <form action={signOutAction} className="mt-3">
            <button type="submit" className="text-xs text-zinc-400 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-4 border-b border-zinc-200 bg-white px-4 py-2 text-sm md:hidden">
          <Link href="/admin/account" className="text-zinc-700">
            {user.name}
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-zinc-500">
              Sign out
            </button>
          </form>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
