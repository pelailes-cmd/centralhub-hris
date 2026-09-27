"use client";
import { can } from "@/lib/permissions";
import type { LeaveRequest } from "@/lib/types";
import { companyDate, dateLabel, localDate } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  FileCheck2,
  MapPin,
  Megaphone,
  Plus,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import { Avatar, Badge, Card, CardHeading, EmptyState, PageHeading } from "./ui/shared";
import { EmployeeDialog, LeaveDecisionDialog, LeaveDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Dashboard() {
  const { data, act } = useWorkspace();
  const { viewer } = data;
  const [add, setAdd] = useState(false);
  const [leave, setLeave] = useState(false);
  const [review, setReview] = useState<LeaveRequest | null>(null);
  const [clocking, setClocking] = useState(false);
  const [days, setDays] = useState(7);
  const today = companyDate(data.organization.timezone);
  const scoped = can(viewer, "workforce.summary");
  const todayAttendance = data.attendance.filter((a) => a.work_date === today);
  const pending = data.leaves.filter(
    (l) =>
      l.status === "Pending" &&
      l.employee_id !== viewer.employee_id &&
      (l.approver_id === viewer.employee_id || l.delegate_id === viewer.employee_id),
  );
  const ownPending = data.leaves.filter(
    (l) => l.employee_id === viewer.employee_id && l.status === "Pending",
  );
  const myAttendance = data.attendance.find(
    (a) => a.employee_id === viewer.employee_id && a.work_date === today,
  );
  const openAttendance = data.attendance.find(
    (a) => a.employee_id === viewer.employee_id && a.clock_in && !a.clock_out,
  );
  const tasks = data.tasks.filter((t) => t.employee_id === viewer.employee_id);
  const schedule = data.schedules.find(
    (s) => s.employee_id === viewer.employee_id && s.work_date === today,
  );
  const available = data.leaveBalances
    .filter((b) => b.employee_id === viewer.employee_id)
    .reduce((n, b) => n + b.allowance - b.used - b.pending, 0);
  const stats = [
    {
      label: scoped ? "Total employees" : "Available leave",
      value: scoped ? data.summary.total : available,
      icon: scoped ? Users : CalendarDays,
      foot: scoped
        ? `Across ${data.summary.departments.filter((d) => d.count).length} departments`
        : "Working days remaining",
      tone: "teal",
    },
    {
      label: scoped ? "Checked in today" : "Attendance entries",
      value: scoped
        ? todayAttendance.filter((a) => a.clock_in).length
        : data.attendance.filter((a) => a.employee_id === viewer.employee_id).length,
      icon: Clock3,
      foot: scoped
        ? `${todayAttendance.filter((a) => a.status === "Remote").length} working remotely`
        : "Your recent recorded days",
      tone: "blue",
    },
    {
      label: scoped ? "On leave today" : "My pending requests",
      value: scoped ? data.summary.on_leave : ownPending.length,
      icon: Coffee,
      foot: scoped ? "A little time to recharge" : "Awaiting your approver",
      tone: "amber",
    },
    {
      label: scoped ? "Pending approvals" : "Open tasks",
      value: scoped ? pending.length : tasks.filter((t) => !t.completed).length,
      icon: FileCheck2,
      foot: scoped ? "Waiting for your review" : "A few things to keep moving",
      tone: "violet",
    },
  ];
  const chart = Array.from({ length: days }, (_, i) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - (days - 1 - i));
    const key = localDate(date);
    const records = data.attendance.filter((a) => a.work_date === key);
    return {
      label: date.toLocaleDateString("en", { weekday: "short" }),
      date: key,
      total: records.filter((a) => a.clock_in).length,
      late: records.filter((a) => a.status === "Late").length,
    };
  });
  const max = Math.max(...chart.map((d) => d.total), 5);
  const totalDepartments = data.summary.departments.reduce((n, d) => n + d.count, 0);
  const gradient = data.summary.departments
    .filter((d) => d.count)
    .map((d, index, departments) => {
      const start =
        (departments.slice(0, index).reduce((sum, item) => sum + item.count, 0) /
          Math.max(totalDepartments, 1)) *
        100;
      const end = start + (d.count / Math.max(totalDepartments, 1)) * 100;
      return `${d.color} ${start}% ${end}%`;
    })
    .join(",");
  async function clock() {
    setClocking(true);
    await act("clock", { direction: openAttendance ? "out" : "in" });
    setClocking(false);
  }
  return (
    <div className="page-enter">
      <PageHeading
        title={`Good ${Number(new Intl.DateTimeFormat("en", { timeZone: data.organization.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date())) < 12 ? "morning" : Number(new Intl.DateTimeFormat("en", { timeZone: data.organization.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date())) < 18 ? "afternoon" : "evening"}, ${viewer.name.split(" ")[0]}`}
        description={
          scoped
            ? "A little overview of your people and the day ahead."
            : "Your workday, a little more organized."
        }
      >
        <span className="mr-1 hidden items-center gap-2 text-[11px] text-muted-foreground xl:flex">
          <CalendarDays className="size-3.5" />
          {dateLabel(today, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </span>
        {can(viewer, "employees.manage") ? (
          <Button onClick={() => setAdd(true)}>
            <Plus />
            Add employee
          </Button>
        ) : (
          <Button onClick={() => setLeave(true)}>
            <Plus />
            Request time off
          </Button>
        )}
      </PageHeading>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-5">
        {stats.map((s, i) => (
          <Card key={s.label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
              <span
                className={`badge-${s.tone} flex size-8 shrink-0 items-center justify-center rounded-lg`}
              >
                <s.icon className="size-4" strokeWidth={1.7} />
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[29px] font-semibold leading-none tracking-[-1px]">
                {String(s.value).padStart(2, "0")}
              </p>
              <span className="text-slate-300">
                <ArrowUpRight className="size-4" />
              </span>
            </div>
            <p className="mt-3.5 text-[10px] text-muted-foreground">
              {i === 3 && scoped && pending.length > 0 ? (
                <span className="text-amber-700">{s.foot}</span>
              ) : (
                s.foot
              )}
            </p>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeading
              title="Attendance overview"
              description={
                scoped ? "Recorded check-ins across your scope" : "Your recorded check-ins"
              }
            >
              <select
                aria-label="Attendance chart period"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-[10px] text-muted-foreground"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
              </select>
            </CardHeading>
            <div className="flex items-center gap-4 px-5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-[#248d7f]" />
                On time / remote
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-[#d8b674]" />
                Late check-in
              </span>
            </div>
            <div
              className="relative mx-5 mb-5 mt-5 h-[180px] pl-7"
              role="img"
              aria-label={`Check-ins by day: ${chart.map((d) => `${d.date}: ${d.total} total, ${d.late} late`).join("; ")}`}
            >
              <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pb-6">
                {[
                  max,
                  Math.round(max * 0.75),
                  Math.round(max * 0.5),
                  Math.round(max * 0.25),
                  0,
                ].map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right text-[9px] text-slate-400">{n}</span>
                    <div className="flex-1 border-t border-dashed border-slate-100" />
                  </div>
                ))}
              </div>
              <div className="relative flex h-full justify-around gap-2">
                {chart.map((d, i) => (
                  <div
                    key={d.date}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  >
                    <div
                      className="group relative flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-t-md"
                      style={{ height: `${(d.total / max) * 145}px`, minHeight: d.total ? 4 : 0 }}
                      title={`${d.total} check-ins`}
                    >
                      <div
                        className="bg-[#d8b674]"
                        style={{ height: `${d.total ? (d.late / d.total) * 100 : 0}%` }}
                      />
                      <div
                        className={
                          i === chart.length - 1 ? "flex-1 bg-[#248d7f]" : "flex-1 bg-[#91c9bb]"
                        }
                      />
                    </div>
                    <span className="mt-2.5 h-4 text-[9px] text-slate-400">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-slate-700">
                  {chart.reduce((n, d) => n + d.total, 0)}
                </span>{" "}
                check-ins recorded this period
              </p>
              <Link
                href="/attendance"
                className="flex items-center gap-1 text-[10px] font-medium text-primary"
              >
                View attendance
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </Card>
          <Card>
            <CardHeading
              title={pending.length ? "A few things need your attention" : "Your time off"}
              description={
                pending.length
                  ? "Help your team plan their time away."
                  : "Your requests, all in one place."
              }
            >
              <Link
                href="/leave"
                className="flex items-center gap-1 text-[10px] font-medium text-primary"
              >
                View all
                <ArrowRight className="size-3" />
              </Link>
            </CardHeading>
            {(pending.length ? pending : ownPending).length ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Employee</th>
                      <th scope="col">Request</th>
                      <th scope="col">Duration</th>
                      <th scope="col">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pending.length ? pending : ownPending).slice(0, 3).map((r) => {
                      const e = data.employees.find((e) => e.id === r.employee_id);
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                name={e?.full_name || "Team member"}
                                color={e?.avatar_color}
                                size="sm"
                              />
                              <div>
                                <p className="text-[11px] font-medium">
                                  {e?.full_name || "Team member"}
                                </p>
                                <p className="mt-1 text-[9px] text-muted-foreground">
                                  {data.departments.find((d) => d.id === e?.department_id)?.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <p className="text-[10px]">
                              {data.leaveTypes.find((t) => t.id === r.leave_type_id)?.name}
                            </p>
                            <p className="mt-1 text-[9px] text-muted-foreground">
                              {dateLabel(r.start_date, { month: "short", day: "numeric" })} –{" "}
                              {dateLabel(r.end_date, { month: "short", day: "numeric" })}
                            </p>
                          </td>
                          <td>
                            <span className="text-[10px] text-muted-foreground">
                              {r.days} day{r.days > 1 ? "s" : ""}
                            </span>
                          </td>
                          <td>
                            <Button size="sm" variant="outline" onClick={() => setReview(r)}>
                              {r.employee_id === viewer.employee_id ? "View" : "Review"}
                              <ChevronRight className="!size-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="You’re all caught up"
                description="New requests will appear here when they’re ready for you."
              />
            )}
          </Card>
          <Card>
            <CardHeading title="Around the company" description="The latest news from your people.">
              <Link href="/announcements" className="text-[10px] font-medium text-primary">
                All announcements
              </Link>
            </CardHeading>
            <div className="space-y-0 px-5 pb-2">
              {data.announcements.slice(0, 2).map((a, i) => (
                <Link
                  key={a.id}
                  href="/announcements"
                  className="flex gap-3 border-t border-border py-4"
                >
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${i === 0 ? "bg-[#edf5f1] text-primary" : "bg-[#fbf3e9] text-[#b78c56]"}`}
                  >
                    <Megaphone className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-medium text-primary">{a.category}</span>
                      <span className="text-[9px] text-slate-400">
                        · {dateLabel(a.created_at, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <h3 className="text-xs font-semibold">{a.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {a.body}
                    </p>
                  </div>
                  <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="overflow-hidden border-[#dcece5] bg-gradient-to-br from-[#f0f8f4] to-white">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-[13px] font-semibold">Your workday</h2>
              <Sun className="size-[18px] text-[#cba260]" />
            </div>
            <div className="px-5 pb-5 pt-4">
              <p className="text-[23px] font-semibold tracking-[-.8px]">
                {schedule
                  ? `${schedule.start_time.slice(0, 5)} – ${schedule.end_time.slice(0, 5)}`
                  : "Your day, your pace"}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MapPin className="size-3" />
                {schedule?.location || "No shift assigned for today"}
              </p>
              <div className="my-4 flex items-center gap-2 text-[10px]">
                <span
                  className={`size-1.5 rounded-full ${openAttendance ? "bg-primary" : "bg-slate-300"}`}
                />
                {openAttendance
                  ? `Clocked in at ${new Date(openAttendance.clock_in!).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", timeZone: data.organization.timezone })}`
                  : myAttendance?.clock_out
                    ? "Your workday is complete"
                    : "Ready when you are"}
              </div>
              <Button
                className="w-full"
                disabled={clocking || !!myAttendance?.clock_out}
                onClick={clock}
              >
                <Clock3 />
                {clocking
                  ? "One moment…"
                  : openAttendance
                    ? "Clock out"
                    : myAttendance?.clock_out
                      ? "All done for today"
                      : "Clock in"}
                {!clocking && <ArrowRight className="ml-auto" />}
              </Button>
            </div>
          </Card>
          {scoped && (
            <Card>
              <CardHeading title="Your people, at a glance" />
              <div className="flex items-center justify-center pb-5">
                <div
                  className="donut"
                  style={{ background: gradient ? `conic-gradient(${gradient})` : "#edf2f5" }}
                >
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                    <span className="text-[26px] font-semibold tracking-tight">
                      {totalDepartments}
                    </span>
                    <span className="text-[9px] text-muted-foreground">Teammates</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-5 pb-5">
                {data.summary.departments
                  .filter((d) => d.count)
                  .map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[9px]">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-medium">{d.count}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeading title="On your list">
              <Badge>{tasks.filter((t) => !t.completed).length} to do</Badge>
            </CardHeading>
            <div className="px-5 pb-2">
              {tasks.slice(0, 3).map((t) => (
                <div key={t.id} className="flex gap-2.5 border-t border-border py-3.5">
                  <button
                    aria-label={`${t.completed ? "Reopen" : "Complete"}: ${t.title}`}
                    aria-pressed={t.completed}
                    onClick={() => act("task", { id: t.id, completed: !t.completed })}
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${t.completed ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}
                  >
                    {t.completed && <Check className="size-3" />}
                  </button>
                  <div>
                    <p
                      className={`text-[11px] leading-relaxed ${t.completed ? "text-slate-400 line-through" : "text-slate-700"}`}
                    >
                      {t.title}
                    </p>
                    <p className="mt-1 text-[9px] text-slate-400">
                      Due {dateLabel(t.due_date, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/performance"
              className="flex items-center justify-center gap-1 border-t border-border py-3 text-[10px] font-medium text-primary"
            >
              See all tasks
              <ArrowRight className="size-3" />
            </Link>
          </Card>
          <Card>
            <CardHeading title="Coming up" />
            <div className="space-y-4 px-5 pb-5">
              {data.events.slice(0, 3).map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div className="flex w-9 shrink-0 flex-col items-center rounded-lg border border-border py-1.5">
                    <span className="text-[8px] uppercase text-slate-400">
                      {dateLabel(e.event_date, { month: "short" })}
                    </span>
                    <span className="mt-0.5 text-sm font-semibold">
                      {new Date(e.event_date + "T12:00:00").getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium">{e.title}</p>
                    <p className="mt-1 text-[9px] text-muted-foreground">{e.time_label}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <button
            onClick={() => setLeave(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-4 text-left"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-white text-primary">
              <Sparkles className="size-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold text-primary">
                Need a little time off?
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                You have {available} days available.
              </span>
            </span>
            <ArrowDownRight className="ml-auto size-4 text-primary" />
          </button>
        </div>
      </div>
      {add && <EmployeeDialog open={add} onOpenChange={setAdd} />}
      <LeaveDialog open={leave} onOpenChange={setLeave} />
      <LeaveDecisionDialog
        request={review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
      />
    </div>
  );
}
