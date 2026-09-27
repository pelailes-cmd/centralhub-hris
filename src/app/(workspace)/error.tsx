"use client";
import { Button } from "@/components/ui/button";
import { CircleAlert } from "lucide-react";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-white p-8 text-center">
      <CircleAlert className="mx-auto mb-4 size-8 text-amber-600" />
      <h1 className="text-lg font-semibold">Your workspace couldn’t load</h1>
      <p className="my-4 text-sm leading-relaxed text-muted-foreground">
        Try again in a moment. If this is a new setup, confirm that all Supabase migrations are
        applied and the server environment variables are configured.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
