"use client";
import { can } from "@/lib/permissions";
import { profileTypes, type Employee, type LeaveRequest } from "@/lib/types";
import { companyDate, dateLabel } from "@/lib/utils";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Avatar, Badge, Field, FormError, Select, SubmitButton, Textarea } from "./ui/shared";
import { useWorkspace } from "./workspace-provider";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel = "Save changes",
  onSubmit,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  submitLabel?: string;
  onSubmit: (form: FormData) => Promise<{ ok: boolean; message: string }>;
  wide?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await onSubmit(new FormData(event.currentTarget));
      if (result.ok) onOpenChange(false);
      else setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please check your entries.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) {
          setError("");
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className={wide ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {children}
          <FormError message={error} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee?: Employee;
}) {
  const { data, act } = useWorkspace();
  const [department, setDepartment] = useState(
    employee?.department_id || data.departments[0]?.id || "",
  );
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={employee ? "Edit employee" : "Add a new teammate"}
      description="Start with their work details. Account invitations and access are managed separately."
      submitLabel={employee ? "Save employee" : "Add employee"}
      onSubmit={async (f) =>
        act("employee", {
          ...Object.fromEntries(f),
          id: employee?.id,
          department_id: department,
          team_id: f.get("team_id") || null,
          manager_id: f.get("manager_id") || null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          name="full_name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={employee?.full_name}
          placeholder="e.g. Alex Rivera"
        />
        <Field
          label="Employee number"
          name="employee_number"
          required
          defaultValue={employee?.employee_number}
          placeholder="e.g. CH-0023"
        />
        <Field
          label="Work email"
          name="email"
          type="email"
          required
          defaultValue={employee?.email}
          placeholder="alex@company.com"
        />
        <Field
          label="Work phone"
          name="phone"
          defaultValue={employee?.phone || ""}
          placeholder="+63 …"
        />
        <Field
          label="Job title"
          name="job_title"
          required
          defaultValue={employee?.job_title}
          placeholder="e.g. Product Designer"
        />
        <Field
          label="Job classification"
          name="profile_type"
          hint="Classification does not grant account permissions."
        >
          <Select
            id="profile_type"
            name="profile_type"
            defaultValue={employee?.profile_type || "Specialist"}
          >
            {profileTypes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Department" name="department_id">
          <Select
            id="department_id"
            name="department_id"
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assigned team" name="team_id">
          <Select
            key={department}
            id="team_id"
            name="team_id"
            defaultValue={employee?.department_id === department ? employee?.team_id || "" : ""}
          >
            <option value="">No team assigned</option>
            {data.teams
              .filter((t) => t.department_id === department)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Reporting manager" name="manager_id">
          <Select id="manager_id" name="manager_id" defaultValue={employee?.manager_id || ""}>
            <option value="">No manager assigned</option>
            {data.employees
              .filter((e) => e.id !== employee?.id && e.employment_status !== "Archived")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label="Start date"
          name="start_date"
          type="date"
          required
          defaultValue={employee?.start_date || companyDate(data.organization.timezone)}
        />
        <Field
          label="Work location"
          name="location"
          required
          defaultValue={employee?.location || "Manila office"}
        />
        <Field label="Employment status" name="employment_status">
          <Select
            id="employment_status"
            name="employment_status"
            defaultValue={employee?.employment_status || "Active"}
          >
            {["Active", "Probation", "On leave", "Archived"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      {employee && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Archiving an employee also deactivates their account and revokes active sessions.
        </p>
      )}
    </ActionDialog>
  );
}
export function LeaveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, act } = useWorkspace();
  const me = data.viewer.employee_id;
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Make time for yourself"
      description="Your request goes to your assigned approver. You’ll be notified when it’s reviewed."
      submitLabel="Request time off"
      onSubmit={(f) => act("leave", Object.fromEntries(f))}
    >
      <Field label="Leave type" name="leave_type_id">
        <Select id="leave_type_id" name="leave_type_id" required>
          {data.leaveTypes.map((t) => {
            const b = data.leaveBalances.find(
              (b) => b.employee_id === me && b.leave_type_id === t.id,
            );
            return (
              <option key={t.id} value={t.id}>
                {t.name} · {b ? b.allowance - b.used - b.pending : 0} days available
              </option>
            );
          })}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="First day"
          name="start_date"
          type="date"
          min={companyDate(data.organization.timezone)}
          required
        />
        <Field
          label="Last day"
          name="end_date"
          type="date"
          min={companyDate(data.organization.timezone)}
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Monday–Friday working days count toward your balance. Company holidays are excluded.
      </p>
      <Field label="Reason" name="reason">
        <Textarea
          id="reason"
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          placeholder="Add a little context for your approver…"
        />
      </Field>
    </ActionDialog>
  );
}
export function LeaveDecisionDialog({
  request,
  onOpenChange,
}: {
  request: LeaveRequest | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, act } = useWorkspace();
  const [decision, setDecision] = useState("Approved");
  if (!request) return null;
  const employee = data.employees.find((e) => e.id === request.employee_id);
  const type = data.leaveTypes.find((t) => t.id === request.leave_type_id);
  const me = data.viewer.employee_id;
  const allowed =
    request.employee_id !== me &&
    (request.approver_id === me || request.delegate_id === me) &&
    can(data.viewer, "leave.approve", employee) &&
    request.status === "Pending";
  return (
    <ActionDialog
      open={!!request}
      onOpenChange={onOpenChange}
      title={allowed ? "Review time off" : "Leave request"}
      description={`${dateLabel(request.start_date)} – ${dateLabel(request.end_date)} · ${request.days} working day${request.days !== 1 ? "s" : ""}`}
      submitLabel={allowed ? "Confirm decision" : "Done"}
      onSubmit={(f) =>
        allowed
          ? act("decide-leave", { id: request.id, decision, note: f.get("note") || "" })
          : Promise.resolve({ ok: true, message: "" })
      }
    >
      <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
        <Avatar name={employee?.full_name || "Team member"} color={employee?.avatar_color} />
        <div>
          <p className="text-sm font-semibold">{employee?.full_name || "Team member"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{type?.name}</p>
        </div>
        <Badge tone="amber" className="ml-auto">
          {request.status}
        </Badge>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium">Reason for leave</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{request.reason}</p>
      </div>
      {allowed ? (
        <>
          <Field label="Your decision" name="decision">
            <Select id="decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="Approved">Approve request</option>
              <option value="Rejected">Decline request</option>
            </Select>
          </Field>
          <Field label="Note to employee (optional)" name="note">
            <Textarea id="note" name="note" maxLength={1000} placeholder="Add a helpful note…" />
          </Field>
        </>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Assigned approver:{" "}
          {data.employees.find((e) => e.id === request.approver_id)?.full_name ||
            "Your designated approver"}
          {request.decision_note && (
            <span className="mt-2 block">Decision note: {request.decision_note}</span>
          )}
        </p>
      )}
    </ActionDialog>
  );
}
