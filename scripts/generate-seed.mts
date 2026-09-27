import { writeFileSync } from "node:fs";
import { makeDemoData } from "../src/lib/demo-data.ts";
import { roleTemplates } from "../src/lib/permissions.ts";

const quote = (v: unknown): string =>
  v === null || v === undefined
    ? "null"
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : "'" + String(v).replaceAll("'", "''") + "'";
const insert = (table: string, rows: object[]) =>
  rows.length
    ? `insert into public.${table} (${Object.keys(rows[0]).join(",")}) values\n${rows.map((r) => "(" + Object.values(r).map(quote).join(",") + ")").join(",\n")}\non conflict do nothing;\n`
    : "";
const templates = Object.entries(roleTemplates)
  .map(
    ([name, t]) =>
      `(${quote(name)},${quote(t.scope)},array[${t.permissions.map(quote).join(",")}]::text[],${quote(t.note)})`,
  )
  .join(",\n");
writeFileSync(
  "supabase/migrations/202609270006_role_templates.sql",
  `-- Initial templates are applied only by an explicit administrator assignment.\ninsert into public.role_templates(name,suggested_scope,permissions,description) values\n${templates}\non conflict(name) do nothing;\n`,
);
const d = makeDemoData();
const sql = [
  "-- DEVELOPMENT ONLY. Fictional example.test employees; no Auth users or passwords.\n-- Generated with node scripts/generate-seed.mts. Reset only a disposable local database.\n",
  insert("departments", d.departments),
  insert("teams", d.teams),
  insert(
    "employees",
    d.employees.map((e) => ({ ...e, manager_id: null })),
  ),
  ...d.employees
    .filter((e) => e.manager_id)
    .map(
      (e) =>
        `update public.employees set manager_id=${quote(e.manager_id)} where id=${quote(e.id)};\n`,
    ),
  insert("leave_types", d.leaveTypes),
  insert("leave_balances", d.leaveBalances),
  insert("leave_requests", d.leaves),
  insert("attendance", d.attendance),
  insert("schedules", d.schedules),
  insert("approval_routes", d.routes),
  insert("payslips", d.payslips),
  insert("documents", d.documents),
  insert("document_acknowledgements", d.acknowledgements),
  insert("announcements", d.announcements),
  insert("candidates", d.candidates),
  insert("reviews", d.reviews),
  insert("tasks", d.tasks),
  insert("training", d.training),
  insert("notifications", d.notifications),
  insert("events", d.events),
];
writeFileSync("supabase/seed.sql", sql.join("\n"));
console.log("Generated role templates and fictional development seed.");
