"use client";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/utils";
import { Megaphone, Pin, Plus, Search } from "lucide-react";
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

export function Announcements() {
  const { data, act } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const posts = data.announcements
    .filter(
      (a) =>
        (!filter || a.category === filter) &&
        `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase()),
    )
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
    );
  return (
    <div className="page-enter">
      <PageHeading
        title="What’s happening around here."
        description="The updates, little wins, and big moments that bring us together."
      >
        {can(data.viewer, "announcements.manage") && (
          <Button onClick={() => setOpen(true)}>
            <Plus />
            New announcement
          </Button>
        )}
      </PageHeading>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {["", "Company news", "People & culture", "Team updates"].map((c) => (
            <Button
              key={c}
              variant={filter === c ? "soft" : "outline"}
              size="sm"
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
            >
              {c || "All updates"}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <Input
            className="pl-9"
            aria-label="Search announcements"
            placeholder="Search updates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          {posts.length ? (
            posts.map((a) => {
              const author = data.employees.find((e) => e.id === a.author_id);
              return (
                <Card key={a.id} className="overflow-hidden">
                  {a.pinned && (
                    <div className="flex items-center gap-2 border-b border-[#e5eee8] bg-[#f4f8f4] px-6 py-2.5 text-[10px] font-medium text-primary">
                      <Pin className="size-3" />
                      Pinned for your attention
                    </div>
                  )}
                  <article className="p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={author?.full_name || "Company team"}
                          color={author?.avatar_color}
                        />
                        <div>
                          <p className="text-xs font-semibold">
                            {author?.full_name || "Company team"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {dateLabel(a.created_at, {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge tone="teal">{a.category}</Badge>
                    </div>
                    <h2 className="mb-4 text-xl font-semibold tracking-[-.5px]">{a.title}</h2>
                    <p className="whitespace-pre-wrap text-[13px] leading-7 text-muted-foreground">
                      {a.body}
                    </p>
                    <p className="mt-6 border-t border-border pt-4 text-[10px] text-muted-foreground">
                      Shared with{" "}
                      {a.department_id
                        ? data.departments.find((d) => d.id === a.department_id)?.name
                        : "everyone at CentralHub"}
                    </p>
                  </article>
                </Card>
              );
            })
          ) : (
            <Card>
              <EmptyState
                title="All quiet for now"
                description="Company announcements will appear here. Try clearing your search if you expected an update."
              />
            </Card>
          )}
        </div>
        <Card className="bg-gradient-to-br from-[#edf5f1] to-white p-6">
          <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-white text-primary">
            <Megaphone className="size-5" />
          </span>
          <h2 className="text-base font-semibold tracking-tight">
            A shared place.
            <br />A stronger team.
          </h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Keep up with what’s new across the company. Important updates are pinned so they’re easy
            to find.
          </p>
          <div className="mt-5 border-t border-teal-100 pt-4">
            <p className="text-[10px] font-medium text-primary">Something worth sharing?</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Send your story to your People & Culture team.
            </p>
          </div>
        </Card>
      </div>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Share something with your people"
        description="Keep it clear, useful, and welcoming."
        submitLabel="Publish announcement"
        onSubmit={(f) =>
          act("announcement", {
            ...Object.fromEntries(f),
            department_id: f.get("department_id") || null,
            pinned: f.get("pinned") === "on",
          })
        }
      >
        <Field
          label="Title"
          name="title"
          required
          minLength={3}
          maxLength={160}
          placeholder="What’s the news?"
        />
        <Field label="Message" name="body">
          <Textarea
            name="body"
            id="body"
            minLength={5}
            maxLength={5000}
            rows={6}
            required
            placeholder="Tell your team what they need to know…"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" name="category">
            <Select name="category" id="category">
              {["Company news", "People & culture", "Team updates"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Audience" name="department_id">
            <Select name="department_id" id="department_id">
              <option value="">Entire company</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="pinned" className="size-4 accent-teal-700" />
          Pin this announcement
        </label>
      </ActionDialog>
    </div>
  );
}
