import { createSupabaseAdmin, createSupabaseServer, hasSupabase } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const type = request.nextUrl.searchParams.get("type");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (
    !hasSupabase() ||
    !tokenHash ||
    tokenHash.length > 1024 ||
    (type !== "invite" && type !== "recovery")
  )
    return NextResponse.redirect(new URL("/login?notice=invalid-link", base));
  const client = await createSupabaseServer();
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user)
    return NextResponse.redirect(new URL("/login?notice=invalid-link", base));
  const ticket = randomBytes(32).toString("hex");
  const { error: ticketError } = await createSupabaseAdmin().rpc("issue_recovery_ticket", {
    p_hash: createHash("sha256").update(ticket).digest("hex"),
    p_user: data.user.id,
    p_purpose: type,
  });
  if (ticketError) {
    await client.auth.signOut();
    return NextResponse.redirect(new URL("/login?notice=inactive", base));
  }
  (await cookies()).set("centralhub-recovery", ticket, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
  const response = NextResponse.redirect(
    new URL(type === "invite" ? "/activate" : "/reset-password", base),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
