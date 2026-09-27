"use client";
import { can } from "@/lib/permissions";
import type { Employee } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Camera,
  Download,
  Fingerprint,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SensitiveRecord } from "./sensitive-record";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Field,
  FormError,
  PageHeading,
  StatusBadge,
  SubmitButton,
} from "./ui/shared";
import { EmployeeDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function PersonalForm({
  employeeId,
  readOnly = false,
}: {
  employeeId: string;
  readOnly?: boolean;
}) {
  const { act } = useWorkspace();
  const [personal, setPersonal] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    act("personal-read", { employee_id: employeeId }).then((r) => {
      if (active) {
        if (r.ok) setPersonal((r.data || {}) as Record<string, string>);
        else setError(r.message);
      }
    });
    return () => {
      active = false;
    };
  }, [employeeId, act]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly) return;
    setPending(true);
    setError("");
    const r = await act("personal", {
      employee_id: employeeId,
      data: Object.fromEntries(new FormData(e.currentTarget)),
    });
    if (!r.ok) setError(r.message);
    setPending(false);
  }
  if (!personal)
    return (
      <div className="py-5 text-sm text-muted-foreground">
        {error ? (
          <FormError message={error} />
        ) : (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading personal details…
          </span>
        )}
      </div>
    );
  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Personal email"
          name="personal_email"
          type="email"
          maxLength={254}
          readOnly={readOnly}
          defaultValue={personal.personal_email || ""}
        />
        <Field
          label="Home address"
          name="address"
          maxLength={500}
          readOnly={readOnly}
          defaultValue={personal.address || ""}
        />
        <Field
          label="Emergency contact name"
          name="emergency_name"
          maxLength={100}
          readOnly={readOnly}
          defaultValue={personal.emergency_name || ""}
        />
        <Field
          label="Emergency contact phone"
          name="emergency_phone"
          type="tel"
          maxLength={30}
          readOnly={readOnly}
          defaultValue={personal.emergency_phone || ""}
        />
      </div>
      <FormError message={error} />
      <div className="flex justify-end">{!readOnly && <SubmitButton pending={pending} />}</div>
    </form>
  );
}
export function EmployeeProfile({ employee: initial }: { employee: Employee }) {
  const { data, download, act } = useWorkspace();
  const employee = data.employees.find((e) => e.id === initial.id) || initial;
  const [edit, setEdit] = useState(false);
  const [personal, setPersonal] = useState(false);
  const [tab, setTab] = useState("work");
  const [sensitive, setSensitive] = useState<{ category: string; value: unknown } | null>(null);
  const dept = data.departments.find((d) => d.id === employee.department_id);
  const manager = data.employees.find((e) => e.id === employee.manager_id);
  const own = employee.id === data.viewer.employee_id;
  const documents = data.documents.filter((d) => d.employee_id === employee.id);
  const attendance = data.attendance.filter((a) => a.employee_id === employee.id);
  const leaves = data.leaves.filter((l) => l.employee_id === employee.id);
  const details = [
    [BriefcaseBusiness, "Position", employee.job_title],
    [Building2, "Department", dept?.name || "—"],
    [UserRound, "Reporting manager", manager?.full_name || "Not in your directory"],
    [CalendarDays, "Start date", dateLabel(employee.start_date)],
    [MapPin, "Work location", employee.location],
    [Mail, "Work email", employee.email],
    [Phone, "Work phone", employee.phone || "Not provided"],
    [UserRound, "Job classification", employee.profile_type],
  ];
  async function readSensitive(category: string) {
    const r = await act("sensitive-read", { employee_id: employee.id, category });
    if (r.ok) setSensitive({ category, value: r.data });
  }
  return (
    <div className="page-enter">
      <Link
        href="/employees"
        className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to people
      </Link>
      <Card className="mb-6 overflow-hidden">
        <div className="h-24 border-b border-teal-100 bg-[linear-gradient(120deg,#e4f0ea,#f5f5eb_65%,#eaf0f5)]" />
        <div className="flex flex-wrap items-center justify-between gap-5 px-6 pb-6">
          <div className="flex items-end gap-5">
            <div className="-mt-9 rounded-full bg-white p-1.5">
              <Avatar
                name={employee.full_name}
                color={employee.avatar_color}
                size="xl"
                photoId={employee.photo_path ? employee.id : undefined}
              />
            </div>
            <div className="pb-1 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[23px] font-semibold tracking-tight">{employee.full_name}</h1>
                <StatusBadge status={employee.employment_status} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {employee.job_title} · {dept?.name}
              </p>
              <p className="mt-2 text-[10px] text-slate-400">{employee.employee_number}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            {(own || can(data.viewer, "private.read", employee)) && (
              <Button variant="outline" onClick={() => setPersonal(true)}>
                <LockKeyhole />
                Personal information
              </Button>
            )}
            {can(data.viewer, "employees.manage", employee) && (
              <Button onClick={() => setEdit(true)}>
                <PencilLine />
                Edit profile
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex overflow-auto border-b border-border px-5">
          {[
            ["work", "Work profile"],
            ...(can(data.viewer, "attendance.read", employee)
              ? [["attendance", "Attendance"]]
              : []),
            ...(can(data.viewer, "leave.read", employee) ? [["leave", "Time off"]] : []),
            ...(can(data.viewer, "documents.read", employee) ? [["documents", "Documents"]] : []),
          ].map(([v, l]) => (
            <button
              key={v}
              className="tab-button pt-5"
              data-active={tab === v}
              aria-pressed={tab === v}
              onClick={() => setTab(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "work" ? (
          <div className="grid gap-7 p-6 sm:grid-cols-2 xl:grid-cols-3">
            {details.map(([Icon, label, value]) => {
              const I = Icon as typeof Mail;
              return (
                <div key={String(label)} className="flex gap-3">
                  <span className="mt-0.5 text-slate-400">
                    <I className="size-4" />
                  </span>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{String(label)}</p>
                    <p className="mt-2 break-words text-xs font-medium">{String(value)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : tab === "attendance" ? (
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Clock in</th>
                  <th scope="col">Clock out</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <td>{dateLabel(a.work_date)}</td>
                    <td>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : "—"}</td>
                    <td>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : "—"}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!attendance.length && (
              <EmptyState
                title="No attendance records yet"
                description="Recorded hours will appear here."
              />
            )}
          </div>
        ) : tab === "leave" ? (
          <div className="divide-y divide-border p-5">
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-medium">
                    {data.leaveTypes.find((t) => t.id === l.leave_type_id)?.name}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {dateLabel(l.start_date)} – {dateLabel(l.end_date)} · {l.days} days
                  </p>
                </div>
                <StatusBadge status={l.status} />
              </div>
            ))}
            {!leaves.length && (
              <EmptyState
                title="No leave requests yet"
                description="Submitted requests and their status will appear here."
              />
            )}
          </div>
        ) : (
          <div className="divide-y divide-border p-5">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-4">
                <p className="text-xs font-medium">{d.title}</p>
                <Button variant="outline" size="sm" onClick={() => download("document", d.id)}>
                  <Download />
                  Download
                </Button>
              </div>
            ))}
            {!documents.length && (
              <EmptyState
                title="No employee files to show"
                description="Files you’re authorized to view will appear here."
              />
            )}
          </div>
        )}
      </Card>
      {["bank", "government", "medical", "disciplinary", "identity"].some((c) =>
        can(data.viewer, `sensitive.${c}.read`, employee),
      ) && (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Restricted records</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Access to each category is separately authorized and recorded in the audit history.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["bank", "government", "medical", "disciplinary", "identity"]
              .filter((c) => can(data.viewer, `sensitive.${c}.read`, employee))
              .map((c) => (
                <Button key={c} variant="outline" size="sm" onClick={() => readSensitive(c)}>
                  <LockKeyhole />
                  {c[0].toUpperCase() + c.slice(1)}
                </Button>
              ))}
          </div>
        </Card>
      )}
      {edit && <EmployeeDialog open={edit} onOpenChange={setEdit} employee={employee} />}
      <Dialog open={personal} onOpenChange={setPersonal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Personal information</DialogTitle>
            <DialogDescription>
              Private details for {employee.full_name}. Viewing and editing this information is
              audited.
            </DialogDescription>
          </DialogHeader>
          {personal && (
            <PersonalForm
              employeeId={employee.id}
              readOnly={!own && !can(data.viewer, "private.write", employee)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!sensitive}
        onOpenChange={(v) => {
          if (!v) setSensitive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restricted {sensitive?.category} record</DialogTitle>
            <DialogDescription>
              This access has been recorded. Share this information only through approved company
              processes.
            </DialogDescription>
          </DialogHeader>
          {sensitive && (
            <SensitiveRecord
              employeeId={employee.id}
              category={sensitive.category}
              value={sensitive.value}
              editable={can(data.viewer, `sensitive.${sensitive.category}.write`, employee)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function DemoEmployeeProfile({ id }: { id: string }) {
  const { data } = useWorkspace();
  const employee = data.employees.find((e) => e.id === id);
  return employee ? (
    <EmployeeProfile employee={employee} />
  ) : (
    <EmptyState
      title="Employee not available"
      description="This record is not in the current development preview."
    />
  );
}
export function Settings() {
  const { data, refresh } = useWorkspace();
  const router = useRouter();
  const [tab, setTab] = useState("personal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const employee = data.employees.find((e) => e.id === data.viewer.employee_id);
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-password",
          ...Object.fromEntries(new FormData(e.currentTarget)),
        }),
      });
      const r = await response.json();
      if (!r.ok) throw new Error(r.message);
      toast.success(r.message);
      router.push(r.redirect);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update password.");
    } finally {
      setPending(false);
    }
  }
  async function photo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (data.isDemo) {
      toast.info("Connect Supabase to save a profile photo.");
      return;
    }
    const f = new FormData();
    f.set("file", file);
    f.set("employee_id", data.viewer.employee_id);
    setPending(true);
    try {
      const response = await fetch("/api/avatars", { method: "POST", body: f });
      const r = await response.json();
      if (!r.ok) throw new Error(r.message);
      toast.success("Profile photo updated.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="page-enter">
      <PageHeading
        title="A space that’s yours."
        description="Keep your personal details current and your account secure."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <Card className="p-6 text-center">
          <Avatar
            name={data.viewer.name}
            color={employee?.avatar_color}
            size="xl"
            photoId={employee?.photo_path ? employee.id : undefined}
          />
          <h2 className="mt-4 text-lg font-semibold">{data.viewer.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data.viewer.job_title}</p>
          <p className="mt-3 break-all text-[11px] text-muted-foreground">{data.viewer.email}</p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium focus-within:ring-3 focus-within:ring-primary/30">
            <Camera className="size-3.5" />
            {pending ? "Uploading…" : "Change photo"}
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Change profile photo"
              onChange={photo}
              disabled={pending}
            />
          </label>
          <div className="mt-6 border-t border-border pt-5 text-left">
            <p className="eyebrow mb-3">Your assigned roles</p>
            <div className="flex flex-wrap gap-2">
              {data.viewer.roles.length ? (
                data.viewer.roles.map((r) => (
                  <Badge key={r} tone="teal">
                    {r}
                  </Badge>
                ))
              ) : (
                <Badge>Employee self-service</Badge>
              )}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
              Role and scope changes are managed by an authorized administrator.
            </p>
          </div>
        </Card>
        <Card>
          <div className="flex border-b border-border px-5">
            {[
              ["personal", "Personal information"],
              ["security", "Account security"],
            ].map(([v, l]) => (
              <button
                key={v}
                className="tab-button pt-5"
                data-active={tab === v}
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="p-6">
            {tab === "personal" ? (
              <>
                <h2 className="mb-2 text-sm font-semibold">The details that matter</h2>
                <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
                  Your home address and emergency contacts are private. Work details can be updated
                  by your authorized HR team.
                </p>
                <PersonalForm employeeId={data.viewer.employee_id} />
              </>
            ) : (
              <div className="space-y-7">
                <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <Fingerprint className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="text-xs font-semibold">Multi-factor authentication</h2>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {data.viewer.mfa_required
                        ? "Required for your assigned permissions. Your session is verified."
                        : "Add an authenticator app for another layer of protection."}
                    </p>
                    {!data.isDemo && (
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href="/mfa">Set up or verify authenticator</Link>
                      </Button>
                    )}
                  </div>
                </div>
                <form onSubmit={password} className="space-y-4">
                  <h2 className="text-sm font-semibold">Change your password</h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use at least 12 characters. Changing your password signs you out on all devices.
                  </p>
                  <Field
                    label="Current password"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                  />
                  <Field
                    label="New password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                  <Field
                    label="Confirm new password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                  <FormError message={error} />
                  <SubmitButton pending={pending}>Change password</SubmitButton>
                </form>
                <p className="flex items-center gap-2 border-t border-border pt-4 text-[10px] text-muted-foreground">
                  <ShieldCheck className="size-3.5" />
                  Sessions expire after 8 hours. Account suspension ends active access immediately.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
