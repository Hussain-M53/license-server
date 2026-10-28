import type { Metadata } from "next";
import Link from "next/link";
import { EventList } from "@/components/event-list";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { overview } from "@/lib/queries";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const stats = await overview(await getDb());
  const canIssue = hasRole(user.role, "support");
  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Licenses, the computers using them, and what happened lately."
        actions={canIssue && <LinkButton href="/admin/licenses/new">New license</LinkButton>}
      />
      {denied && (
        <div className="mb-6">
          <Notice tone="warning">Your role does not include that page. Ask an administrator if you need it.</Notice>
        </div>
      )}
      {user.role === "admin" && stats.pendingUsers > 0 && (
        <div className="mb-6">
          <Notice tone="info" title={`${stats.pendingUsers} access ${stats.pendingUsers === 1 ? "request is" : "requests are"} waiting`}>
            <Link href="/admin/team" className="font-medium underline">
              Review on the Team page
            </Link>
          </Notice>
        </div>
      )}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active licenses" value={stats.licenses.active} href="/admin/licenses" />
        <Stat label="Not activated yet" value={stats.licenses.unused} href="/admin/licenses?filter=unused" />
        <Stat label="Computers licensed" value={stats.computers} href="/admin/licenses?filter=active" />
        <Stat
          label="Refused activations, 30 days"
          value={stats.refusedLast30Days}
          href="/admin/audit?group=activations"
          warn={stats.refusedLast30Days > 0}
        />
      </div>
      <Card title="Latest activity" actions={<LinkButton href="/admin/audit" variant="ghost" size="sm">Full audit log</LinkButton>} flush>
        <EventList events={stats.recent} empty="Nothing has happened yet. Create a product, a customer and a license to begin." />
      </Card>
    </>
  );
}

function Stat({ label, value, href, warn = false }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-zinc-300">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-amber-600" : "text-zinc-900"}`}>{value}</p>
    </Link>
  );
}
