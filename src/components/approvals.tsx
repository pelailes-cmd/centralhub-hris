"use client";
import { can } from "@/lib/permissions";
import type { ExtraRequest, LeaveRequest } from "@/lib/types";
import { dateLabel, money } from "@/lib/utils";
import { ClipboardCheck, Clock3, GitBranch, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Avatar,
  Card,
  EmptyState,
  Field,
  PageHeading,
  Select,
  StatusBadge,
  Textarea,
} from "./ui/shared";
import { ActionDialog, LeaveDecisionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Approvals() {
  const { data, act } = useWorkspace();
  const me = data.viewer.employee_id;
  const [tab, setTab] = useState("leave");
  const [state, setState] = useState("Pending");
  const [review, setReview] = useState<LeaveRequest | null>(null);
  const [create, setCreate] = useState("");
  const [decide, setDecide] = useState<(ExtraRequest & { kind: string }) | null>(null);
  const [recommend, setRecommend] = useState<{ id: string; type: string } | null>(null);
  const canRecommend = (employeeId: string) =>
    employeeId !== me &&
    can(
      data.viewer,
      "requests.recommend",
      data.employees.find((e) => e.id === employeeId),
    );
  const leave = data.leaves.filter(
    (l) =>
      (l.employee_id === me ||
        l.approver_id === me ||
        l.delegate_id === me ||
        canRecommend(l.employee_id)) &&
      (!state || l.status === state),
  );
  const extra = (tab === "overtime" ? data.overtime : data.planning).filter(
    (r) => !state || r.status === state,
  );
  const pending = data.leaves.filter(
    (l) =>
      l.status === "Pending" &&
      (l.approver_id === me || l.delegate_id === me) &&
      l.employee_id !== me,
  ).length;
  return (
    <div className="page-enter">
      <PageHeading
        title="Keep good things moving."
        description="Clear requests. Thoughtful decisions. A little less waiting."
      >
        <Button variant="outline" onClick={() => setCreate("overtime")}>
          <Clock3 />
          Request overtime
        </Button>
        {can(data.viewer, "planning.manage") && (
          <Button onClick={() => setCreate("planning")}>
            <Plus />
            Headcount request
          </Button>
        )}
      </PageHeading>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Leave requests for your review", value: pending, icon: ClipboardCheck },
          {
            label: "Overtime requests",
            value: data.overtime.filter((r) => r.status === "Pending").length,
            icon: Clock3,
          },
          { label: "Headcount plans", value: data.planning.length, icon: Users },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-5">
            <s.icon className="size-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5">
          <div className="flex">
            {[
              ["leave", "Time off"],
              ["overtime", "Overtime"],
              ...(can(data.viewer, "planning.manage") ? [["planning", "Workforce planning"]] : []),
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
          <Select
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Filter request status"
            className="my-3 h-8 w-auto text-xs"
          >
            <option value="">All statuses</option>
            {["Pending", "Approved", "Rejected", "Cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {tab === "leave" ? (
            leave.length ? (
              leave.map((l) => {
                const e = data.employees.find((e) => e.id === l.employee_id);
                return (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={e?.full_name || "Employee"} color={e?.avatar_color} />
                      <div>
                        <p className="text-xs font-semibold">
                          {e?.full_name || "Employee"}
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {data.leaveTypes.find((t) => t.id === l.leave_type_id)?.name}
                          </span>
                        </p>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {dateLabel(l.start_date)} – {dateLabel(l.end_date)} · {l.days} days
                        </p>
                        {data.recommendations
                          .filter((r) => r.request_id === l.id)
                          .map((r) => (
                            <p key={r.id} className="mt-2 text-[10px] text-primary">
                              {r.recommendation}: {r.note}
                            </p>
                          ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={l.status} />
                      <Button variant="outline" size="sm" onClick={() => setReview(l)}>
                        {l.employee_id === me ? "View request" : "Review"}
                      </Button>
                      {l.status === "Pending" && canRecommend(l.employee_id) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRecommend({ id: l.id, type: "leave" })}
                        >
                          Recommend
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="Your queue is clear"
                description="Requests assigned to you will appear here. Try another status to review previous decisions."
              />
            )
          ) : extra.length ? (
            extra.map((r) => {
              const e = data.employees.find((e) => e.id === r.employee_id);
              const allowed =
                r.status === "Pending" &&
                r.approver_id === me &&
                r.employee_id !== me &&
                can(data.viewer, tab === "planning" ? "planning.manage" : "leave.approve", e);
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={e?.full_name || "Employee"} color={e?.avatar_color} />
                    <div>
                      <p className="text-xs font-semibold">
                        {tab === "planning" ? r.title : e?.full_name || "Employee"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {tab === "planning"
                          ? `${r.headcount} position(s) · ${r.budget ? money(r.budget, data.organization.currency) : "Budget not specified"}`
                          : `${r.work_date && dateLabel(r.work_date)} · ${r.hours} hours`}
                      </p>
                      <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                        {r.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {allowed && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecide({ ...r, kind: tab })}
                      >
                        Review
                      </Button>
                    )}
                    {r.status === "Pending" && canRecommend(r.employee_id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecommend({ id: r.id, type: tab })}
                      >
                        Recommend
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="Nothing waiting here"
              description="Submitted requests will appear with their current status and assigned approver."
            />
          )}
        </div>
      </Card>
      <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <GitBranch className="mt-0.5 size-3.5 shrink-0" />
        Approvals follow explicit assignments and scoped permissions. You cannot approve your own
        request. Supervisor recommendations do not replace the final approval.
      </p>
      <LeaveDecisionDialog
        request={review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
      />
      <ActionDialog
        open={!!create}
        onOpenChange={(v) => {
          if (!v) setCreate("");
        }}
        title={
          create === "planning" ? "Plan for your next teammate" : "Request additional work hours"
        }
        description="Your request follows the configured approval route."
        submitLabel="Submit request"
        onSubmit={(f) => act("extra-request", { kind: create, data: Object.fromEntries(f) })}
      >
        {create === "overtime" ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Work date" name="work_date" type="date" required />
            <Field
              label="Additional hours"
              name="hours"
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              required
            />
          </div>
        ) : (
          <>
            <Field
              label="Position / plan title"
              name="title"
              required
              minLength={3}
              maxLength={200}
            />
            <Field label="Department" name="department_id">
              <Select name="department_id" id="department_id" required>
                {data.departments
                  .filter((d) =>
                    data.viewer.grants.some(
                      (g) =>
                        g.permission === "planning.manage" &&
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
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Additional headcount"
                name="headcount"
                type="number"
                min="1"
                max="1000"
                required
              />
              <Field
                label={`Proposed budget (${data.organization.currency})`}
                name="budget"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
          </>
        )}
        <Field label="Business reason" name="reason">
          <Textarea
            name="reason"
            id="reason"
            minLength={5}
            maxLength={1000}
            required
            placeholder="Explain the need and the expected outcome…"
          />
        </Field>
      </ActionDialog>
      <ActionDialog
        open={!!decide}
        onOpenChange={(v) => {
          if (!v) setDecide(null);
        }}
        title="Review request"
        description={decide?.reason || ""}
        submitLabel="Confirm decision"
        onSubmit={(f) =>
          act("decide-extra", { kind: decide?.kind, id: decide?.id, decision: f.get("decision") })
        }
      >
        <Field label="Decision" name="decision">
          <Select id="decision" name="decision">
            <option>Approved</option>
            <option>Rejected</option>
          </Select>
        </Field>
      </ActionDialog>
      <ActionDialog
        open={!!recommend}
        onOpenChange={(v) => {
          if (!v) setRecommend(null);
        }}
        title="Add your recommendation"
        description="Your input helps the assigned final approver make a decision."
        submitLabel="Save recommendation"
        onSubmit={(f) => act("recommend", { ...recommend, ...Object.fromEntries(f) })}
      >
        <Field label="Recommendation" name="recommendation">
          <Select id="recommendation" name="recommendation">
            <option>Recommended</option>
            <option>Needs discussion</option>
          </Select>
        </Field>
        <Field label="Context for the approver" name="note">
          <Textarea id="note" name="note" required minLength={5} maxLength={1000} />
        </Field>
      </ActionDialog>
    </div>
  );
}
