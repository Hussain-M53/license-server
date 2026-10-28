import type { Metadata } from "next";
import Link from "next/link";
import { EventList } from "@/components/event-list";
import { inputClass } from "@/components/fields";
import { buttonClass, Card, PageHeader, Pagination, withParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { EVENT_GROUPS, listEvents, type EventGroup } from "@/lib/queries";

export const metadata: Metadata = { title: "Audit log" };

const GROUPS: [EventGroup | "", string][] = [
  ["", "Everything"],
  ["activations", "Activations"],
  ["licenses", "Licenses"],
  ["customers", "Customers"],
  ["team", "Team and sign-ins"],
];

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const group = typeof params.group === "string" && params.group in EVENT_GROUPS ? (params.group as EventGroup) : undefined;
  const page = Number(params.page) || 1;
  const { rows, total, pageSize } = await listEvents(await getDb(), { q, group, page });
  return (
    <>
      <PageHeader title="Audit log" description="Everything that happened, newest first. Entries cannot be edited or deleted." />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Person, IP address, computer or key ending" aria-label="Search the audit log" className={`${inputClass()} max-w-md`} />
        {group && <input type="hidden" name="group" value={group} />}
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>
      <div className="mb-4 flex flex-wrap gap-1">
        {GROUPS.map(([value, label]) => (
          <Link
            key={value}
            href={withParams("/admin/audit", { q, group: value })}
            className={`rounded-full px-3 py-1 text-sm ${(group ?? "") === value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Card flush>
        <EventList events={rows} empty={q || group ? "Nothing matches." : "Nothing has happened yet."} />
        <Pagination page={page} total={total} pageSize={pageSize} href={(target) => withParams("/admin/audit", { q, group, page: target })} />
      </Card>
    </>
  );
}
