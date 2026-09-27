"use client";
import type { Grant } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkspace } from "./workspace-provider";
const fingerprint = (grants: Grant[]) =>
  JSON.stringify(
    grants
      .map((g) => [g.permission, g.scope, g.department_id || "", g.team_id || ""])
      .sort((a, b) => a.join("|").localeCompare(b.join("|"))),
  );
export function SessionPulse() {
  const { data } = useWorkspace();
  const router = useRouter();
  const key = fingerprint(data.viewer.grants);
  useEffect(() => {
    if (data.isDemo) return;
    let active = true;
    async function check() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        const session = await response.json();
        if (!active) return;
        if (session.redirect && ["/mfa", "/login?notice=expired"].includes(session.redirect)) {
          window.location.assign(session.redirect);
          return;
        }
        if (response.ok && (session.id !== data.viewer.id || fingerprint(session.grants) !== key))
          router.refresh();
      } catch {
        /* The next request still enforces authorization if connectivity is interrupted. */
      }
    }
    const focus = () => {
      void check();
    };
    const timer = setInterval(check, 60000);
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [data.isDemo, data.viewer.id, key, router]);
  return null;
}
