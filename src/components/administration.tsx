"use client";
import { toCsv } from "@/lib/downloads";
import { can, permissionLabels, roleTemplates } from "@/lib/permissions";
import type { Grant } from "@/lib/types";
import { companyDate, dateLabel } from "@/lib/utils";
import {
  Building2,
  Download,
  GitBranch,
  KeyRound,
  MailPlus,
  Plus,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Badge,
  Card,
  CardHeading,
  EmptyState,
  Field,
  FormError,
  PageHeading,
  Select,
  StatusBadge,
} from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

type AdminData = {
  candidates: { id: string; full_name: string; email: string; employee_number: string }[];
  grants: (Grant & { id: string; user_id: string; role_assignment_id: string | null })[];
  roles: {
    id: string;
    user_id: string;
    role_name: string;
    scope: string;
    department_id: string | null;
    team_id: string | null;
  }[];
  positions: { id: string; title: string; department_id: string | null }[];
  settings: { company_name: string; timezone: string; currency: string };
  holidays: { holiday_date: string; name: string }[];
};
export function Administration() {
  const { data, act } = useWorkspace();
  const viewer = data.viewer;
  const org = can(viewer, "organization.manage");
  const accounts = can(viewer, "accounts.manage");
  const access = can(viewer, "access.manage");
  const audit = can(viewer, "audit.read");
  const [tab, setTab] = useState(
    org ? "organization" : accounts ? "accounts" : access ? "access" : "audit",
  );
  const [dialog, setDialog] = useState("");
  const [scope, setScope] = useState("company");
  const [role, setRole] = useState("Specialist");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [routeDepartment, setRouteDepartment] = useState("");
  const [matrix, setMatrix] = useState(false);
  const [error, setError] = useState("");
  const [revoke, setRevoke] = useState<{ id: string; is_role: boolean; label: string } | null>(
    null,
  );
  const [status, setStatus] = useState<{ id: string; status: string; name: string } | null>(null);
  const [meta, setMeta] = useState<AdminData>({
    candidates: data.employees.map((e) => ({
      id: e.id,
      full_name: e.full_name,
      email: e.email,
      employee_number: e.employee_number,
    })),
    grants: [],
    roles: [],
    positions: data.employees.map((e) => ({
      id: e.id,
      title: e.job_title,
      department_id: e.department_id,
    })),
    settings: data.organization,
    holidays: [],
  });
  useEffect(() => {
    if (data.isDemo) return;
    let active = true;
    fetch("/api/admin")
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.message);
        return v;
      })
      .then((v) => {
        if (active) setMeta(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [data.isDemo, data.accounts]);
  const displayMeta = data.isDemo
    ? {
        ...meta,
        candidates: data.employees,
        positions: data.positions,
        settings: data.organization,
        holidays: data.holidays,
      }
    : meta;
  const candidate = (id: string) => meta.candidates.find((c) => c.id === id);
  const accountName = (id: string) =>
    candidate(data.accounts.find((a) => a.id === id)?.employee_id || "")?.full_name || "Account";
  const options = meta.candidates.map((e) => (
    <option key={e.id} value={e.id}>
      {e.full_name} · {e.employee_number}
    </option>
  ));
  const departmentOptions = data.departments.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ));
  const routes = data.routes.filter((r) => !routeDepartment || r.department_id === routeDepartment);
  const filteredGrants = meta.grants.filter(
    (g) => !selectedAccount || g.user_id === selectedAccount,
  );
  const filteredRoles = meta.roles.filter((r) => !selectedAccount || r.user_id === selectedAccount);
  const scopeName = (s: {
    scope: string;
    department_id?: string | null;
    team_id?: string | null;
  }) =>
    s.scope === "department"
      ? data.departments.find((d) => d.id === s.department_id)?.name || "Department"
      : s.scope === "team"
        ? data.teams.find((t) => t.id === s.team_id)?.name || "Team"
        : s.scope.replaceAll("_", " ");
  async function exportAudit() {
    try {
      let blob: Blob;
      if (data.isDemo)
        blob = new Blob(
          [
            toCsv([
              ["Action", "Resource", "Date"],
              ...data.audit.map((a) => [a.action, a.resource_type, a.created_at]),
            ]),
          ],
          { type: "text/csv" },
        );
      else {
        const response = await fetch("/api/exports/audit");
        if (!response.ok) throw new Error("Audit export was not authorized.");
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "centralhub-audit.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    }
  }
  const titles: Record<string, string> = {
    department: "Add a department",
    team: "Create an assigned team",
    position: "Add a position",
    route: "Configure an approval route",
    leave_type: "Add a leave type",
    balance: "Set a leave allowance",
    holiday: "Add a company holiday",
    settings: "Company settings",
    invite: "Invite an employee",
    role: "Assign a role template",
    grant: "Grant an explicit permission",
  };
  async function submit(f: FormData) {
    const values = Object.fromEntries(f);
    if (dialog === "invite") return act("invite", { employee_id: f.get("employee_id") });
    if (dialog === "role" || dialog === "grant")
      return act(dialog, {
        ...values,
        role,
        scope,
        department_id: scope === "department" ? f.get("department_id") : null,
        team_id: scope === "team" ? f.get("team_id") : null,
      });
    if (dialog === "position")
      return act("position", { ...values, department_id: f.get("department_id") || null });
    return act("organization", { kind: dialog, data: values });
  }
  return (
    <div className="page-enter">
      <PageHeading
        title="A thoughtful foundation."
        description="Give your organization structure, clear responsibilities, and the right access."
      >
        <Button variant="outline" onClick={() => setMatrix(true)}>
          <ShieldCheck />
          Permission templates
        </Button>
        {org && (
          <Button onClick={() => setDialog("settings")}>
            <Settings2 />
            Company settings
          </Button>
        )}
      </PageHeading>
      <FormError message={error} />
      <div className="mb-6 flex overflow-auto border-b border-border">
        {[
          ...(org
            ? [
                ["organization", "Organization"],
                ["workflows", "Approval workflows"],
              ]
            : []),
          ...(accounts ? [["accounts", "Accounts"]] : []),
          ...(access ? [["access", "Roles & permissions"]] : []),
          ...(audit ? [["audit", "Audit history"]] : []),
        ].map(([v, label]) => (
          <button
            key={v}
            className="tab-button"
            data-active={tab === v}
            aria-pressed={tab === v}
            onClick={() => setTab(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "organization" ? (
        <div className="space-y-5">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
            <Card>
              <CardHeading title="Departments" description="The teams that make your company work.">
                <Button variant="outline" size="sm" onClick={() => setDialog("department")}>
                  <Plus />
                  Add department
                </Button>
              </CardHeading>
              <div className="divide-y divide-border px-5">
                {data.departments.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-4">
                    <span
                      className="flex size-9 items-center justify-center rounded-lg bg-muted"
                      style={{ color: d.color }}
                    >
                      <Building2 className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold">{d.name}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {data.teams.filter((t) => t.department_id === d.id).length} assigned team
                        {data.teams.filter((t) => t.department_id === d.id).length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge>
                      {data.summary.departments.find((s) => s.name === d.name)?.count || 0} people
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-4">
                <Button variant="ghost" size="sm" onClick={() => setDialog("team")}>
                  <Plus />
                  Create a team within a department
                </Button>
              </div>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeading title="Leave policies">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Add leave type"
                    onClick={() => setDialog("leave_type")}
                  >
                    <Plus />
                  </Button>
                </CardHeading>
                <div className="space-y-4 px-5 pb-5">
                  {data.leaveTypes.map((t) => (
                    <div key={t.id} className="flex justify-between text-xs">
                      <span>{t.name}</span>
                      <span className="text-muted-foreground">
                        {t.annual_allowance} days / year
                      </span>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setDialog("balance")}
                  >
                    Set individual allowance
                  </Button>
                </div>
              </Card>
              <Card>
                <CardHeading title="Company holidays">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add holiday"
                    onClick={() => setDialog("holiday")}
                  >
                    <Plus />
                  </Button>
                </CardHeading>
                <div className="space-y-3 px-5 pb-5">
                  {displayMeta.holidays.length ? (
                    displayMeta.holidays.map((h) => (
                      <p key={h.holiday_date} className="flex justify-between gap-3 text-xs">
                        <span>{h.name}</span>
                        <span className="text-muted-foreground">{dateLabel(h.holiday_date)}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Add your company’s non-working days. They’ll be excluded from leave
                      calculations.
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </div>
          <Card>
            <CardHeading
              title="Positions"
              description="Job titles describe the work. Permissions are assigned separately."
            >
              <Button variant="outline" size="sm" onClick={() => setDialog("position")}>
                <Plus />
                Add position
              </Button>
            </CardHeading>
            <div
              className="flex max-h-64 flex-wrap gap-2 overflow-auto px-5 pb-5 focus-visible:outline-2 focus-visible:outline-primary"
              role="region"
              aria-label="Company positions"
              tabIndex={0}
            >
              {displayMeta.positions.map((p) => (
                <span
                  key={p.id}
                  className="rounded-lg border border-border bg-slate-50/50 px-3 py-2 text-[11px]"
                >
                  {p.title}
                  <span className="ml-2 text-[9px] text-muted-foreground">
                    {data.departments.find((d) => d.id === p.department_id)?.name}
                  </span>
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : tab === "workflows" ? (
        <Card>
          <CardHeading
            title="Explicit approval assignments"
            description="Titles and reporting lines never determine the approval chain automatically."
          >
            <Button size="sm" onClick={() => setDialog("route")}>
              <GitBranch />
              Set approval route
            </Button>
          </CardHeading>
          <div className="px-5 pb-4">
            <Select
              aria-label="Filter workflow department"
              className="max-w-xs"
              value={routeDepartment}
              onChange={(e) => setRouteDepartment(e.target.value)}
            >
              <option value="">All departments</option>
              {departmentOptions}
            </Select>
          </div>
          {routes.length ? (
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Request</th>
                    <th scope="col">Assigned approver</th>
                    <th scope="col">Delegation</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id}>
                      <td className="text-xs">
                        {data.departments.find((d) => d.id === r.department_id)?.name}
                      </td>
                      <td>
                        <Badge>{r.request_type}</Badge>
                      </td>
                      <td className="text-xs">
                        {candidate(r.approver_id)?.full_name ||
                          data.employees.find((e) => e.id === r.approver_id)?.full_name ||
                          "Assigned approver"}
                      </td>
                      <td className="text-[10px] text-muted-foreground">
                        {r.delegate_id
                          ? `${candidate(r.delegate_id)?.full_name || "Delegate"} · until ${r.delegate_until}`
                          : "No active delegation"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Give every request a clear next step"
              description="Configure an approver before employees submit leave, attendance, or other requests."
            />
          )}
          <p className="border-t border-border p-5 text-[11px] leading-relaxed text-muted-foreground">
            The assigned approver also needs the matching scoped permission. Delegates need their
            own permission and a valid delegation period. Route changes apply to new requests;
            existing requests keep their assigned reviewers.
          </p>
        </Card>
      ) : tab === "accounts" ? (
        <Card>
          <CardHeading
            title="Account access"
            description="Invitations activate employee accounts. Suspending or deactivating an account revokes active sessions."
          >
            <Button onClick={() => setDialog("invite")} size="sm">
              <MailPlus />
              Invite employee
            </Button>
          </CardHeading>
          {data.accounts.length ? (
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Account status</th>
                    <th scope="col">Created</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => {
                    const e = candidate(a.employee_id);
                    return (
                      <tr key={a.id}>
                        <td>
                          <p className="text-xs font-semibold">
                            {e?.full_name || "Employee account"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{e?.email}</p>
                        </td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="text-[10px] text-muted-foreground">
                          {dateLabel(a.created_at)}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {a.status !== "invited" && a.id !== viewer.id && (
                              <>
                                {a.status !== "active" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setStatus({
                                        id: a.id,
                                        status: "active",
                                        name: e?.full_name || "this employee",
                                      })
                                    }
                                  >
                                    Reactivate
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setStatus({
                                        id: a.id,
                                        status: "suspended",
                                        name: e?.full_name || "this employee",
                                      })
                                    }
                                  >
                                    Suspend
                                  </Button>
                                )}
                                {a.status !== "deactivated" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setStatus({
                                        id: a.id,
                                        status: "deactivated",
                                        name: e?.full_name || "this employee",
                                      })
                                    }
                                  >
                                    Deactivate
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Accounts begin with an invitation"
              description="Create an employee record, then invite them using their verified work email."
            />
          )}
        </Card>
      ) : tab === "access" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              aria-label="Filter account permissions"
              className="max-w-sm"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="">All accounts in your scope</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountName(a.id)}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setScope("company");
                  setDialog("grant");
                }}
              >
                <KeyRound />
                Add permission
              </Button>
              <Button
                onClick={() => {
                  setRole("Specialist");
                  setScope("own");
                  setDialog("role");
                }}
              >
                <Plus />
                Assign role
              </Button>
            </div>
          </div>
          <Card>
            <CardHeading
              title="Assigned role templates"
              description="A template adds explicit permission grants at the scope you choose."
            />
            <div className="divide-y divide-border px-5">
              {filteredRoles.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-xs font-semibold">
                      {r.role_name}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {accountName(r.user_id)}
                      </span>
                    </p>
                    <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                      {scopeName(r)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${r.role_name} role`}
                    onClick={() => setRevoke({ id: r.id, is_role: true, label: r.role_name })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            {!filteredRoles.length && (
              <EmptyState
                title="No role assignments to show"
                description="Self-service access is available to every active employee. Add functional privileges only when they’re needed."
              />
            )}
          </Card>
          <Card>
            <CardHeading
              title="Actual permission grants"
              description="These explicit records determine access. Job classifications do not."
            />
            {filteredGrants.length ? (
              <div className="overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Permission</th>
                      <th scope="col">Account</th>
                      <th scope="col">Scope</th>
                      <th scope="col">
                        <span className="sr-only">Revoke</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGrants.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <p className="text-xs">
                            {permissionLabels[g.permission] || g.permission}
                          </p>
                          <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                            {g.permission}
                          </p>
                        </td>
                        <td className="text-xs">{accountName(g.user_id)}</td>
                        <td>
                          <Badge>{scopeName(g)}</Badge>
                        </td>
                        <td>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Revoke ${g.permission}`}
                            onClick={() =>
                              setRevoke({
                                id: g.id,
                                is_role: false,
                                label: permissionLabels[g.permission] || g.permission,
                              })
                            }
                          >
                            <X className="!size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No additional grants"
                description="Confidential HR, payroll, bank, medical, and identity records each require explicit permission."
              />
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeading
            title="Audit history"
            description="A record of access, changes, exports, and decisions. Confidential values are excluded."
          >
            <Button variant="outline" size="sm" onClick={exportAudit}>
              <Download />
              Export audit
            </Button>
          </CardHeading>
          {data.audit.length ? (
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Activity</th>
                    <th scope="col">Resource</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <p className="text-xs font-medium">
                          {a.action.replaceAll(".", " · ").replaceAll("_", " ")}
                        </p>
                      </td>
                      <td>
                        <Badge>{a.resource_type.replaceAll("_", " ")}</Badge>
                      </td>
                      <td className="font-mono text-[9px] text-muted-foreground">
                        {a.actor_id === viewer.id
                          ? viewer.name
                          : a.actor_id?.slice(0, 8) || "System"}
                      </td>
                      <td className="text-[10px] text-muted-foreground">
                        {dateLabel(a.created_at, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="A clear history starts here"
              description="Audited activity will appear as people use the workspace."
            />
          )}
        </Card>
      )}
      <ActionDialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) setDialog("");
        }}
        title={titles[dialog] || "Update organization"}
        description={
          dialog === "role" || dialog === "grant"
            ? "Choose an account and an explicit scope. Elevated permissions require MFA on the next access."
            : dialog === "route"
              ? "Assign the approver and optional temporary delegate. They must also have the matching scoped approval permission."
              : "These changes are saved to your organization and recorded in the audit history."
        }
        submitLabel={dialog === "invite" ? "Send invitation" : "Save changes"}
        onSubmit={submit}
      >
        {dialog === "department" && (
          <>
            <Field label="Department name" name="name" required minLength={2} maxLength={100} />
            <Field label="Department color" name="color" type="color" defaultValue="#178579" />
            <Field label="Parent division (optional)" name="parent_id">
              <Select name="parent_id" id="parent_id">
                <option value="">No parent division</option>
                {departmentOptions}
              </Select>
            </Field>
          </>
        )}
        {dialog === "team" && (
          <>
            <Field label="Team name" name="name" required minLength={2} maxLength={100} />
            <Field label="Department" name="department_id">
              <Select name="department_id" id="department_id" required>
                {departmentOptions}
              </Select>
            </Field>
          </>
        )}
        {dialog === "position" && (
          <>
            <Field label="Position title" name="title" required minLength={2} maxLength={100} />
            <Field label="Department" name="department_id">
              <Select name="department_id" id="department_id">
                <option value="">All departments</option>
                {departmentOptions}
              </Select>
            </Field>
          </>
        )}
        {dialog === "route" && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department" name="department_id">
                <Select name="department_id" id="department_id" required>
                  {departmentOptions}
                </Select>
              </Field>
              <Field label="Request type" name="request_type">
                <Select name="request_type" id="request_type">
                  {["leave", "attendance", "overtime", "planning"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Assigned approver" name="approver_id">
              <Select name="approver_id" id="approver_id" required>
                {options}
              </Select>
            </Field>
            <Field label="Temporary delegate (optional)" name="delegate_id">
              <Select name="delegate_id" id="delegate_id">
                <option value="">No delegate</option>
                {options}
              </Select>
            </Field>
            <Field
              label="Delegate until"
              name="delegate_until"
              type="date"
              min={companyDate(data.organization.timezone)}
              hint="Required if a delegate is selected."
            />
          </>
        )}
        {dialog === "leave_type" && (
          <>
            <Field label="Leave type name" name="name" required minLength={2} />
            <Field
              label="Default annual allowance (days)"
              name="annual_allowance"
              type="number"
              min="0"
              max="366"
              step="0.5"
              required
            />
            <input name="color" type="hidden" value="teal" />
          </>
        )}
        {dialog === "balance" && (
          <>
            <Field label="Employee" name="employee_id">
              <Select name="employee_id" id="employee_id" required>
                {options}
              </Select>
            </Field>
            <Field label="Leave type" name="leave_type_id">
              <Select name="leave_type_id" id="leave_type_id" required>
                {data.leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Year"
                name="year"
                type="number"
                min="2020"
                max="2100"
                defaultValue={Number(companyDate(data.organization.timezone).slice(0, 4))}
                required
              />
              <Field
                label="Total allowance (days)"
                name="allowance"
                type="number"
                min="0"
                step="0.5"
                max="366"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The allowance cannot be lower than days already used or reserved.
            </p>
          </>
        )}
        {dialog === "holiday" && (
          <>
            <Field label="Holiday name" name="name" required minLength={2} />
            <Field label="Date" name="date" type="date" required />
          </>
        )}
        {dialog === "settings" && (
          <>
            <Field
              label="Company name"
              name="company_name"
              required
              defaultValue={displayMeta.settings.company_name}
            />
            <Field label="Company timezone" name="timezone">
              <Select name="timezone" id="timezone" defaultValue={displayMeta.settings.timezone}>
                {[
                  "Asia/Manila",
                  "Asia/Singapore",
                  "Asia/Tokyo",
                  "UTC",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Europe/London",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default currency" name="currency">
              <Select name="currency" id="currency" defaultValue={displayMeta.settings.currency}>
                {["PHP", "USD", "EUR", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Currency selection does not enable tax or statutory payroll calculations.
            </p>
          </>
        )}
        {dialog === "invite" && (
          <>
            <Field label="Employee to invite" name="employee_id">
              <Select name="employee_id" id="employee_id" required>
                <option value="">Choose an employee without an account</option>
                {meta.candidates
                  .filter((c) => !data.accounts.some((a) => a.employee_id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.email}
                    </option>
                  ))}
              </Select>
            </Field>
            <p className="rounded-lg bg-teal-50 p-3 text-xs leading-relaxed text-teal-900">
              The invitation goes to the work email on their employee record. Activation grants
              self-service access. Assign privileged permissions separately.
            </p>
          </>
        )}
        {(dialog === "role" || dialog === "grant") && (
          <>
            <Field label="Account" name="user_id">
              <Select name="user_id" id="user_id" required defaultValue={selectedAccount}>
                <option value="">Choose an account</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountName(a.id)}
                  </option>
                ))}
              </Select>
            </Field>
            {dialog === "role" ? (
              <>
                <Field label="Role template" name="role">
                  <Select
                    name="role"
                    id="role"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setScope(roleTemplates[e.target.value].scope);
                    }}
                  >
                    {Object.keys(roleTemplates).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                  {roleTemplates[role]?.note}
                  <span className="mt-1 block">
                    {roleTemplates[role]?.permissions.length} additional permissions.
                  </span>
                </p>
              </>
            ) : (
              <Field label="Explicit permission" name="permission">
                <Select name="permission" id="permission" required>
                  {Object.entries(permissionLabels).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Access scope" name="scope">
              <Select
                name="scope"
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                {[
                  ["own", "Own records"],
                  ["direct_reports", "Direct reports"],
                  ["team", "Assigned team"],
                  ["department", "Assigned department"],
                  ["company", "Company-wide"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {scope === "department" && (
              <Field label="Assigned department" name="department_id">
                <Select name="department_id" id="department_id" required>
                  {departmentOptions}
                </Select>
              </Field>
            )}
            {scope === "team" && (
              <Field label="Assigned team" name="team_id">
                <Select name="team_id" id="team_id" required>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
      </ActionDialog>
      <ActionDialog
        open={!!revoke}
        onOpenChange={(v) => {
          if (!v) setRevoke(null);
        }}
        title="Remove this access?"
        description="The change takes effect on the next request, including for active sessions."
        submitLabel="Revoke access"
        onSubmit={() => act("revoke-grant", { id: revoke?.id, is_role: revoke?.is_role })}
      >
        <p className="text-sm font-medium">{revoke?.label}</p>
        {revoke?.is_role && (
          <p className="text-xs text-muted-foreground">
            All permission grants created by this role assignment will be removed.
          </p>
        )}
      </ActionDialog>
      <ActionDialog
        open={!!status}
        onOpenChange={(v) => {
          if (!v) setStatus(null);
        }}
        title={`${status?.status === "active" ? "Reactivate" : status?.status === "suspended" ? "Suspend" : "Deactivate"} account`}
        description="Active sessions will be revoked. The employee must sign in again if access is restored."
        submitLabel="Update account access"
        onSubmit={() => act("account-status", { user_id: status?.id, status: status?.status })}
      >
        <p className="text-sm">
          Update account access for <strong>{status?.name}</strong>.
        </p>
      </ActionDialog>
      <Dialog open={matrix} onOpenChange={setMatrix}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Permission templates, clearly defined</DialogTitle>
            <DialogDescription>
              Every employee has self-service access to their own profile, attendance, leave,
              published payslips, documents, tasks, training, and announcements. These templates add
              explicit permissions only when assigned.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-3 overflow-auto pr-1">
            {Object.entries(roleTemplates).map(([name, t]) => (
              <div key={name} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{name}</h3>
                  <Badge>{t.scope.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.note}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.permissions.length ? (
                    t.permissions.map((p) => (
                      <Badge key={p} tone="teal">
                        {permissionLabels[p] || p}
                      </Badge>
                    ))
                  ) : (
                    <Badge>Self-service only</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
