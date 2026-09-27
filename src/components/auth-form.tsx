"use client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  HeartHandshake,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Avatar, Field, FormError, Input, Logo } from "./ui/shared";

type Mode = "login" | "forgot" | "reset" | "activate";
export function AuthForm({
  mode = "login",
  demo = false,
  notice = "",
}: {
  mode?: Mode;
  demo?: boolean;
  notice?: string;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const title =
    mode === "forgot"
      ? "A fresh start"
      : mode === "activate"
        ? "Welcome to the team"
        : mode === "reset"
          ? "Choose a new password"
          : "Welcome back";
  const subtitle =
    mode === "forgot"
      ? "Enter your work email and we’ll send you a reset link."
      : mode === "activate"
        ? "Set a secure password to activate your company account."
        : mode === "reset"
          ? "Make it memorable for you, and hard to guess."
          : "A calmer workday starts here. Sign in to your workspace.";
  const notices: Record<string, string> = {
    inactive: "This account is not active. Please contact your administrator.",
    expired: "Your session has expired. Please sign in again.",
    "invalid-link":
      "That link has expired or has already been used. Request a new password reset link, or ask your administrator for a new invitation.",
    "password-set": "Your password is set. Sign in to continue.",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === "login" ? "login" : mode === "forgot" ? "forgot" : "set-password",
          ...Object.fromEntries(f),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (result.redirect) {
        router.push(result.redirect);
        router.refresh();
      } else setSuccess(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[46%_54%]">
      <section className="auth-grid relative hidden min-h-dvh flex-col overflow-hidden bg-[#124c43] p-12 text-white lg:flex xl:p-16">
        <div className="relative z-10 [&_.logo-mark_i]:bg-[#8acaba] [&_.text-primary]:text-[#a3d9cc]">
          <Logo />
        </div>
        <div className="relative z-10 my-auto pb-10 pt-16">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] text-emerald-100">
            <Sparkles className="size-3" />A little less admin. A lot more human.
          </span>
          <p className="max-w-md text-[clamp(38px,4vw,56px)] font-medium leading-[1.13] tracking-[-2.3px]">
            Great work starts
            <br />
            with your <span className="text-[#a4d2bf]">people.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-7 text-[#b8d0c8]">
            One thoughtfully connected home for your team, their everyday essentials, and everything
            they’re growing toward.
          </p>
          <div className="relative mt-12 max-w-sm rounded-2xl border border-white/15 bg-white/[.07] p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
                <HeartHandshake className="size-5 text-emerald-100" />
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#b8d9cd]">
                <span className="size-1.5 rounded-full bg-[#a4d2bf]" />
                Connected, every day
              </span>
            </div>
            <p className="mb-4 mt-5 text-lg font-medium tracking-tight">
              Good people. Great possibilities.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {["MC", "PR", "ZS", "AK"].map((n, i) => (
                  <span key={n} className="rounded-full ring-2 ring-[#225b50]">
                    <Avatar
                      name={n.split("").join(" ")}
                      color={["teal", "amber", "blue", "rose"][i]}
                      size="sm"
                    />
                  </span>
                ))}
              </div>
              <div className="text-[10px] leading-relaxed text-[#c2d7cf]">
                A place for everyone.
                <br />
                Room to do your best work.
              </div>
              <span className="ml-auto flex size-7 items-center justify-center rounded-full bg-[#b2d6bf] text-[#285647]">
                <Check className="size-4" />
              </span>
            </div>
          </div>
        </div>
        <div className="auth-orb -right-24 bottom-16" />
        <div className="auth-orb -right-12 bottom-28" />
        <div className="auth-orb right-0 bottom-40" />
        <p className="relative z-10 text-[10px] text-[#9dbcb0]">
          CentralHub · Your people. Your place.
        </p>
      </section>
      <section className="flex min-h-dvh flex-col px-6 sm:px-12">
        <div className="flex items-center justify-between py-8 lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />A secure space for your team
          </span>
        </div>
        <div className="mx-auto my-auto w-full max-w-[370px] py-12">
          <span className="mb-7 flex size-12 items-center justify-center rounded-xl border border-[#e1ede8] bg-[#f4f8f5] text-primary">
            <LockKeyhole className="size-5" strokeWidth={1.6} />
          </span>
          <h1 className="text-[29px] font-semibold tracking-[-1px]">
            {title}
            <span className="text-primary">.</span>
          </h1>
          <p className="mb-8 mt-3 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
          {notice && notices[notice] && (
            <p
              role="status"
              className="mb-5 rounded-lg bg-muted p-3 text-xs leading-relaxed text-slate-600"
            >
              {notices[notice]}
            </p>
          )}
          {success ? (
            <div
              role="status"
              className="rounded-xl border border-teal-100 bg-teal-50 p-5 text-sm leading-relaxed text-teal-900"
            >
              <Check className="mb-3 size-6" />
              {success}
              <Link href="/login" className="mt-4 block font-semibold underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              {(mode === "login" || mode === "forgot") && (
                <Field
                  label="Work email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              )}
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-xs font-medium">
                      {mode === "login" ? "Password" : "New password"}
                    </label>
                    {mode === "login" && (
                      <Link
                        href="/forgot-password"
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                      minLength={mode === "login" ? 1 : 12}
                      maxLength={128}
                      placeholder={
                        mode === "login" ? "Enter your password" : "At least 12 characters"
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? "Hide password" : "Show password"}
                      aria-pressed={show}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400"
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              )}
              {(mode === "reset" || mode === "activate") && (
                <Field
                  label="Confirm new password"
                  name="confirmPassword"
                  type={show ? "text" : "password"}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Enter your new password again"
                />
              )}
              <FormError message={error} />
              <Button type="submit" disabled={pending} className="h-11 w-full">
                {pending ? <Loader2 className="animate-spin" /> : null}
                {pending
                  ? "One moment…"
                  : mode === "login"
                    ? "Sign in to your workspace"
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "activate"
                        ? "Activate account"
                        : "Reset password"}
                {!pending && <ArrowRight className="ml-auto" />}
              </Button>
            </form>
          )}
          {mode === "login" ? (
            <>
              <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
                <LockKeyhole className="mr-1 inline size-3" />
                Your session expires after 8 hours.
              </p>
              <div className="my-7 border-t border-border" />
              <p className="text-center text-xs text-muted-foreground">
                New to the team?{" "}
                <span className="font-medium text-slate-700">Look for your invitation email.</span>
              </p>
              {demo && (
                <Button asChild variant="soft" className="mt-5 w-full">
                  <Link href="/">
                    Explore the development preview
                    <ArrowUpRightIcon />
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Link
              href="/login"
              className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-primary"
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </Link>
          )}
        </div>
        <p className="pb-7 text-center text-[10px] text-slate-400">
          © {new Date().getFullYear()} CentralHub. People, connected.
        </p>
      </section>
    </main>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight className="ml-auto size-4 -rotate-45" />;
}
export function MfaForm() {
  const router = useRouter();
  const [factors, setFactors] = useState<{ id: string; name: string }[]>([]);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mfa-list" }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (!r.ok) throw new Error(r.message);
        setFactors(r.factors);
        setFactorId(r.factors[0]?.id || "");
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);
  async function enroll() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mfa-enroll" }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.message);
      setFactorId(result.factorId);
      setQr(result.qr);
      setSecret(result.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed.");
    } finally {
      setPending(false);
    }
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get("code");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mfa-verify", factorId, code }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.message);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <Link href="/login" className="mb-9">
        <Logo />
      </Link>
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-white p-7">
        <Fingerprint className="size-9 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">One more step</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Protect your workspace with an authenticator app. Multi-factor verification is required
          for accounts with elevated permissions.
        </p>
        <FormError message={error} />
        {!loaded ? (
          <Loader2 className="animate-spin text-primary" />
        ) : !factors.length && !qr ? (
          <Button disabled={pending} onClick={enroll}>
            Set up authenticator
          </Button>
        ) : (
          <>
            {qr && (
              <>
                <Image
                  unoptimized
                  width={200}
                  height={200}
                  alt="Scan this QR code with your authenticator app"
                  src={
                    qr.startsWith("data:")
                      ? qr
                      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
                  }
                  className="mx-auto"
                />
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Enter a setup key instead</summary>
                  <code className="mt-2 block break-all rounded bg-muted p-3">{secret}</code>
                </details>
              </>
            )}
            <form onSubmit={verify} className="space-y-4">
              <Field
                label="6-digit verification code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="000000"
              />
              <Button disabled={pending} className="w-full">
                {pending ? "Verifying…" : "Verify and continue"}
                <ArrowRight />
              </Button>
            </form>
          </>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Lost access to your authenticator? Contact your administrator for identity verification
          and recovery.
        </p>
      </div>
    </main>
  );
}
