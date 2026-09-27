import { apiContext, assertOrigin, authRateLimit, HttpError } from "@/lib/auth";
import { createSupabaseAdmin, createSupabaseServer, hasSupabase } from "@/lib/supabase/server";
import { loginSchema, passwordSchema } from "@/lib/validation";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";

const genericReset =
  "If an active account matches that email, a password reset link is on its way.";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    if (!hasSupabase())
      throw new HttpError(503, "Connect your Supabase project to enable account sign-in.");
    const input = await request.json();
    const client = await createSupabaseServer();
    const action = z.string().parse(input.action);
    if (action === "login") {
      const { email, password } = loginSchema.parse(input);
      if (!(await authRateLimit(email, "login")))
        throw new HttpError(429, "Too many attempts. Please wait 15 minutes and try again.");
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error)
        throw new HttpError(
          401,
          "The email or password is incorrect, or the account is unavailable.",
        );
      const { error: sessionError } = await client.rpc("register_session");
      if (sessionError) {
        await client.auth.signOut();
        throw new HttpError(403, "This account is not active. Please contact your administrator.");
      }
      const { data } = await client.rpc("account_context");
      return NextResponse.json({
        ok: true,
        message: "Welcome back.",
        redirect: data?.mfa_required && data?.aal !== "aal2" ? "/mfa" : "/",
      });
    }
    if (action === "forgot") {
      const email = z.email().max(254).parse(input.email);
      if (await authRateLimit(email, "recovery")) {
        // Supabase consumes its own expiring one-time token; delivery failures do not reveal account existence.
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
        });
      }
      return NextResponse.json({ ok: true, message: genericReset });
    }
    if (action === "set-password") {
      const password = passwordSchema.parse(input.password);
      if (password !== input.confirmPassword)
        throw new HttpError(400, "Your passwords do not match.");
      const {
        data: { user },
      } = await client.auth.getUser();
      const ticket = (await cookies()).get("centralhub-recovery")?.value;
      if (!ticket || !user)
        throw new HttpError(400, "This link has expired. Please request a new one.");
      const admin = createSupabaseAdmin();
      const { data: purpose, error } = await admin.rpc("consume_recovery_ticket", {
        p_hash: createHash("sha256").update(ticket).digest("hex"),
        p_user: user.id,
      });
      if (error || !purpose)
        throw new HttpError(
          400,
          "This link has expired or has already been used. Please request a new one.",
        );
      const { error: updateError } = await client.auth.updateUser({ password });
      (await cookies()).delete("centralhub-recovery");
      if (updateError)
        throw new HttpError(
          400,
          "We couldn’t change your password. Use a new, strong password and request a fresh link.",
        );
      const { error: finishError } = await admin.rpc("finish_password_reset", {
        p_user: user.id,
        p_activate: purpose === "invite",
      });
      await client.auth.signOut({ scope: "global" });
      if (finishError)
        throw new HttpError(
          500,
          "Your password changed, but activation could not complete. Contact your administrator.",
        );
      return NextResponse.json({
        ok: true,
        message: "Your password is set. Sign in to continue.",
        redirect: "/login?notice=password-set",
      });
    }
    if (action === "logout") {
      await client.rpc("revoke_session");
      await client.auth.signOut();
      return NextResponse.json({ ok: true, message: "You’re signed out.", redirect: "/login" });
    }
    const { viewer, user } = await apiContext(action.startsWith("mfa-"));
    if (action === "change-password") {
      const password = passwordSchema.parse(input.password);
      const currentPassword = z.string().min(1).max(128).parse(input.currentPassword);
      if (password !== input.confirmPassword)
        throw new HttpError(400, "Your passwords do not match.");
      if (!(await authRateLimit(viewer.email, "login")))
        throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error } = await verifier.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });
      // Close only the temporary verification session. The current session is still
      // needed to change the password before every device is signed out below.
      await verifier.auth.signOut({ scope: "local" });
      if (error) throw new HttpError(400, "Your current password is incorrect.");
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError)
        throw new HttpError(400, "Choose a new password that meets the security requirements.");
      const { error: revokeError } = await createSupabaseAdmin().rpc("finish_password_reset", {
        p_user: user.id,
        p_activate: false,
      });
      if (revokeError) {
        await client.auth.signOut({ scope: "global" });
        throw new HttpError(
          500,
          "Your password changed, but session cleanup failed. Contact your administrator.",
        );
      }
      await client.auth.signOut({ scope: "global" });
      return NextResponse.json({
        ok: true,
        message: "Password changed. Sign in again on your devices.",
        redirect: "/login?notice=password-set",
      });
    }
    if (action === "mfa-list") {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw new HttpError(400, "Could not load verification methods.");
      return NextResponse.json({
        ok: true,
        factors: data.totp
          .filter((f) => f.status === "verified")
          .map((f) => ({ id: f.id, name: f.friendly_name })),
      });
    }
    if (action === "mfa-enroll") {
      const { data: factors } = await client.auth.mfa.listFactors();
      if (factors?.totp.some((f) => f.status === "verified"))
        throw new HttpError(400, "Use your existing authenticator to verify this session.");
      // Clear abandoned, unverified enrollments; verified methods are never removed here.
      for (const factor of factors?.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      ) ?? [])
        await client.auth.mfa.unenroll({ factorId: factor.id });
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CentralHub authenticator",
        issuer: "CentralHub",
      });
      if (error) throw new HttpError(400, "Could not set up the authenticator. Please retry.");
      return NextResponse.json(
        { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "mfa-verify") {
      const factorId = z.uuid().parse(input.factorId);
      const code = z
        .string()
        .regex(/^\d{6}$/)
        .parse(input.code);
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error)
        throw new HttpError(
          400,
          "That code is incorrect or expired. Try the next code from your authenticator.",
        );
      return NextResponse.json({ ok: true, message: "Verification complete.", redirect: "/" });
    }
    throw new HttpError(400, "Unknown account action.");
  } catch (error) {
    const status =
      error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : "The account service is unavailable. Please try again.";
    return NextResponse.json(
      { ok: false, message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
