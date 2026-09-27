"use client";
import { useState } from "react";
import { Field, FormError, SubmitButton } from "./ui/shared";
import { useWorkspace } from "./workspace-provider";
const fields: Record<string, [string, string, string?][]> = {
  bank: [
    ["bank_name", "Bank name"],
    ["account_name", "Account holder"],
    ["account_number", "Account number"],
    ["currency", "Currency"],
  ],
  government: [
    ["id_type", "Identifier type"],
    ["identifier", "Identifier"],
    ["issuing_country", "Issuing country"],
  ],
  medical: [
    ["summary", "Record summary"],
    ["record_date", "Record date", "date"],
    ["provider", "Provider"],
    ["restricted_note", "Authorized care note"],
  ],
  disciplinary: [
    ["summary", "Record summary"],
    ["record_date", "Record date", "date"],
    ["outcome", "Recorded outcome"],
    ["restricted_note", "Case note"],
  ],
  identity: [
    ["document_type", "Document type"],
    ["document_number", "Document number"],
    ["expiry_date", "Expiry date", "date"],
    ["issuing_country", "Issuing country"],
  ],
};
export function SensitiveRecord({
  employeeId,
  category,
  value,
  editable,
}: {
  employeeId: string;
  category: string;
  value: unknown;
  editable: boolean;
}) {
  const { act } = useWorkspace();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await act("sensitive", {
      employee_id: employeeId,
      category,
      data: { ...record, ...Object.fromEntries(new FormData(e.currentTarget)) },
    });
    if (!result.ok) setError(result.message);
    setPending(false);
  }
  if (!editable)
    return Object.keys(record).length ? (
      <dl className="grid gap-5 sm:grid-cols-2">
        {Object.entries(record).map(([key, v]) => (
          <div key={key}>
            <dt className="text-xs capitalize text-muted-foreground">
              {fields[category]?.find((f) => f[0] === key)?.[1] || key.replaceAll("_", " ")}
            </dt>
            <dd className="mt-2 break-words text-sm">
              {typeof v === "object" ? JSON.stringify(v) : String(v ?? "Not recorded")}
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="text-sm text-muted-foreground">No {category} information has been recorded.</p>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields[category]?.map(([name, label, type]) => (
          <Field
            key={name}
            name={name}
            label={label}
            type={type || "text"}
            maxLength={1000}
            defaultValue={String(record[name] || "")}
          />
        ))}
      </div>
      <FormError message={error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Save restricted record</SubmitButton>
      </div>
    </form>
  );
}
