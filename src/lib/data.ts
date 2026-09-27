import { cache } from "react";
import "server-only";
import { getViewer } from "./auth";
import { makeDemoData } from "./demo-data";
import { createSupabaseServer, isDemo } from "./supabase/server";
import type { WorkspaceData } from "./types";
import { companyDate } from "./utils";

// Every query uses the caller's JWT, never a service-role client. RLS is authoritative.
export const loadWorkspace = cache(async (): Promise<WorkspaceData> => {
  const viewer = await getViewer();
  if (isDemo()) return makeDemoData();
  const client = await createSupabaseServer();
  const { data: organization, error: organizationError } = await client
    .from("organization_settings")
    .select("company_name,timezone,currency")
    .single();
  if (organizationError || !organization)
    throw new Error("Unable to load company settings. Check the Supabase configuration.");
  const today = companyDate(organization.timezone);
  const queries = [
    [
      "employees",
      client
        .from("employees")
        .select(
          "id,employee_number,full_name,email,phone,job_title,profile_type,department_id,team_id,manager_id,employment_status,start_date,location,avatar_color,photo_path",
        )
        .order("full_name"),
    ],
    ["departments", client.from("departments").select("id,name,color,parent_id").order("name")],
    ["teams", client.from("teams").select("id,name,department_id").order("name")],
    [
      "attendance",
      client.from("attendance").select("*").order("work_date", { ascending: false }).limit(300),
    ],
    [
      "schedules",
      client.from("schedules").select("*").order("work_date", { ascending: false }).limit(100),
    ],
    [
      "corrections",
      client
        .from("attendance_corrections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ],
    ["leaveTypes", client.from("leave_types").select("*")],
    [
      "leaveBalances",
      client
        .from("leave_balances")
        .select("*")
        .eq("year", Number(today.slice(0, 4))),
    ],
    [
      "leaves",
      client
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
    ],
    ["payslips", client.rpc("list_payslips")],
    [
      "documents",
      client.from("documents").select("*").order("created_at", { ascending: false }).limit(300),
    ],
    ["acknowledgements", client.from("document_acknowledgements").select("*")],
    [
      "announcements",
      client
        .from("announcements")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ],
    ["reviews", client.rpc("list_reviews")],
    ["tasks", client.from("tasks").select("*").order("due_date").limit(300)],
    ["training", client.from("training").select("*").limit(200)],
    [
      "notifications",
      client.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
    ],
    [
      "events",
      client.from("events").select("*").gte("event_date", today).order("event_date").limit(20),
    ],
    [
      "audit",
      client.from("audit_events").select("*").order("created_at", { ascending: false }).limit(100),
    ],
    ["accounts", client.from("accounts").select("id,employee_id,status,created_at")],
    ["routes", client.from("approval_routes").select("*")],
    ["summary", client.rpc("workforce_summary")],
    [
      "overtime",
      client
        .from("overtime_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ],
    [
      "planning",
      client
        .from("planning_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ],
    [
      "recommendations",
      client
        .from("request_recommendations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ],
    ["candidates", client.rpc("list_candidates")],
    ["positions", client.from("positions").select("id,title,department_id").order("title")],
    ["holidays", client.from("holidays").select("*").order("holiday_date")],
  ] as const;
  const results = await Promise.all(
    queries.map(async ([key, query]) => {
      const { data, error } = await query;
      if (error)
        throw new Error(
          `Unable to load ${key}. Check that the Supabase migrations have been applied.`,
        );
      return [key, data ?? []] as const;
    }),
  );
  return { ...Object.fromEntries(results), organization, viewer, isDemo: false } as WorkspaceData;
});
