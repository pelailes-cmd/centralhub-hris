"use client";
import { getDemoFile } from "@/lib/demo-files";
import { demoMutation } from "@/lib/demo-store";
import { toCsv } from "@/lib/downloads";
import type { ActionResult, WorkspaceData } from "@/lib/types";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

type Context = {
  data: WorkspaceData;
  act: (action: string, payload?: Record<string, unknown>) => Promise<ActionResult>;
  download: (kind: string, id: string) => Promise<void>;
  refresh: () => void;
  resetDemo: () => void;
};
const WorkspaceContext = createContext<Context | null>(null);
const storageKey = "centralhub-development-preview-v3";
function createStore(initial: WorkspaceData) {
  let current = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot() {
      if (!loaded && typeof window !== "undefined" && initial.isDemo) {
        loaded = true;
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
          if (saved?.isDemo && saved.viewer?.id === initial.viewer.id) current = saved;
        } catch {
          /* Ignore invalid preview data. */
        }
      }
      return current;
    },
    getServerSnapshot: () => initial,
    set(next: WorkspaceData) {
      current = next;
      if (initial.isDemo) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          toast.error("Your browser could not save the preview changes.");
        }
      }
      listeners.forEach((fn) => fn());
    },
    reset() {
      localStorage.removeItem(storageKey);
      current = initial;
      listeners.forEach((fn) => fn());
    },
  };
}
export function WorkspaceProvider({
  initialData,
  children,
}: {
  initialData: WorkspaceData;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const store = useMemo(() => createStore(initialData), [initialData]);
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      try {
        let result: ActionResult;
        if (data.isDemo) {
          const next = demoMutation(store.getSnapshot(), action, payload);
          store.set(next.state);
          result = next.result;
        } else {
          const response = await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, payload }),
          });
          result = await response.json();
          if (!response.ok || !result.ok)
            throw new Error(result.message || "Unable to save changes.");
          if (!action.endsWith("read")) router.refresh();
        }
        if (!action.endsWith("read")) toast.success(result.message);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unable to save changes.";
        toast.error(message);
        return { ok: false, message };
      }
    },
    [data.isDemo, router, store],
  );
  async function download(kind: string, id: string) {
    try {
      let blob: Blob;
      let filename: string;
      if (data.isDemo) {
        if (kind === "payslip") {
          const p = data.payslips.find((p) => p.id === id);
          if (!p) throw new Error("Payslip unavailable.");
          blob = new Blob(
            [
              toCsv([
                ["CentralHub — fictional development payslip", p.period],
                ["Currency", p.currency],
                ["Basic pay", p.basic_pay],
                ["Allowances", p.allowances],
                ["Deductions", p.deductions],
                ["Net pay", p.basic_pay + p.allowances - p.deductions],
              ]),
            ],
            { type: "text/csv" },
          );
          filename = `payslip-${p.period}.csv`;
        } else {
          const d = data.documents.find((d) => d.id === id);
          if (!d) throw new Error("Document unavailable.");
          blob = new Blob(
            [
              `${d.title}\n\nCentralHub fictional development document.\n\nWe create a respectful, inclusive workplace. Please keep your information current, follow your assigned schedule, and speak with People & Culture when you need support.\n\nThis example is for reviewing the application. Replace it with your approved company policy before launch.\n`,
            ],
            { type: "text/plain" },
          );
          filename = `${d.title}.txt`;
        }
      } else {
        const response = await fetch(`/api/downloads/${kind}/${id}`);
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.message);
        }
        blob = await response.blob();
        filename =
          response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
          "download";
      }
      if (data.isDemo && kind === "document") {
        const d = data.documents.find((d) => d.id === id);
        if (d?.storage_path.startsWith("demo-upload/")) {
          blob = await getDemoFile(id);
          filename = `${d.title}.${d.storage_path.split(".").pop() || "txt"}`;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your download is ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The download failed.");
    }
  }
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        act,
        download,
        refresh: () => router.refresh(),
        resetDemo: () => store.reset(),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider is missing.");
  return value;
}
