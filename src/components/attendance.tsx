"use client";
import { can } from "@/lib/permissions";
import type { Attendance as AttendanceRecord, Correction } from "@/lib/types";
import { companyDate, dateLabel } from "@/lib/utils";
import { fromZonedTime } from "date-fns-tz";
import { CalendarDays, Clock3, History, MapPin, PencilLine, Plus, Sunrise } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Avatar,
  Card,
  CardHeading,
  EmptyState,
  Field,
  PageHeading,
  Select,
  StatusBadge,
  Textarea,
} from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Attendance() {
  const { data, act } = useWorkspace();
  const me = data.viewer.employee_id;
  const [tab, setTab] = useState("mine");
  const [shift, setShift] = useState(false);
  const [correction, setCorrection] = useState<AttendanceRecord | null>(null);
  const [decision, setDecision] = useState<Correction | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const own = data.attendance.filter((a) => a.employee_id === me);
  const open = own.find((a) => a.clock_in && !a.clock_out);
  const today = own.find((a) => a.work_date === companyDate(data.organization.timezone));
  const records = (tab === "team" ? [...data.attendance] : own).sort((a, b) =>
    b.work_date.localeCompare(a.work_date),
  );
  const schedules = data.schedules
    .filter((s) => s.employee_id === me && s.work_date >= companyDate(data.organization.timezone))
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString("en", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: data.organization.timezone,
        })
      : "—";
  const hours = own
    .filter((a) => a.clock_in && a.clock_out)
    .reduce(
      (n, a) => n + (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3600000,
      0,
    );
  async function clock() {
    setBusy(true);
    await act("clock", { direction: open ? "out" : "in" });
    setBusy(false);
  }
  return (
    <div className="page-enter">
      <PageHeading
        title="A good day starts here."
        description="Your hours, schedules, and everyday rhythm, in one place."
      >
        {can(data.viewer, "schedules.manage") && (
          <Button variant="outline" onClick={() => setShift(true)}>
            <Plus />
            Assign a shift
          </Button>
        )}
        <Button disabled={busy || !!today?.clock_out} onClick={clock}>
          <Clock3 />
          {busy ? "Saving…" : open ? "Clock out" : today?.clock_out ? "Day completed" : "Clock in"}
        </Button>
      </PageHeading>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sunrise className="size-4 text-primary" />
            Today’s check-in
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {time(today?.clock_in || null)}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {open
              ? "You’re on the clock"
              : today?.clock_out
                ? "Your day is complete"
                : "Ready when you are"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-4 text-blue-500" />
            Recorded hours
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {hours.toFixed(1)}{" "}
            <span className="text-sm font-normal text-muted-foreground">hrs</span>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Across your loaded attendance history
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <PencilLine className="size-4 text-amber-600" />
            Pending corrections
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {data.corrections.filter((c) => c.employee_id === me && c.status === "Pending").length}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Waiting for your assigned reviewer
          </p>
        </Card>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_285px]">
        <Card className="overflow-hidden">
          <div className="flex overflow-x-auto px-5">
            {[
              ["mine", "My attendance"],
              ...(can(data.viewer, "attendance.read") ? [["team", "Team attendance"]] : []),
              ["corrections", "Corrections"],
            ].map(([v, label]) => (
              <button
                key={v}
                className="tab-button pt-5"
                data-active={tab === v}
                aria-pressed={tab === v}
                onClick={() => {
                  setTab(v);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "corrections" ? (
            <div>
              {data.corrections.length ? (
                <div className="divide-y divide-border border-t border-border">
                  {data.corrections.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-5"
                    >
                      <div>
                        <p className="text-xs font-semibold">
                          {data.employees.find((e) => e.id === c.employee_id)?.full_name ||
                            "Employee"}
                        </p>
                        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{c.reason}</p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Requested: {time(c.requested_in)} – {time(c.requested_out)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.status === "Pending" &&
                          c.employee_id !== me &&
                          c.approver_id === me &&
                          can(
                            data.viewer,
                            "attendance.manage",
                            data.employees.find((e) => e.id === c.employee_id),
                          ) && (
                            <Button size="sm" variant="outline" onClick={() => setDecision(c)}>
                              Review
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Everything looks in order"
                  description="If a time needs updating, request a correction from your attendance history."
                />
              )}
            </div>
          ) : records.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {tab === "team" && <th scope="col">Employee</th>}
                      <th scope="col">Date</th>
                      <th scope="col">Clock in</th>
                      <th scope="col">Clock out</th>
                      <th scope="col">Hours</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Correction</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice((page - 1) * 8, page * 8).map((a) => (
                      <tr key={a.id}>
                        {tab === "team" && (
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar
                                size="sm"
                                name={
                                  data.employees.find((e) => e.id === a.employee_id)?.full_name ||
                                  "Employee"
                                }
                              />
                              <span className="text-[11px]">
                                {data.employees.find((e) => e.id === a.employee_id)?.full_name ||
                                  "Employee"}
                              </span>
                            </div>
                          </td>
                        )}
                        <td>
                          <p className="text-[11px] font-medium">
                            {dateLabel(a.work_date, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          {a.note && (
                            <p className="mt-1 text-[9px] text-muted-foreground">{a.note}</p>
                          )}
                        </td>
                        <td className="text-[11px]">{time(a.clock_in)}</td>
                        <td className="text-[11px]">{time(a.clock_out)}</td>
                        <td className="text-[11px] text-muted-foreground">
                          {a.clock_in && a.clock_out
                            ? `${((new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000).toFixed(1)}h`
                            : "—"}
                        </td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                        <td>
                          {a.employee_id === me && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Request correction for ${a.work_date}`}
                              onClick={() => setCorrection(a)}
                            >
                              <PencilLine className="!size-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-4">
                <p className="text-[10px] text-muted-foreground">
                  Page {page} of {Math.max(1, Math.ceil(records.length / 8))}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page * 8 >= records.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title="Your attendance starts here"
              description="Clock in when your workday begins. Your history will appear here."
            />
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeading title="Your upcoming shifts" />
            <div className="space-y-4 px-5 pb-5">
              {schedules.length ? (
                schedules.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex gap-3 border-t border-border pt-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-primary">
                      <CalendarDays className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">
                        {dateLabel(s.work_date, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="mt-1 text-[11px]">
                        {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="size-2.5" />
                        {s.location}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  No upcoming shifts assigned. Your manager can add a schedule here.
                </p>
              )}
            </div>
          </Card>
          <div className="rounded-xl border border-dashed border-border p-5">
            <History className="mb-3 size-5 text-primary" />
            <h2 className="text-xs font-semibold">A time doesn’t look right?</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Select the edit icon beside your attendance entry. Approved corrections keep a history
              of the original and updated times.
            </p>
          </div>
        </div>
      </div>
      <ActionDialog
        open={shift}
        onOpenChange={setShift}
        title="Assign a shift"
        description="The employee will be notified of their updated schedule."
        submitLabel="Assign shift"
        onSubmit={(f) => act("schedule", Object.fromEntries(f))}
      >
        <Field label="Employee" name="employee_id">
          <Select name="employee_id" id="employee_id">
            {data.employees
              .filter((e) => can(data.viewer, "schedules.manage", e))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label="Work date"
          name="work_date"
          type="date"
          required
          defaultValue={companyDate(data.organization.timezone)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Shift starts" name="start_time" type="time" required defaultValue="09:00" />
          <Field label="Shift ends" name="end_time" type="time" required defaultValue="18:00" />
        </div>
        <Field label="Location" name="location" required defaultValue="Manila office" />
      </ActionDialog>
      <ActionDialog
        open={!!correction}
        onOpenChange={(v) => {
          if (!v) setCorrection(null);
        }}
        title="Request a time correction"
        description={
          correction
            ? `For ${dateLabel(correction.work_date)}. Your original entry stays in the change history.`
            : ""
        }
        submitLabel="Submit correction"
        onSubmit={(f) =>
          act("correction", {
            attendance_id: correction?.id,
            requested_in: fromZonedTime(
              `${correction?.work_date}T${f.get("clock_in")}:00`,
              data.organization.timezone,
            ).toISOString(),
            requested_out: f.get("clock_out")
              ? fromZonedTime(
                  `${correction?.work_date}T${f.get("clock_out")}:00`,
                  data.organization.timezone,
                ).toISOString()
              : null,
            reason: f.get("reason"),
          })
        }
      >
        <p className="text-xs text-muted-foreground">
          Enter times in the company timezone ({data.organization.timezone}).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Correct clock-in time" name="clock_in" type="time" required />
          <Field label="Correct clock-out time" name="clock_out" type="time" />
        </div>
        <Field label="What happened?" name="reason">
          <Textarea
            id="reason"
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            placeholder="Explain why the time needs changing…"
          />
        </Field>
      </ActionDialog>
      <ActionDialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v) setDecision(null);
        }}
        title="Review attendance correction"
        description={decision?.reason || ""}
        submitLabel="Confirm decision"
        onSubmit={(f) =>
          act("decide-correction", {
            id: decision?.id,
            decision: f.get("decision"),
            note: f.get("note"),
          })
        }
      >
        <Field label="Decision" name="decision">
          <Select id="decision" name="decision">
            <option>Approved</option>
            <option>Rejected</option>
          </Select>
        </Field>
        <Field label="Note to employee" name="note">
          <Textarea id="note" name="note" maxLength={1000} />
        </Field>
      </ActionDialog>
    </div>
  );
}
