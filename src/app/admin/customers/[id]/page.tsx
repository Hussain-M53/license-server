import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Details, EmptyState, LinkButton, MaskedKey, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { customerDetail, licenseDisplayStatus, listLicenses } from "@/lib/queries";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();
  const customer = await customerDetail(db, id);
  if (!customer) notFound();
  const { rows: licenses } = await listLicenses(db, { customerId: id });
  const canSupport = hasRole(user.role, "support");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={customer.name}
        actions={canSupport && <LinkButton href={`/admin/licenses/new?customer=${customer.id}`}>New license</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Licenses" flush>
            {licenses.length === 0 ? (
              <EmptyState title="No licenses yet." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Key</Th>
                    <Th>Product</Th>
                    <Th>Computers</Th>
                    <Th>Status</Th>
                    <Th>Issued</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {licenses.map((license) => {
                    const status = licenseDisplayStatus(license.status, license.computers);
                    return (
                      <tr key={license.id} className="hover:bg-zinc-50">
                        <Td>
                          <Link href={`/admin/licenses/${license.id}`} className="font-medium text-indigo-600 hover:underline">
                            <MaskedKey prefix={license.keyPrefix} hint={license.keyHint} />
                          </Link>
                        </Td>
                        <Td>{license.productName}</Td>
                        <Td className="tabular-nums">
                          {license.computers} of {license.maxActivations}
                          {license.firstComputer && <p className="text-xs text-zinc-500">{license.firstComputer}</p>}
                        </Td>
                        <Td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </Td>
                        <Td className="whitespace-nowrap">{formatDate(license.createdAt)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <Card title="Details">
          {canSupport ? (
            <CustomerForm
              customerId={customer.id}
              values={{
                name: customer.name,
                contactName: customer.contactName ?? "",
                email: customer.email ?? "",
                phone: customer.phone ?? "",
                country: customer.country ?? "",
                notes: customer.notes ?? "",
              }}
            />
          ) : (
            <Details
              items={[
                ["Contact", customer.contactName],
                ["E-mail", customer.email],
                ["Phone", customer.phone],
                ["Country", customer.country],
                ["Notes", customer.notes && <span className="whitespace-pre-line">{customer.notes}</span>],
              ]}
            />
          )}
          <p className="mt-4 text-xs text-zinc-500">
            Added {formatDateTime(customer.createdAt)}
            {customer.createdBy && ` by ${customer.createdBy}`}
          </p>
        </Card>
      </div>
    </>
  );
}
