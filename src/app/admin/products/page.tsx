import type { Metadata } from "next";
import { Card, EmptyState, Mono, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { env, licenseIssuer } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { listProducts } from "@/lib/queries";
import { ProductForm } from "./product-form";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const user = await requireUser();
  const products = await listProducts(await getDb());
  return (
    <>
      <PageHeader title="Products" description="The software you license. Each product's keys start with its own prefix." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card flush>
            {products.length === 0 ? (
              <EmptyState title="No products yet." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Code</Th>
                    <Th>Key prefix</Th>
                    <Th>Licenses</Th>
                    <Th>Added</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {products.map((product) => (
                    <tr key={product.id}>
                      <Td className="font-medium text-zinc-900">{product.name}</Td>
                      <Td>
                        <Mono>{product.code}</Mono>
                      </Td>
                      <Td>
                        <Mono>{product.keyPrefix}-…</Mono>
                      </Td>
                      <Td className="tabular-nums">{product.licenseCount}</Td>
                      <Td className="whitespace-nowrap">{formatDate(product.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="For product builds">
            <p className="text-sm text-zinc-600">
              Installers and products are built with this server&apos;s address and public key. The installer kit checks them against
              the server when it builds a release.
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div>
                <dt className="inline text-zinc-500">Server: </dt>
                <dd className="inline">
                  <Mono>{env().APP_URL}</Mono>
                </dd>
              </div>
              <div>
                <dt className="inline text-zinc-500">Issuer: </dt>
                <dd className="inline">
                  <Mono>{licenseIssuer()}</Mono>
                </dd>
              </div>
              <div>
                <dt className="inline text-zinc-500">Signing key id: </dt>
                <dd className="inline">
                  <Mono>{env().LICENSE_SIGNING_KID}</Mono>
                </dd>
              </div>
            </dl>
            <a href="/api/v1/keys" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">
              Public keys (JSON)
            </a>
          </Card>
        </div>
        {user.role === "admin" && (
          <Card title="Add a product">
            <ProductForm />
          </Card>
        )}
      </div>
    </>
  );
}
