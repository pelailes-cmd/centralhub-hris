"use client";
import { saveDemoFile } from "@/lib/demo-files";
import { can } from "@/lib/permissions";
import type { Document as HrisDocument } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import {
  BookOpen,
  CheckCheck,
  Download,
  FileText,
  FolderLock,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Badge, Card, EmptyState, Field, Input, PageHeading, Select } from "./ui/shared";
import { ActionDialog } from "./workflow-dialogs";
import { useWorkspace } from "./workspace-provider";

export function Documents() {
  const { data, act, download, refresh } = useWorkspace();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("company");
  const [upload, setUpload] = useState(false);
  const [category, setCategory] = useState("company");
  const [ack, setAck] = useState<HrisDocument | null>(null);
  const me = data.viewer.employee_id;
  const records = data.documents.filter(
    (d) =>
      (tab === "company"
        ? d.category === "company"
        : tab === "mine"
          ? d.employee_id === me
          : d.category !== "company") && d.title.toLowerCase().includes(q.toLowerCase()),
  );
  const outstanding = data.documents.filter(
    (d) =>
      d.requires_ack &&
      !data.acknowledgements.some((a) => a.document_id === d.id && a.employee_id === me),
  );
  async function submitUpload(f: FormData) {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size)
      return { ok: false, message: "Choose a document to upload." };
    if (file.size > 10485760) return { ok: false, message: "Use a file smaller than 10 MB." };
    f.set("category", category);
    f.set("requires_ack", f.get("requires_ack") === "on" ? "true" : "false");
    if (category === "company") f.delete("employee_id");
    else f.delete("department_id");
    if (data.isDemo) {
      const id = crypto.randomUUID();
      await saveDemoFile(id, file);
      return act("document", {
        id,
        title: f.get("title"),
        category,
        employee_id: f.get("employee_id") || null,
        department_id: f.get("department_id") || null,
        requires_ack: f.get("requires_ack") === "true",
        storage_path: `demo-upload/${id}.${file.name.split(".").pop() || "txt"}`,
        file_size: file.size,
        created_at: new Date().toISOString(),
      });
    }
    const response = await fetch("/api/documents", { method: "POST", body: f });
    const result = await response.json();
    if (result.ok) refresh();
    return result;
  }
  return (
    <div className="page-enter">
      <PageHeading
        title="The important things, organized."
        description="Find company policies, personal documents, and a little peace of mind."
      >
        {can(data.viewer, "documents.manage") && (
          <Button onClick={() => setUpload(true)}>
            <Upload />
            Upload document
          </Button>
        )}
      </PageHeading>
      {outstanding.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4ead9] bg-[#f5f8ef] px-5 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="size-5 text-[#7a8a4f]" />
            <div>
              <p className="text-xs font-semibold">A little reading to catch up on</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {outstanding.length} document{outstanding.length !== 1 ? "s need" : " needs"} your
                acknowledgement.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAck(outstanding[0])}>
            Review next document
          </Button>
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5">
          <div className="flex overflow-x-auto">
            {[
              ["company", "Company policies"],
              ["mine", "My documents"],
              ...(can(data.viewer, "documents.read") ? [["team", "Employee files"]] : []),
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
          <div className="relative my-3">
            <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
            <Input
              aria-label="Search documents"
              placeholder="Find a document…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>
        {records.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {records.map((d) => {
              const acknowledged = data.acknowledgements.some(
                (a) => a.document_id === d.id && a.employee_id === me,
              );
              return (
                <article key={d.id} className="flex flex-col rounded-xl border border-border p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <span
                      className={`flex size-11 items-center justify-center rounded-xl ${d.category === "company" ? "bg-[#eef4f9] text-[#6684a4]" : "bg-[#f2eef7] text-[#9176ad]"}`}
                    >
                      {d.category === "company" ? (
                        <FileText className="size-5" />
                      ) : (
                        <FolderLock className="size-5" />
                      )}
                    </span>
                    {d.requires_ack ? (
                      <Badge tone={acknowledged ? "teal" : "amber"}>
                        {acknowledged ? "Acknowledged" : "Action needed"}
                      </Badge>
                    ) : (
                      <Badge>{d.category === "company" ? "Policy" : "Private"}</Badge>
                    )}
                  </div>
                  <h2 className="text-sm font-semibold tracking-tight">{d.title}</h2>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                    {d.employee_id
                      ? data.employees.find((e) => e.id === d.employee_id)?.full_name ||
                        "Employee document"
                      : d.department_id
                        ? data.departments.find((dep) => dep.id === d.department_id)?.name
                        : "Everyone at CentralHub"}
                  </p>
                  <p className="mb-5 mt-1.5 text-[10px] text-muted-foreground">
                    {Math.max(1, Math.round(d.file_size / 1024))} KB · Updated{" "}
                    {dateLabel(d.created_at)}
                  </p>
                  <div className="mt-auto flex gap-2 border-t border-border pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => download("document", d.id)}
                    >
                      <Download className="!size-3.5" />
                      Download
                    </Button>
                    {d.requires_ack && !acknowledged && (
                      <Button size="sm" variant="soft" onClick={() => setAck(d)}>
                        <CheckCheck className="!size-3.5" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="A place for your essentials"
            description={
              q
                ? "Try searching for a different document title."
                : "Documents shared with you will appear here. Company policies and private employee files stay separate."
            }
          />
        )}
      </Card>
      <p className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Private files require authorization each time they’re downloaded.
      </p>
      <ActionDialog
        open={upload}
        onOpenChange={setUpload}
        title="Give this document a home"
        description="Choose who this document belongs to. Sensitive categories need their own permissions."
        submitLabel="Upload document"
        onSubmit={submitUpload}
      >
        <Field
          label="Document title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          placeholder="e.g. Flexible work policy"
        />
        <Field label="Document category" name="category">
          <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="company">Company policy</option>
            <option value="personnel">Employee personnel file</option>
            {["bank", "government", "medical", "disciplinary", "identity"]
              .filter((c) => can(data.viewer, `sensitive.${c}.write`))
              .map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)} — restricted
                </option>
              ))}
          </Select>
        </Field>
        {category === "company" ? (
          <Field label="Who can read it?" name="department_id">
            <Select id="department_id" name="department_id">
              <option value="">Entire company</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Employee" name="employee_id">
            <Select id="employee_id" name="employee_id" required>
              {data.employees
                .filter((e) =>
                  can(
                    data.viewer,
                    category === "personnel" ? "documents.manage" : `sensitive.${category}.write`,
                    e,
                  ),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field
          label="File"
          name="file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          required
          hint="PDF, PNG, JPG, or text. Maximum 10 MB."
        />
        <label className="flex items-center gap-2 text-xs">
          <input name="requires_ack" type="checkbox" className="size-4 accent-teal-700" />
          Ask employees to acknowledge this document
        </label>
      </ActionDialog>
      <ActionDialog
        open={!!ack}
        onOpenChange={(v) => {
          if (!v) setAck(null);
        }}
        title="Read and acknowledge"
        description={ack?.title || ""}
        submitLabel="Record acknowledgement"
        onSubmit={() => act("acknowledge", { id: ack?.id })}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Download and read the document before confirming. Your acknowledgement and its date will
          be recorded.
        </p>
        <Button type="button" variant="outline" onClick={() => ack && download("document", ack.id)}>
          <Download />
          Download document
        </Button>
        <label className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs leading-relaxed">
          <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-teal-700" />I
          have read and understood this document.
        </label>
      </ActionDialog>
    </div>
  );
}
