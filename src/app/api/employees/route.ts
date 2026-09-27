import { apiContext, HttpError } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const { client } = await apiContext();
    const search = request.nextUrl.searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(search.get("page") || 1);
    const q = (search.get("q") || "").slice(0, 80).replace(/[,()%*"\\]/g, "");
    let query = client
      .from("employees")
      .select(
        "id,employee_number,full_name,email,phone,job_title,profile_type,department_id,team_id,manager_id,employment_status,start_date,location,avatar_color,photo_path",
        { count: "exact" },
      );
    if (q)
      query = query.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,employee_number.ilike.%${q}%,job_title.ilike.%${q}%`,
      );
    if (search.get("department"))
      query = query.eq("department_id", z.uuid().parse(search.get("department")));
    if (search.get("status"))
      query = query.eq(
        "employment_status",
        z.enum(["Active", "On leave", "Probation", "Archived"]).parse(search.get("status")),
      );
    const { data, count, error } = await query
      .order("full_name")
      .range((page - 1) * 8, page * 8 - 1);
    if (error) throw new HttpError(500, "Could not load employees.");
    return NextResponse.json({ data, count }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof HttpError ? e.message : "Invalid employee query." },
      { status: e instanceof HttpError ? e.status : 400 },
    );
  }
}
