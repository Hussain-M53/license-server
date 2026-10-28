"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CopyButton, FormMessage, SubmitButton } from "@/components/client";
import { SelectField, TextArea, TextField } from "@/components/fields";
import { LinkButton } from "@/components/ui";
import { createLicenseAction, type NewLicenseState } from "../../actions";

type Option = { value: string; label: string };

export function NewLicenseForm({ products, customers, customerId }: { products: Option[]; customers: Option[]; customerId?: string }) {
  const [state, action] = useActionState(createLicenseAction, {} as NewLicenseState);

  if (state.ok && state.key) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-emerald-800">License key issued</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Send this key to the customer, for example by WhatsApp or e-mail. They enter it when installing.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <code className="select-all font-mono text-lg tracking-wider text-zinc-900">{state.key}</code>
          <CopyButton text={state.key} label="Copy key" />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Only administrators can show this key again, and each time is recorded in the audit log.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={`/admin/licenses/${state.licenseId}`}>Open the license</LinkButton>
          <button type="button" className="text-sm text-zinc-600 underline hover:text-zinc-900" onClick={() => window.location.reload()}>
            Issue another
          </button>
        </div>
      </div>
    );
  }

  const values = state.values ?? {};
  return (
    <form action={action} className="grid max-w-xl gap-5">
      <FormMessage state={state} />
      <SelectField
        label="Product"
        name="productId"
        options={products}
        placeholder={products.length > 1 ? "Choose…" : undefined}
        defaultValue={values.productId ?? (products.length === 1 ? products[0].value : "")}
        required
        errors={state.errors?.productId}
      />
      <div>
        <SelectField
          label="Customer"
          name="customerId"
          options={customers}
          placeholder="Choose…"
          defaultValue={values.customerId ?? customerId ?? ""}
          required
          errors={state.errors?.customerId}
        />
        <Link href="/admin/customers/new?then=license" className="mt-1.5 inline-block text-xs text-indigo-600 hover:underline">
          New customer…
        </Link>
      </div>
      <TextField
        label="Number of computers"
        name="maxActivations"
        type="number"
        min={1}
        max={1000}
        defaultValue={values.maxActivations ?? "1"}
        required
        hint="How many computers may use this key at the same time. Usually 1."
        errors={state.errors?.maxActivations}
        className="w-28"
      />
      <TextField
        label="Your reference"
        name="reference"
        defaultValue={values.reference}
        hint="Quote or invoice number, to find the license later."
        errors={state.errors?.reference}
      />
      <TextArea label="Notes" name="notes" defaultValue={values.notes} errors={state.errors?.notes} />
      <div>
        <SubmitButton pendingText="Issuing…">Issue license key</SubmitButton>
      </div>
    </form>
  );
}
