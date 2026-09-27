import { DemoEmployeeProfile, EmployeeProfile } from "@/components/profile";
import { getViewer } from "@/lib/auth";
import { createSupabaseServer, isDemo } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";
import { notFound } from "next/navigation";
export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  await getViewer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (isDemo()) return <DemoEmployeeProfile id={id} />;
  const client = await createSupabaseServer();
  const { data } = await client
    .from("employees")
    .select(
      "id,employee_number,full_name,email,phone,job_title,profile_type,department_id,team_id,manager_id,employment_status,start_date,location,avatar_color,photo_path",
    )
    .eq("id", id)
    .maybeSingle();
  const employee = data as Employee | undefined;
  if (!employee) notFound();
  return <EmployeeProfile employee={employee} />;
}
