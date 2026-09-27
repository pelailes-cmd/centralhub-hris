"use client";
import { parsePayrollCsv } from "@/lib/payroll-csv";
import { can } from "@/lib/permissions";
import type { Payslip } from "@/lib/types";
import { dateLabel, money } from "@/lib/utils";
import {
  ArrowDownToLine,
  Download,
  Eye,
  FileSpreadsheet,
  LockKeyhole,
  Plus,
  Upload,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Card, EmptyState, Field, PageHeading, Select, StatusBadge } from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Payroll() {
  const { data, act, download } = useWorkspace();
  const [tab, setTab] = useState("mine");
  const [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<Payslip | null>(null);
  const [publish, setPublish] = useState<Payslip | null>(null);
  const manage = can(data.viewer, "payroll.manage");
  const read = can(data.viewer, "payroll.read");
  const mine = data.payslips.filter(
    (p) => p.employee_id === data.viewer.employee_id && p.status === "Published",
  );
  const records = tab === "mine" ? mine : data.payslips;
  const latest = mine[0];
  const net = (p: Payslip) => Number(p.basic_pay) + Number(p.allowances) - Number(p.deductions);
  return (
    <div className="page-enter">
      <PageHeading
        title="The work. The reward."
        description="Your published payslips and payment records, securely in one place."
      >
        {manage && (
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload />
              Import CSV
            </Button>
            <Button onClick={() => setCreate(true)}>
              <Plus />
              Create payroll record
            </Button>
          </>
        )}
      </PageHeading>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-teal-100 bg-gradient-to-br from-teal-50/60 to-white p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="size-4 text-primary" />
            Latest net pay
          </p>
          <p className="mt-4 text-[27px] font-semibold tracking-[-1px]">
            {latest ? money(net(latest), latest.currency) : "—"}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {latest
              ? `Pay period: ${dateLabel(`${latest.period}-01`, { month: "long", year: "numeric" })}`
              : "Your published payslip will appear here"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-4 text-blue-500" />
            Published payslips
          </p>
          <p className="mt-4 text-[27px] font-semibold tracking-[-1px]">{mine.length}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">Your personal payment history</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-4 text-primary" />
            Private by design
          </p>
          <h2 className="mt-4 text-base font-semibold">Only the right eyes</h2>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Your payslips are available to you and explicitly authorized payroll personnel.
          </p>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex px-5">
          {[
            ["mine", "My payslips"],
            ...(read || manage ? [["records", "Authorized payroll records"]] : []),
          ].map(([v, label]) => (
            <button
              key={v}
              className="tab-button pt-5"
              data-active={tab === v}
              aria-pressed={tab === v}
              onClick={() => setTab(v)}
            >
              {label}
            </button>
          ))}
        </div>
        {records.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {tab === "records" && <th scope="col">Employee</th>}
                  <th scope="col">Pay period</th>
                  <th scope="col">Gross pay</th>
                  <th scope="col">Deductions</th>
                  <th scope="col">Net pay</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((p) => (
                  <tr key={p.id}>
                    {tab === "records" && (
                      <td>
                        <p className="text-xs font-medium">
                          {data.employees.find((e) => e.id === p.employee_id)?.full_name ||
                            "Authorized employee"}
                        </p>
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                          <FileSpreadsheet className="size-4 text-primary" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold">
                            {dateLabel(`${p.period}-01`, { month: "long", year: "numeric" })}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {p.published_at
                              ? `Published ${dateLabel(p.published_at)}`
                              : "Draft · not visible to employee"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[11px]">
                      {money(Number(p.basic_pay) + Number(p.allowances), p.currency)}
                    </td>
                    <td className="text-[11px] text-muted-foreground">
                      {money(Number(p.deductions), p.currency)}
                    </td>
                    <td className="text-[11px] font-semibold">{money(net(p), p.currency)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${p.period} payslip`}
                          onClick={() => setView(p)}
                        >
                          <Eye />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Download ${p.period} payslip`}
                          onClick={() => download("payslip", p.id)}
                        >
                          <Download />
                        </Button>
                        {p.status === "Draft" && manage && (
                          <Button size="sm" onClick={() => setPublish(p)}>
                            Publish
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Your payslips will feel at home here"
            description="Once your payroll team publishes a payslip, you can securely view and download it here."
          />
        )}
      </Card>
      <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
        Payroll amounts are recorded by your authorized payroll team. Statutory calculations are
        handled outside CentralHub until your jurisdiction’s rules are configured.
      </p>
      <Dialog
        open={!!view}
        onOpenChange={(v) => {
          if (!v) setView(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay statement</DialogTitle>
            <DialogDescription>
              {view && dateLabel(`${view.period}-01`, { month: "long", year: "numeric" })}
            </DialogDescription>
          </DialogHeader>
          {view && (
            <>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-semibold">
                  {data.employees.find((e) => e.id === view.employee_id)?.full_name || "Employee"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.employees.find((e) => e.id === view.employee_id)?.employee_number}
                </p>
              </div>
              <dl className="space-y-4 text-sm">
                {[
                  ["Basic pay", view.basic_pay],
                  ["Allowances", view.allowances],
                  ["Deductions", view.deductions],
                ].map(([label, value]) => (
                  <div className="flex justify-between" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{money(Number(value), view.currency)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-4 font-semibold">
                  <dt>Net pay</dt>
                  <dd className="text-lg text-primary">{money(net(view), view.currency)}</dd>
                </div>
              </dl>
              <Button onClick={() => download("payslip", view.id)}>
                <ArrowDownToLine />
                Download statement (CSV)
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ActionDialog
        open={create}
        onOpenChange={setCreate}
        title="Create a payroll draft"
        description="Enter verified payroll values. Review the draft before publishing it to the employee."
        submitLabel="Save draft"
        onSubmit={(f) => act("payroll", { records: [Object.fromEntries(f)] })}
      >
        <Field label="Employee" name="employee_id">
          <Select id="employee_id" name="employee_id" required>
            {data.employees
              .filter((e) => can(data.viewer, "payroll.manage", e))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.employee_number}
                </option>
              ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pay period" name="period" type="month" required />
          <Field label="Currency" name="currency">
            <Select id="currency" name="currency">
              {["PHP", "USD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Basic pay" name="basic_pay" type="number" min="0" step="0.01" required />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Allowances"
            name="allowances"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
          <Field
            label="Deductions"
            name="deductions"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
        </div>
      </ActionDialog>
      <ActionDialog
        open={importing}
        onOpenChange={setImporting}
        title="Import payroll records"
        description="Import up to 200 verified records. All records are saved as drafts in one transaction."
        submitLabel="Import drafts"
        onSubmit={async (f) => {
          const file = f.get("csv");
          if (!(file instanceof File) || !file.size)
            return { ok: false, message: "Choose a CSV file." };
          if (file.size > 500000) return { ok: false, message: "Keep the CSV under 500 KB." };
          return act("payroll", { records: parsePayrollCsv(await file.text()) });
        }}
      >
        <p className="break-all rounded-lg bg-muted p-3 font-mono text-[10px] leading-relaxed">
          employee_id,period,basic_pay,allowances,deductions,currency
        </p>
        <Field label="CSV file" name="csv" type="file" accept=".csv,text/csv" required />
        <p className="text-xs text-muted-foreground">
          Use employee UUIDs, YYYY-MM periods, and numbers without thousands separators. A duplicate
          employee and period will reject the entire import.
        </p>
      </ActionDialog>
      <ActionDialog
        open={!!publish}
        onOpenChange={(v) => {
          if (!v) setPublish(null);
        }}
        title="Publish this payslip?"
        description="The employee will be notified and can immediately view and download this statement."
        submitLabel="Publish payslip"
        onSubmit={() => act("publish-payslip", { id: publish?.id })}
      >
        <p className="rounded-lg bg-muted p-4 text-sm">
          {publish && `${publish.period} · ${money(net(publish), publish.currency)} net pay`}
        </p>
      </ActionDialog>
    </div>
  );
}
