import { apiContext, HttpError } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
export async function GET() {
  try {
    const { client, viewer } = await apiContext();
    if (
      ![
        "organization.manage",
        "access.manage",
        "accounts.manage",
        "technical.manage",
        "audit.read",
      ].some((p) => can(viewer, p))
    )
      throw new HttpError(403, "Administration is not available for your account.");
    const [candidates, grants, roles, positions, settings, holidays] = await Promise.all([
      can(viewer, "accounts.manage") || can(viewer, "access.manage")
        ? client.rpc("account_candidates")
        : Promise.resolve({ data: [], error: null }),
      client.from("permission_grants").select("*"),
      client.from("role_assignments").select("*"),
      client.from("positions").select("*").order("title"),
      client.from("organization_settings").select("*").single(),
      client.from("holidays").select("*").order("holiday_date"),
    ]);
    if ([candidates, grants, roles, positions, settings, holidays].some((r) => r.error))
      throw new HttpError(500, "Administration data could not load.");
    return NextResponse.json(
      {
        candidates: candidates.data,
        grants: grants.data,
        roles: roles.data,
        positions: positions.data,
        settings: settings.data,
        holidays: holidays.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof HttpError ? e.message : "Administration unavailable." },
      { status: e instanceof HttpError ? e.status : 500 },
    );
  }
}
