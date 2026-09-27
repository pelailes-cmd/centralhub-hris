"use client";
import { can } from "@/lib/permissions";
import type { LeaveRequest } from "@/lib/types";
import { companyDate, dateLabel, localDate } from "@/lib/utils";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Heart,
  Plus,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Avatar,
  Card,
  CardHeading,
  EmptyState,
  PageHeading,
  Select,
  StatusBadge,
} from "./ui/shared";
import { ActionDialog, LeaveDecisionDialog, LeaveDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Leave() {
  const { data, act } = useWorkspace();
  const me = data.viewer.employee_id;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("mine");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<LeaveRequest | null>(null);
  const [cancel, setCancel] = useState<LeaveRequest | null>(null);
  const [month, setMonth] = useState(
    () => new Date(`${companyDate(data.organization.timezone).slice(0, 7)}-01T12:00:00`),
  );
  const [page, setPage] = useState(1);
  const balance = data.leaveBalances.filter((b) => b.employee_id === me);
  const records = data.leaves.filter(
    (l) => (tab === "team" || l.employee_id === me) && (!status || l.status === status),
  );
  const icons = [CalendarDays, Heart, Coffee, Sparkles];
  const offset = (month.getDay() + 6) % 7;
  const monthDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <div className="page-enter">
      <PageHeading
        title="Make room for life."
        description="A little rest, a big adventure, or time for what matters. Plan it here."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Request time off
        </Button>
      </PageHeading>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {data.leaveTypes.map((t, i) => {
          const b = balance.find((b) => b.leave_type_id === t.id);
          const Icon = icons[i % 4];
          const available = b ? b.allowance - b.used - b.pending : 0;
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">{t.name}</p>
                <span
                  className={`badge-${t.color} flex size-8 items-center justify-center rounded-lg`}
                >
                  <Icon className="size-4" />
                </span>
              </div>
              <p className="mt-4 text-[30px] font-semibold tracking-tight">
                {available}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">days left</span>
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#7bbbad]"
                  style={{
                    width: `${b ? Math.min(100, (available / Math.max(1, b.allowance)) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="mt-2.5 text-[10px] text-muted-foreground">
                {b?.used || 0} used · {b?.pending || 0} pending · {b?.allowance || 0} total
              </p>
            </Card>
          );
        })}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5">
            <div className="flex">
              {[
                ["mine", "My requests"],
                ...(can(data.viewer, "leave.read") ? [["team", "Team requests"]] : []),
              ].map(([v, l]) => (
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
                  {l}
                </button>
              ))}
            </div>
            <Select
              aria-label="Filter leave status"
              className="my-3 h-8 w-auto text-[11px]"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["Pending", "Approved", "Rejected", "Cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          {records.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {tab === "team" && <th scope="col">Employee</th>}
                      <th scope="col">Leave type</th>
                      <th scope="col">Dates</th>
                      <th scope="col">Days</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice((page - 1) * 7, page * 7).map((l) => {
                      const e = data.employees.find((e) => e.id === l.employee_id);
                      return (
                        <tr key={l.id}>
                          {tab === "team" && (
                            <td>
                              <div className="flex items-center gap-2">
                                <Avatar
                                  name={e?.full_name || "Employee"}
                                  size="sm"
                                  color={e?.avatar_color}
                                />
                                <span className="text-[11px] font-medium">
                                  {e?.full_name || "Employee"}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="text-[11px] font-medium">
                            {data.leaveTypes.find((t) => t.id === l.leave_type_id)?.name}
                          </td>
                          <td>
                            <p className="text-[10px]">
                              {dateLabel(l.start_date, { month: "short", day: "numeric" })} –{" "}
                              {dateLabel(l.end_date, { month: "short", day: "numeric" })}
                            </p>
                          </td>
                          <td className="text-[11px]">{l.days}</td>
                          <td>
                            <StatusBadge status={l.status} />
                          </td>
                          <td>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setReview(l)}>
                                {l.approver_id === me &&
                                l.employee_id !== me &&
                                l.status === "Pending"
                                  ? "Review"
                                  : "View"}
                              </Button>
                              {l.employee_id === me && l.status === "Pending" && (
                                <Button size="sm" variant="ghost" onClick={() => setCancel(l)}>
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-4">
                <p className="text-[10px] text-muted-foreground">
                  {records.length} request{records.length !== 1 ? "s" : ""}
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
                    disabled={page * 7 >= records.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title="Your next break starts here"
              description="Request time off and follow its progress here."
              action={
                <Button variant="outline" onClick={() => setOpen(true)}>
                  <Plus />
                  Request time off
                </Button>
              }
            />
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeading title="Team calendar" />
            <div className="px-5 pb-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="!size-6"
                    aria-label="Previous month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="!size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="!size-6"
                    aria-label="Next month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="!size-3" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                  <span key={i} className="pb-2 text-[9px] text-slate-400" aria-hidden="true">
                    {day}
                  </span>
                ))}
                {Array.from({ length: Math.ceil((offset + monthDays) / 7) * 7 }, (_, i) => {
                  const num = i - offset + 1;
                  if (num < 1 || num > monthDays) return <span key={i} />;
                  const date = localDate(new Date(month.getFullYear(), month.getMonth(), num));
                  const leaves = data.leaves.filter(
                    (l) =>
                      ["Approved", "Pending"].includes(l.status) &&
                      l.start_date <= date &&
                      l.end_date >= date,
                  );
                  const today = date === companyDate(data.organization.timezone);
                  return (
                    <span
                      key={i}
                      className={`relative flex h-8 items-center justify-center rounded-md text-[10px] ${today ? "bg-primary font-semibold text-white" : leaves.length ? "bg-teal-50 text-primary" : "text-slate-600"}`}
                      title={`${date}${leaves.length ? `: ${leaves.length} leave request(s)` : ""}`}
                    >
                      {num}
                      {leaves.length > 0 && (
                        <span
                          className={`absolute bottom-1 size-1 rounded-full ${today ? "bg-white" : "bg-primary"}`}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                Approved or pending leave in your scope
              </p>
            </div>
          </Card>
          <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/30 p-5">
            <Coffee className="mb-3 size-5 text-primary" />
            <h2 className="text-xs font-semibold">A little planning goes a long way</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Check your team’s schedule before requesting time away. Your balance reserves pending
              days until a decision is made.
            </p>
          </div>
        </div>
      </div>
      <LeaveDialog open={open} onOpenChange={setOpen} />
      <LeaveDecisionDialog
        request={review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
      />
      <ActionDialog
        open={!!cancel}
        onOpenChange={(v) => {
          if (!v) setCancel(null);
        }}
        title="Cancel this request?"
        description="The reserved days will return to your available balance."
        submitLabel="Cancel request"
        onSubmit={() => act("decide-leave", { id: cancel?.id, decision: "Cancelled" })}
      >
        <p className="text-sm text-muted-foreground">
          {cancel &&
            `${dateLabel(cancel.start_date)} – ${dateLabel(cancel.end_date)} · ${cancel.days} working days`}
        </p>
      </ActionDialog>
    </div>
  );
}
