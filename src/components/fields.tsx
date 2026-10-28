import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./ui";

/** Form fields. Errors come from the action's FormState; ids tie labels and messages to inputs. */

export const inputClass = (invalid?: boolean) =>
  cx(
    "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400",
    "focus:outline-none focus:ring-2",
    invalid ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : "border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500/20",
  );

type FieldProps = {
  label: ReactNode;
  name: string;
  errors?: string[];
  hint?: ReactNode;
};

function FieldShell({ label, name, errors, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children}
      {hint && !errors?.length && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {errors?.map((error) => (
        <p key={error} id={`${name}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ))}
    </div>
  );
}

const describedBy = (name: string, errors?: string[], hint?: ReactNode) =>
  errors?.length ? `${name}-error` : hint ? `${name}-hint` : undefined;

export function TextField({ label, name, errors, hint, className, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <input
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        className={cx(inputClass(Boolean(errors?.length)), className)}
        {...input}
      />
    </FieldShell>
  );
}

export function TextArea({ label, name, errors, hint, className, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        className={cx(inputClass(Boolean(errors?.length)), className)}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  options,
  placeholder,
  className,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <select
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        className={cx(inputClass(Boolean(errors?.length)), className)}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
