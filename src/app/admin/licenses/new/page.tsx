import type { Metadata } from "next";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { customerOptions, productOptions } from "@/lib/queries";
import { NewLicenseForm } from "./new-license-form";

export const metadata: Metadata = { title: "New license" };

export default async function NewLicensePage({ searchParams }: PageProps<"/admin/licenses/new">) {
  const user = await requireUser("support");
  const { customer } = await searchParams;
  const db = await getDb();
  const [products, customers] = await Promise.all([productOptions(db), customerOptions(db)]);
  return (
    <>
      <PageHeader title="New license" description="Issues a license key for one customer and product." back={{ href: "/admin/licenses", label: "Licenses" }} />
      {products.length === 0 ? (
        <Notice tone="warning" title="No products yet">
          {user.role === "admin" ? "Add the product on the Products page first." : "Ask an administrator to add the product first."}
        </Notice>
      ) : (
        <Card>
          <NewLicenseForm
            products={products.map((product) => ({ value: product.id, label: `${product.name} (${product.code})` }))}
            customers={customers.map((option) => ({ value: option.id, label: option.name }))}
            customerId={typeof customer === "string" ? customer : undefined}
          />
        </Card>
      )}
      {customers.length === 0 && products.length > 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          No customers yet.{" "}
          <LinkButton href="/admin/customers/new?then=license" variant="ghost" size="sm">
            Add a customer
          </LinkButton>
        </p>
      )}
    </>
  );
}
