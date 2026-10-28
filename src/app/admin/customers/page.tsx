import type { Metadata } from "next";
import Link from "next/link";
import { inputClass } from "@/components/fields";
import { buttonClass, Card, EmptyState, LinkButton, PageHeader, Pagination, Table, Td, Th, withParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listCustomers, PAGE_SIZE } from "@/lib/queries";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Number(params.page) || 1;
  const { rows, total } = await listCustomers(await getDb(), { q, page });
  return (
    <>
      <PageHeader
        title="Customers"
        description="The companies you issue licenses to."
        actions={hasRole(user.role, "support") && <LinkButton href="/admin/customers/new">New customer</LinkButton>}
      />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Name, contact, e-mail or phone" aria-label="Search customers" className={`${inputClass()} max-w-md`} />
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState title={q ? "No customer matches." : "No customers yet."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Contact</Th>
                <Th>Country</Th>
                <Th>Licenses</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50">
                  <Td>
                    <Link href={`/admin/customers/${row.id}`} className="font-medium text-indigo-600 hover:underline">
                      {row.name}
                    </Link>
                  </Td>
                  <Td>
                    {row.contactName}
                    <p className="text-xs text-zinc-500">{[row.email, row.phone].filter(Boolean).join(" · ")}</p>
                  </Td>
                  <Td>{row.country}</Td>
                  <Td className="tabular-nums">{row.licenseCount}</Td>
                  <Td className="whitespace-nowrap">{formatDate(row.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} href={(target) => withParams("/admin/customers", { q, page: target })} />
      </Card>
    </>
  );
}
