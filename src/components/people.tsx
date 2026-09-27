"use client";
import { toCsv } from "@/lib/downloads";
import { can } from "@/lib/permissions";
import type { Employee } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeading,
  Select,
  StatusBadge,
} from "./ui/shared";
import { EmployeeDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function People() {
  const { data } = useWorkspace();
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [grid, setGrid] = useState(false);
  const [add, setAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [remote, setRemote] = useState<{
    key: string;
    rows: Employee[];
    count: number;
    error: string;
  }>({ key: "", rows: [], count: 0, error: "" });
  const key = new URLSearchParams({ q, department, status, page: String(page) }).toString();
  useEffect(() => {
    if (data.isDemo) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/employees?${key}`, { signal: controller.signal })
        .then(async (r) => {
          const result = await r.json();
          if (!r.ok) throw new Error(result.message);
          return result;
        })
        .then((r) => setRemote({ key, rows: r.data, count: r.count, error: "" }))
        .catch((e) => {
          if (e.name !== "AbortError") setRemote({ key, rows: [], count: 0, error: e.message });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, data.isDemo]);
  const filtered = data.employees
    .filter(
      (e) =>
        (!q ||
          `${e.full_name} ${e.email} ${e.employee_number} ${e.job_title}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!department || e.department_id === department) &&
        (!status || e.employment_status === status),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const rows = data.isDemo ? filtered.slice((page - 1) * 8, page * 8) : remote.rows;
  const total = data.isDemo ? filtered.length : remote.count;
  const pageCount = Math.max(1, Math.ceil(total / 8));
  const loading = !data.isDemo && remote.key !== key;
  async function exportPeople() {
    setExporting(true);
    try {
      let blob: Blob;
      if (data.isDemo)
        blob = new Blob(
          [
            toCsv([
              ["Employee number", "Name", "Work email", "Job title", "Department", "Status"],
              ...filtered.map((e) => [
                e.employee_number,
                e.full_name,
                e.email,
                e.job_title,
                data.departments.find((d) => d.id === e.department_id)?.name,
                e.employment_status,
              ]),
            ]),
          ],
          { type: "text/csv" },
        );
      else {
        const response = await fetch("/api/exports/employees");
        if (!response.ok) throw new Error("You cannot export these records.");
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "centralhub-people.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Employee directory exported.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="page-enter">
      <PageHeading
        title="Good people. One place."
        description="Get to know your team and keep the essentials up to date."
      >
        <Button variant="outline" disabled={exporting} onClick={exportPeople}>
          <Download />
          {exporting ? "Exporting…" : "Export"}
        </Button>
        {can(data.viewer, "employees.manage") && (
          <Button onClick={() => setAdd(true)}>
            <Plus />
            Add employee
          </Button>
        )}
      </PageHeading>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          {
            label: "People in your directory",
            value: data.employees.filter((e) => e.employment_status !== "Archived").length,
            icon: Users,
          },
          {
            label: "Departments",
            value: new Set(data.employees.map((e) => e.department_id)).size,
            icon: Building2,
          },
          {
            label: "Active teammates",
            value: data.employees.filter((e) =>
              ["Active", "Probation"].includes(e.employment_status),
            ).length,
            icon: UserCheck,
          },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-4 sm:p-5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-slate-500">
              <s.icon className="size-5" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-[22px] font-semibold tracking-tight">{s.value}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5">
          <div className="flex overflow-x-auto">
            {[
              ["", "All people"],
              ["Active", "Active"],
              ["On leave", "On leave"],
              ["Archived", "Archived"],
            ].map(([value, label]) => (
              <button
                key={value}
                className="tab-button pt-5"
                data-active={status === value}
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {label}
                {value === "" && <Badge className="ml-2">{data.employees.length}</Badge>}
              </button>
            ))}
          </div>
          <div className="hidden shrink-0 items-center rounded-md border border-border p-0.5 sm:flex">
            <Button
              size="icon"
              variant={grid ? "ghost" : "soft"}
              className="!size-7"
              aria-label="Table view"
              aria-pressed={!grid}
              onClick={() => setGrid(false)}
            >
              <List className="!size-3.5" />
            </Button>
            <Button
              size="icon"
              variant={grid ? "soft" : "ghost"}
              className="!size-7"
              aria-label="Card view"
              aria-pressed={grid}
              onClick={() => setGrid(true)}
            >
              <LayoutGrid className="!size-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <Input
              aria-label="Search employees"
              placeholder="Search name, email, or employee ID…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter by department"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
            className="w-auto max-w-full"
          >
            <option value="">All departments</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          {(q || department || status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setDepartment("");
                setStatus("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-slate-400 md:flex">
            <SlidersHorizontal className="size-3" />
            {total} results
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-muted-foreground" role="status">
            Finding your people…
          </div>
        ) : remote.error && !data.isDemo ? (
          <EmptyState title="We couldn’t load your directory" description={remote.error} />
        ) : !rows.length ? (
          <EmptyState
            title="No teammates match these filters"
            description="Try a different name, employee number, or department."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  setDepartment("");
                  setStatus("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : grid ? (
          <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((e) => (
              <Link
                href={`/employees/${e.id}`}
                key={e.id}
                className="rounded-xl border border-border p-5 transition hover:border-teal-200 hover:shadow-sm"
              >
                <div className="flex justify-between">
                  <Avatar
                    name={e.full_name}
                    color={e.avatar_color}
                    size="lg"
                    photoId={e.photo_path ? e.id : undefined}
                  />
                  <StatusBadge status={e.employment_status} />
                </div>
                <h2 className="mt-4 text-sm font-semibold">{e.full_name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{e.job_title}</p>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Building2 className="size-3" />
                    {data.departments.find((d) => d.id === e.department_id)?.name}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-3" />
                    {e.location}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="size-3" />
                    {e.email}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">
                Employees in your authorized organizational scope
              </caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Department</th>
                  <th scope="col">Job title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Start date</th>
                  <th scope="col">
                    <span className="sr-only">View profile</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/employees/${e.id}`} className="flex items-center gap-3">
                        <Avatar
                          name={e.full_name}
                          color={e.avatar_color}
                          photoId={e.photo_path ? e.id : undefined}
                        />
                        <div>
                          <p className="font-semibold">{e.full_name}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {e.employee_number} · {e.email}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2 text-[11px]">
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            background: data.departments.find((d) => d.id === e.department_id)
                              ?.color,
                          }}
                        />
                        {data.departments.find((d) => d.id === e.department_id)?.name}
                      </span>
                    </td>
                    <td>
                      <p className="text-[11px]">{e.job_title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{e.location}</p>
                    </td>
                    <td>
                      <StatusBadge status={e.employment_status} />
                    </td>
                    <td className="text-[10px] text-muted-foreground">{dateLabel(e.start_date)}</td>
                    <td>
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/employees/${e.id}`}
                          aria-label={`View ${e.full_name}'s profile`}
                        >
                          <ChevronRight className="!size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[10px] text-muted-foreground">
            Showing {total ? (page - 1) * 8 + 1 : 0}–{Math.min(page * 8, total)} of {total} people
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="!size-3" />
              Previous
            </Button>
            <span className="px-2 text-[10px] text-muted-foreground">
              {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="!size-3" />
            </Button>
          </div>
        </div>
      </Card>
      {add && <EmployeeDialog open={add} onOpenChange={setAdd} />}
    </div>
  );
}
