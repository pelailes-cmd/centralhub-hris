"use client";
import { can } from "@/lib/permissions";
import type { Review } from "@/lib/types";
import { companyDate, dateLabel } from "@/lib/utils";
import { ArrowUpRight, Award, BookOpen, Check, Plus, Sprout } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeading,
  Select,
  StatusBadge,
  Textarea,
} from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Performance() {
  const { data, act } = useWorkspace();
  const me = data.viewer.employee_id;
  const [tab, setTab] = useState("reviews");
  const [review, setReview] = useState<Review | null>(null);
  const [assign, setAssign] = useState(false);
  const [kind, setKind] = useState("task");
  const [scope, setScope] = useState("mine");
  const records = data.reviews.filter(
    (r) => scope === "team" || r.employee_id === me || r.reviewer_id === me,
  );
  const tasks = data.tasks.filter((t) => scope === "team" || t.employee_id === me);
  const training = data.training.filter((t) => scope === "team" || t.employee_id === me);
  const mine = data.tasks.filter((t) => t.employee_id === me);
  const complete = mine.filter((t) => t.completed).length;
  return (
    <div className="page-enter">
      <PageHeading
        title="A little better, every day."
        description="Meaningful conversations, new skills, and small steps toward what’s next."
      >
        {can(data.viewer, "performance.manage") && (
          <Button onClick={() => setAssign(true)}>
            <Plus />
            Assign development
          </Button>
        )}
      </PageHeading>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-4 p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-teal-50 text-primary">
            <Sprout className="size-5" />
          </span>
          <div>
            <p className="text-2xl font-semibold">
              {data.reviews.filter((r) => r.employee_id === me && r.status !== "Completed").length}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Growth conversations in progress
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="text-2xl font-semibold">
              {data.training.filter((t) => t.employee_id === me && t.status === "Completed").length}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">Learning milestones completed</p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex justify-between text-xs">
            <span className="font-medium">Your checklist</span>
            <span className="text-muted-foreground">
              {complete} / {mine.length}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#79bba7]"
              style={{ width: `${mine.length ? (complete / mine.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2.5 text-[10px] text-muted-foreground">One small step at a time.</p>
        </Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between border-b border-border px-5">
          <div className="flex overflow-auto">
            {[
              ["reviews", "Growth conversations"],
              ["tasks", "Tasks & onboarding"],
              ["learning", "Learning & certifications"],
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
          {can(data.viewer, "performance.read") && (
            <Select
              aria-label="Development scope"
              className="my-3 h-8 w-auto text-[11px]"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="mine">My development</option>
              <option value="team">Authorized team records</option>
            </Select>
          )}
        </div>
        {tab === "reviews" ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {records.length ? (
              records.map((r) => {
                const employee = data.employees.find((e) => e.id === r.employee_id);
                const reviewer = data.employees.find((e) => e.id === r.reviewer_id);
                return (
                  <article key={r.id} className="rounded-xl border border-border p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-primary">
                        <Sprout className="size-4" />
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <h2 className="mt-4 text-sm font-semibold">{r.cycle}</h2>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {employee?.full_name || "Employee"} · Due {dateLabel(r.due_date)}
                    </p>
                    <div className="my-4 flex items-center gap-2 border-y border-border py-3">
                      <Avatar
                        name={reviewer?.full_name || "Assigned reviewer"}
                        size="sm"
                        color={reviewer?.avatar_color}
                      />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Your reviewer</p>
                        <p className="mt-0.5 text-[11px] font-medium">
                          {reviewer?.full_name || "Assigned reviewer"}
                        </p>
                      </div>
                    </div>
                    {r.feedback && (
                      <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {r.feedback}
                      </p>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setReview(r)}>
                      {r.employee_id === me
                        ? "Share your reflection"
                        : r.reviewer_id === me
                          ? "Write feedback"
                          : "View conversation"}
                      <ArrowUpRight className="!size-3" />
                    </Button>
                  </article>
                );
              })
            ) : (
              <EmptyState
                title="Your next conversation is ahead"
                description="Your assigned reviews and feedback will appear here."
              />
            )}
          </div>
        ) : tab === "tasks" ? (
          <div className="divide-y divide-border px-5">
            {tasks.length ? (
              tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 py-5">
                  <button
                    aria-label={`${t.completed ? "Reopen" : "Complete"}: ${t.title}`}
                    aria-pressed={t.completed}
                    onClick={() => act("task", { id: t.id, completed: !t.completed })}
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${t.completed ? "border-primary bg-primary text-white" : "border-slate-300"}`}
                  >
                    {t.completed && <Check className="size-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold ${t.completed ? "text-muted-foreground line-through" : ""}`}
                    >
                      {t.title}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {scope === "team"
                        ? `${data.employees.find((e) => e.id === t.employee_id)?.full_name || "Employee"} · `
                        : ""}
                      Due {dateLabel(t.due_date)}
                    </p>
                  </div>
                  <Badge>{t.category}</Badge>
                </div>
              ))
            ) : (
              <EmptyState
                title="All set for now"
                description="Work assignments, onboarding steps, and checklists will appear here."
              />
            )}
          </div>
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {training.length ? (
              training.map((t) => (
                <article key={t.id} className="rounded-xl border border-border p-5">
                  <div className="flex justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-[#f2edf8] text-[#9170ac]">
                      {t.category.includes("certification") ? (
                        <Award className="size-5" />
                      ) : (
                        <BookOpen className="size-5" />
                      )}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <Badge className="mt-4">{t.category}</Badge>
                  <h2 className="mt-3 text-sm font-semibold">{t.title}</h2>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {data.employees.find((e) => e.id === t.employee_id)?.full_name || "Employee"}
                    {t.expires_at ? ` · Valid until ${dateLabel(t.expires_at)}` : ""}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {t.employee_id === me &&
                      t.status !== "Completed" &&
                      !t.category.includes("certification") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act("training", { id: t.id })}
                        >
                          <Check className="!size-3" />
                          Mark complete
                        </Button>
                      )}
                    {t.employee_id !== me &&
                      t.status !== "Completed" &&
                      can(
                        data.viewer,
                        "performance.manage",
                        data.employees.find((e) => e.id === t.employee_id),
                      ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act("verify-training", { id: t.id })}
                        >
                          Verify completion
                        </Button>
                      )}
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/documents">
                        Learning materials
                        <ArrowUpRight className="!size-3" />
                      </Link>
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="Room to grow"
                description="Assigned learning plans, safety training, and certifications will appear here."
              />
            )}
          </div>
        )}
      </Card>
      <ActionDialog
        open={!!review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
        title={review?.cycle || "Growth conversation"}
        description="A useful reflection starts with what went well, what challenged you, and what you’d like to try next."
        submitLabel={
          review && (review.employee_id === me || review.reviewer_id === me)
            ? "Save feedback"
            : "Done"
        }
        onSubmit={(f) =>
          review && (review.employee_id === me || review.reviewer_id === me)
            ? act("review", { id: review.id, feedback: f.get("feedback"), rating: f.get("rating") })
            : Promise.resolve({ ok: true, message: "" })
        }
      >
        {review?.employee_feedback && review.employee_id !== me && (
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-2 text-xs font-semibold">Employee reflection</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {review.employee_feedback}
            </p>
          </div>
        )}
        {review?.feedback && (
          <div className="rounded-lg bg-teal-50 p-4">
            <p className="mb-2 text-xs font-semibold text-primary">
              Reviewer feedback{review.rating ? ` · ${review.rating}/5` : ""}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">{review.feedback}</p>
          </div>
        )}
        {review && (review.employee_id === me || review.reviewer_id === me) && (
          <>
            <Field
              label={review.employee_id === me ? "Your reflection" : "Your feedback"}
              name="feedback"
            >
              <Textarea
                id="feedback"
                name="feedback"
                defaultValue={
                  (review.employee_id === me ? review.employee_feedback : review.feedback) || ""
                }
                minLength={5}
                maxLength={5000}
                required
                rows={5}
              />
            </Field>
            {review.reviewer_id === me && (
              <Field label="Overall rating" name="rating">
                <Select id="rating" name="rating" required defaultValue={review.rating || ""}>
                  <option value="">Select a rating</option>
                  {[
                    [1, "Needs support"],
                    [2, "Developing"],
                    [3, "Meets expectations"],
                    [4, "Exceeds expectations"],
                    [5, "Exceptional"],
                  ].map(([n, l]) => (
                    <option value={n} key={n}>
                      {n} · {l}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
      </ActionDialog>
      <ActionDialog
        open={assign}
        onOpenChange={setAssign}
        title="Make space for growth"
        description="Assign a task, learning activity, or review to someone in your scope."
        submitLabel="Assign item"
        onSubmit={(f) => act("development", { kind, data: Object.fromEntries(f) })}
      >
        <Field label="What would you like to assign?" name="kind">
          <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="task">Task or onboarding checklist item</option>
            <option value="training">Learning or certification record</option>
            <option value="review">Growth conversation</option>
          </Select>
        </Field>
        <Field label="Employee" name="employee_id">
          <Select name="employee_id" id="employee_id" required>
            {data.employees
              .filter((e) =>
                can(data.viewer, kind === "task" ? "tasks.manage" : "performance.manage", e),
              )
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
          </Select>
        </Field>
        {kind === "review" ? (
          <>
            <Field
              label="Review cycle"
              name="cycle"
              required
              placeholder="e.g. Q4 growth conversations"
            />
            <Field label="Assigned reviewer" name="reviewer_id">
              <Select id="reviewer_id" name="reviewer_id" required>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Title" name="title" required minLength={3} maxLength={200} />
            <Field label="Category" name="category">
              <Select name="category" id="category">
                {(kind === "task"
                  ? ["Work", "Onboarding", "Development", "Cleaning"]
                  : ["Learning", "Certification", "Safety certification"]
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {kind === "training" ? (
          <Field label="Certification expiry (optional)" name="expires_at" type="date" />
        ) : (
          <Field
            label="Due date"
            name="due_date"
            type="date"
            required
            min={companyDate(data.organization.timezone)}
          />
        )}{" "}
        {kind === "task" && (
          <Field label="Instructions" name="description">
            <Textarea name="description" id="description" maxLength={2000} />
          </Field>
        )}
      </ActionDialog>
    </div>
  );
}
