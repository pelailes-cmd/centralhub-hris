import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/shared";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
export default function Setup() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <Logo />
      <div className="mt-10 rounded-2xl border border-border bg-white p-7">
        <Database className="mb-5 size-8 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Your workspace is almost ready.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Connect your company’s Supabase project to bring CentralHub online.
        </p>
        <ol className="my-6 list-inside list-decimal space-y-3 text-sm leading-relaxed">
          <li>
            Apply the SQL files in <code className="text-xs">supabase/migrations</code>, in order.
          </li>
          <li>
            Set the Supabase URL, publishable key, server key, site URL, and rate-limit secret in
            your hosting environment.
          </li>
          <li>
            Configure Auth email templates and create your first administrator using the documented
            bootstrap script.
          </li>
        </ol>
        <p className="flex gap-2 rounded-lg bg-teal-50 p-3 text-xs leading-relaxed text-teal-800">
          <ShieldCheck className="size-4 shrink-0" />
          Production access stays closed until authentication and permissions are configured.
        </p>
        <Button asChild className="mt-5">
          <Link href="https://github.com/pelailes-cmd/centralhub-hris#readme">
            Open setup instructions
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </main>
  );
}
