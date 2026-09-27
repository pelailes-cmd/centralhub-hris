"use client";
import type { Candidate } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { ArrowUpRight, Plus, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeading,
  Select,
  Textarea,
} from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";
const stages = ["Applied", "Screening", "Interview", "Offer", "Hired", "Not proceeding"];
export function Recruitment() {
  const { data, act } = useWorkspace();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Candidate | undefined>();
  const rows = data.candidates.filter(
    (c) =>
      (!stage || c.stage === stage) &&
      `${c.full_name} ${c.position_title} ${c.email}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <PageHeading
        title="Good teams start with a hello."
        description="Keep candidate conversations moving and give new teammates a thoughtful start."
      >
        <Button
          onClick={() => {
            setEdit(undefined);
            setOpen(true);
          }}
        >
          <Plus />
          Add candidate
        </Button>
      </PageHeading>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {["Applied", "Screening", "Interview", "Offer"].map((s) => (
          <Card key={s} className="p-5">
            <p className="text-xs text-muted-foreground">{s}</p>
            <p className="mt-3 text-2xl font-semibold">
              {data.candidates.filter((c) => c.stage === s).length}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-3 p-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <Input
              aria-label="Search candidates"
              placeholder="Search candidates or positions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter recruitment stage"
            className="w-auto"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {rows.length ? (
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Position</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Added</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.full_name} color="blue" />
                        <div>
                          <p className="text-xs font-semibold">{c.full_name}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs">{c.position_title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {data.departments.find((d) => d.id === c.department_id)?.name}
                      </p>
                    </td>
                    <td>
                      <Badge
                        tone={
                          c.stage === "Hired"
                            ? "teal"
                            : c.stage === "Interview"
                              ? "blue"
                              : "neutral"
                        }
                      >
                        {c.stage}
                      </Badge>
                    </td>
                    <td className="text-[10px] text-muted-foreground">{dateLabel(c.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEdit(c);
                            setOpen(true);
                          }}
                        >
                          View & update
                        </Button>
                        {c.hired_employee_id && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/employees/${c.hired_employee_id}`}>
                              Employee profile
                              <ArrowUpRight />
                            </Link>
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
            title="Meet your next great teammate"
            description="Add a candidate to track their position, hiring stage, and interview notes."
          />
        )}
      </Card>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-5">
        <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          When a candidate joins, link the employee profile created by your HR team. CentralHub
          assigns a first-week onboarding task and notifies your new teammate.
        </p>
      </div>
      {open && (
        <ActionDialog
          open={open}
          onOpenChange={setOpen}
          title={edit ? "Keep the conversation moving" : "Meet a new candidate"}
          description="Candidate records are available only to recruitment personnel within the assigned department scope."
          submitLabel="Save candidate"
          onSubmit={(f) =>
            act("candidate", {
              ...Object.fromEntries(f),
              id: edit?.id,
              hired_employee_id: f.get("hired_employee_id") || null,
            })
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Full name"
              name="full_name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={edit?.full_name}
            />
            <Field
              label="Contact email"
              name="email"
              type="email"
              required
              defaultValue={edit?.email}
            />
          </div>
          <Field
            label="Position"
            name="position_title"
            required
            minLength={2}
            maxLength={100}
            defaultValue={edit?.position_title}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hiring department" name="department_id">
              <Select
                name="department_id"
                id="department_id"
                required
                defaultValue={edit?.department_id}
              >
                {data.departments
                  .filter((d) =>
                    data.viewer.grants.some(
                      (g) =>
                        g.permission === "recruitment.manage" &&
                        (g.scope === "company" || g.department_id === d.id),
                    ),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Hiring stage" name="stage">
              <Select name="stage" id="stage" defaultValue={edit?.stage || "Applied"}>
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Interview / process notes" name="notes">
            <Textarea name="notes" id="notes" maxLength={3000} defaultValue={edit?.notes || ""} />
          </Field>
          <Field label="Employee profile, once hired (optional)" name="hired_employee_id">
            <Select
              name="hired_employee_id"
              id="hired_employee_id"
              defaultValue={edit?.hired_employee_id || ""}
            >
              <option value="">Not linked yet</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </ActionDialog>
      )}
    </div>
  );
}
