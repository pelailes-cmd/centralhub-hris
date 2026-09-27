import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { cache } from "react";
import "server-only";
import { demoViewer } from "./demo-data";
import { createSupabaseAdmin, createSupabaseServer, hasSupabase, isDemo } from "./supabase/server";
import type { Viewer } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
  const allowed =
    process.env.NODE_ENV === "development"
      ? [configured, "http://127.0.0.1:3000", "http://localhost:3000"]
      : [configured];
  if (!origin || !allowed.includes(origin))
    throw new HttpError(403, "This request could not be verified. Refresh the page and try again.");
}
export async function authRateLimit(identifier: string, operation: string) {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new HttpError(503, "Sign-in is not configured yet. Please contact your administrator.");
  const key = createHmac("sha256", pepper)
    .update(`${operation}:${identifier.trim().toLowerCase()}`)
    .digest("hex");
  const { data, error } = await createSupabaseAdmin().rpc("check_auth_rate_limit", {
    p_key_hash: key,
  });
  if (error)
    throw new HttpError(503, "Sign-in is temporarily unavailable. Please try again later.");
  return data === true;
}
export const getViewer = cache(async (): Promise<Viewer> => {
  if (isDemo()) return demoViewer;
  if (!hasSupabase()) redirect("/setup");
  const client = await createSupabaseServer();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await client.rpc("account_context");
  const viewer = data as Viewer | null;
  if (error || !viewer || viewer.status !== "active") redirect("/login?notice=inactive");
  if (!viewer.session_valid) redirect("/login?notice=expired");
  if (viewer.mfa_required && viewer.aal !== "aal2") redirect("/mfa");
  return viewer;
});
export async function apiContext(allowMfaPending = false) {
  if (!hasSupabase()) throw new HttpError(503, "Connect Supabase to use the live workspace.");
  const client = await createSupabaseServer();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const { data, error } = await client.rpc("account_context");
  const viewer = data as Viewer | null;
  if (error || !viewer || viewer.status !== "active" || !viewer.session_valid)
    throw new HttpError(403, "Your account or session is not active. Please sign in again.");
  if (!allowMfaPending && viewer.mfa_required && viewer.aal !== "aal2")
    throw new HttpError(403, "Complete multi-factor verification to continue.");
  return { client, user, viewer };
}
export function databaseError(error: { code?: string; message: string }): never {
  if (error.code === "42501")
    throw new HttpError(403, "You don’t have access to this record or action.");
  if (error.code === "23505")
    throw new HttpError(
      409,
      "This record already exists. Check for a duplicate employee, request, or payroll period.",
    );
  if (error.code === "P0001") throw new HttpError(400, error.message);
  if (["23514", "23503", "22P02", "23502"].includes(error.code ?? ""))
    throw new HttpError(400, "Check your entries and select valid linked records.");
  throw new HttpError(500, "We couldn’t save this change. Please try again.");
}
