import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { inputClass } from "@/components/fields";
import { Badge, Card, EmptyState, LinkButton, MaskedKey, PageHeader, Pagination, Table, Td, Th, buttonClass, withParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { hasRole } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { findLicenseIdByKey } from "@/lib/licenses";
import { isLicenseFilter, licenseDisplayStatus, listLicenses, PAGE_SIZE, productOptions } from "@/lib/queries";

export const metadata: Metadata = { title: "Licenses" };

const FILTERS = [
  ["", "All"],
  ["active", "Active"],
  ["unused", "Not activated"],
  ["suspended", "Suspended"],
  ["revoked", "Revoked"],
] as const;

export default async function LicensesPage({ searchParams }: PageProps<"/admin/licenses">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const product = typeof params.product === "string" ? params.product : "";
  const filter = isLicenseFilter(params.filter) ? params.filter : undefined;
  const page = Number(params.page) || 1;
  const db = await getDb();

  // A whole key pasted into the search box goes straight to its license.
  if (q.length >= 25) {
    const id = await findLicenseIdByKey(db, q);
    if (id) redirect(`/admin/licenses/${id}`);
  }

  const [{ rows, total }, products] = await Promise.all([
    listLicenses(db, { q, productId: product || undefined, filter, page }),
    productOptions(db),
  ]);
  const href = (changes: Record<string, string | number | undefined>) =>
    withParams("/admin/licenses", { q, product, filter, page: undefined, ...changes });

  return (
    <>
      <PageHeader
        title="Licenses"
        description="Every key issued, who holds it and where it is in use."
        actions={hasRole(user.role, "support") && <LinkButton href="/admin/licenses/new">New license</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Customer, reference, last 5 characters or the whole key"
          aria-label="Search licenses"
          className={`${inputClass()} max-w-md flex-1`}
        />
        {products.length > 1 && (
          <select name="product" defaultValue={product} aria-label="Product" className={`${inputClass()} w-auto`}>
            <option value="">All products</option>
            {products.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        )}
        {filter && <input type="hidden" name="filter" value={filter} />}
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={href({ filter: value || undefined })}
            className={`rounded-full px-3 py-1 text-sm ${(filter ?? "") === value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState title={q || filter ? "No license matches." : "No licenses yet."}>
            {!q && !filter && "Issue the first one with New license."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Customer</Th>
                <Th>Product</Th>
                <Th>Computers</Th>
                <Th>Status</Th>
                <Th>Issued</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const status = licenseDisplayStatus(row.status, row.computers);
                return (
                  <tr key={row.id} className="hover:bg-zinc-50">
                    <Td>
                      <Link href={`/admin/licenses/${row.id}`} className="font-medium text-indigo-600 hover:underline">
                        <MaskedKey prefix={row.keyPrefix} hint={row.keyHint} />
                      </Link>
                      {row.reference && <p className="mt-0.5 text-xs text-zinc-500">Ref. {row.reference}</p>}
                    </Td>
                    <Td>
                      <Link href={`/admin/customers/${row.customerId}`} className="hover:underline">
                        {row.customerName}
                      </Link>
                    </Td>
                    <Td>{row.productName}</Td>
                    <Td>
                      <span className="tabular-nums">
                        {row.computers} of {row.maxActivations}
                      </span>
                      {row.firstComputer && <p className="mt-0.5 text-xs text-zinc-500">{row.firstComputer}{row.computers > 1 ? ", …" : ""}</p>}
                    </Td>
                    <Td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(row.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} href={(target) => href({ page: target })} />
      </Card>
    </>
  );
}
