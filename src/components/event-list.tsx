import Link from "next/link";
import { describeEvent } from "@/lib/event-labels";
import { formatDateTime } from "@/lib/format";
import { Badge, EmptyState } from "./ui";

export type EventRow = {
  id: string;
  at: Date;
  type: string;
  actor: string | null;
  ip: string | null;
  licenseId: string | null;
  customerId: string | null;
  customerName?: string | null;
  details: Record<string, unknown> | null;
};

const DOT = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-zinc-400", blue: "bg-indigo-500" };

/** Audit entries as a readable list; used by the overview, license pages and the audit log. */
export function EventList({ events, empty, showLinks = true }: { events: EventRow[]; empty: string; showLinks?: boolean }) {
  if (events.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-zinc-100">
      {events.map((event) => {
        const { title, detail, tone } = describeEvent(event.type, event.details);
        return (
          <li key={event.id} className="flex gap-3 px-5 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-900">
                {title}
                {showLinks && event.customerName && event.customerId && (
                  <>
                    {" · "}
                    <Link href={`/admin/customers/${event.customerId}`} className="text-indigo-600 hover:underline">
                      {event.customerName}
                    </Link>
                  </>
                )}
                {showLinks && event.licenseId && (
                  <>
                    {" · "}
                    <Link href={`/admin/licenses/${event.licenseId}`} className="text-indigo-600 hover:underline">
                      license
                    </Link>
                  </>
                )}
              </p>
              {detail && <p className="mt-0.5 truncate text-xs text-zinc-500">{detail}</p>}
            </div>
            <div className="shrink-0 text-right text-xs text-zinc-500">
              <p>{formatDateTime(event.at)}</p>
              <p className="mt-0.5">
                {event.actor === "client" ? <Badge>installer</Badge> : event.actor}
                {event.ip && <span className="ml-1 text-zinc-400">{event.ip}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
