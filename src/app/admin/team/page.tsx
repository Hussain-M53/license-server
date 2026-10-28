import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listUsers } from "@/lib/queries";
import { ApproveRequest, MemberControls } from "./team-controls";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireUser("admin");
  const users = await listUsers(await getDb());
  const pending = users.filter((user) => user.status === "pending");
  const members = users.filter((user) => user.status !== "pending");
  return (
    <>
      <PageHeader
        title="Team"
        description="Who can use this dashboard. Admins manage everything; support issues and manages licenses; viewers only look."
      />
      <div className="space-y-6">
        <Card title="Access requests" description="People who signed up and are waiting for approval." flush>
          {pending.length === 0 ? (
            <EmptyState title="No requests waiting." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {pending.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-zinc-900">{user.name}</p>
                    <p className="text-sm text-zinc-500">
                      {user.email} · asked {formatDateTime(user.createdAt)}
                    </p>
                  </div>
                  <ApproveRequest userId={user.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Members" flush>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {members.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <p className="font-medium text-zinc-900">
                      {user.name} {user.id === me.id && <span className="text-xs font-normal text-zinc-500">(you)</span>}
                    </p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </Td>
                  <Td>
                    <span className="capitalize">{user.role}</span>
                    {user.status === "disabled" && (
                      <span className="ml-2">
                        <Badge tone="red">Disabled</Badge>
                      </span>
                    )}
                    {user.lockedUntil && user.lockedUntil > new Date() && (
                      <span className="ml-2">
                        <Badge tone="amber">Locked</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "Never"}</Td>
                  <Td className="text-right">
                    {user.id !== me.id && <MemberControls userId={user.id} role={user.role ?? "viewer"} disabled={user.status === "disabled"} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
