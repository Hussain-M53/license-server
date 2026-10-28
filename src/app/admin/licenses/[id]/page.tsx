import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList } from "@/components/event-list";
import { Badge, Card, Details, EmptyState, MaskedKey, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { licenseDetail, licenseDisplayStatus } from "@/lib/queries";
import { EditLicense, ResetActivation, RevealKey, StatusChange } from "./license-controls";

export const metadata: Metadata = { title: "License" };

export default async function LicensePage({ params }: PageProps<"/admin/licenses/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await licenseDetail(await getDb(), id);
  if (!detail) notFound();
  const { license, computers, timeline } = detail;
  const active = computers.filter((computer) => computer.status === "active");
  const status = licenseDisplayStatus(license.status, active.length);
  const canSupport = hasRole(user.role, "support");
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/licenses", label: "Licenses" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <MaskedKey prefix={license.keyPrefix} hint={license.keyHint} />
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        description={
          <>
            {license.productName} for{" "}
            <Link href={`/admin/customers/${license.customerId}`} className="font-medium text-indigo-600 hover:underline">
              {license.customerName}
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Computers"
            description={`${active.length} of ${license.maxActivations} in use. A computer that is set up again keeps its place.`}
            flush
          >
            {computers.length === 0 ? (
              <EmptyState title="Not activated yet">The key is bound to a computer when the customer installs with it.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Computer</Th>
                    <Th>Activated</Th>
                    <Th>Status</Th>
                    {canSupport && <Th className="text-right">Action</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {computers.map((computer) => (
                    <tr key={computer.id}>
                      <Td>
                        <p className="font-medium text-zinc-900">{computer.machineName}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {[computer.windowsVersion, computer.appVersion && `version ${computer.appVersion}`].filter(Boolean).join(" · ")}
                        </p>
                      </Td>
                      <Td>
                        <p className="whitespace-nowrap">{formatDateTime(computer.activatedAt)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {computer.method === "offline" ? "Offline" : "Online"}
                          {computer.lastSeenAt.getTime() - computer.activatedAt.getTime() > 60_000 &&
                            ` · again ${formatDateTime(computer.lastSeenAt)}`}
                        </p>
                      </Td>
                      <Td>
                        {computer.status === "active" ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <>
                            <Badge>Reset</Badge>
                            <p className="mt-1 text-xs text-zinc-500">
                              {formatDateTime(computer.resetAt)} by {computer.resetBy}
                              {computer.resetReason && `: ${computer.resetReason}`}
                            </p>
                          </>
                        )}
                      </Td>
                      {canSupport && (
                        <Td className="text-right">
                          {computer.status === "active" && <ResetActivation activationId={computer.id} computer={computer.machineName} />}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="History" flush>
            <EventList events={timeline} empty="No events yet." showLinks={false} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Key">
            <p className="text-sm text-zinc-600">
              <MaskedKey prefix={license.keyPrefix} hint={license.keyHint} />
            </p>
            {isAdmin ? (
              <div className="mt-3">
                <RevealKey licenseId={license.id} />
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Only administrators can show the whole key.</p>
            )}
          </Card>

          <Card title="Details">
            <Details
              items={[
                ["Computers allowed", license.maxActivations],
                ["Kind", license.kind === "perpetual" ? "Perpetual" : license.kind],
                ["Reference", license.reference],
                ["Notes", license.notes && <span className="whitespace-pre-line">{license.notes}</span>],
                ["Issued", `${formatDateTime(license.createdAt)}${license.createdBy ? ` by ${license.createdBy}` : ""}`],
              ]}
            />
            {canSupport && license.status !== "revoked" && (
              <div className="mt-4">
                <EditLicense
                  licenseId={license.id}
                  values={{ maxActivations: String(license.maxActivations), reference: license.reference ?? "", notes: license.notes ?? "" }}
                />
              </div>
            )}
          </Card>

          {canSupport && license.status !== "revoked" && (
            <Card title="Stop or resume">
              <div className="space-y-3">
                {license.status === "active" && <StatusChange licenseId={license.id} change="suspend" />}
                {license.status === "suspended" && <StatusChange licenseId={license.id} change="resume" />}
                {isAdmin && <StatusChange licenseId={license.id} change="revoke" />}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Suspending or revoking stops new activations. Computers that already hold a license file keep working until periodic
                checks arrive in phase 2.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
