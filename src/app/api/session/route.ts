import { apiContext, HttpError } from "@/lib/auth";
import { NextResponse } from "next/server";
export async function GET() {
  try {
    const { viewer } = await apiContext(true);
    return NextResponse.json(
      {
        id: viewer.id,
        grants: viewer.grants,
        redirect: viewer.mfa_required && viewer.aal !== "aal2" ? "/mfa" : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        redirect: "/login?notice=expired",
        message: e instanceof HttpError ? e.message : "Session unavailable.",
      },
      { status: e instanceof HttpError ? e.status : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
