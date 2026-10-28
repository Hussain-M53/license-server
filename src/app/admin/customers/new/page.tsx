import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage({ searchParams }: PageProps<"/admin/customers/new">) {
  await requireUser("support");
  const { then } = await searchParams;
  const toLicense = then === "license";
  return (
    <>
      <PageHeader
        title="New customer"
        description={toLicense ? "After saving, you continue with the new license." : undefined}
        back={toLicense ? { href: "/admin/licenses/new", label: "New license" } : { href: "/admin/customers", label: "Customers" }}
      />
      <Card>
        <CustomerForm then={toLicense ? "license" : undefined} />
      </Card>
    </>
  );
}
