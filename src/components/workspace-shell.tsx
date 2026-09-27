"use client";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SessionPulse } from "./session-pulse";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, Badge, Logo } from "./ui/shared";
import { useWorkspace } from "./workspace-provider";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/employees", label: "People", icon: Users },
  { href: "/attendance", label: "Attendance", icon: Clock3 },
  { href: "/leave", label: "Time off", icon: CalendarDays },
  { href: "/payroll", label: "Payroll", icon: Wallet },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/performance", label: "Performance & growth", icon: Sprout },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
];
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { data, act, resetDemo } = useWorkspace();
  const { viewer } = data;
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const pending = data.leaves.filter(
    (l) =>
      l.status === "Pending" &&
      l.employee_id !== viewer.employee_id &&
      (l.approver_id === viewer.employee_id || l.delegate_id === viewer.employee_id),
  ).length;
  const unread = data.notifications.filter((n) => !n.read_at).length;
  const admin = [
    "organization.manage",
    "access.manage",
    "accounts.manage",
    "technical.manage",
    "audit.read",
  ].some((p) => can(viewer, p));
  const visibleNavigation = [
    ...navigation,
    ...(can(viewer, "recruitment.manage")
      ? [{ href: "/recruitment", label: "Recruitment", icon: Users }]
      : []),
  ];
  const current =
    visibleNavigation.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))
      ?.label ||
    (path === "/settings" ? "My profile" : path === "/approvals" ? "Approvals" : "Administration");
  async function logout() {
    try {
      if (!data.isDemo) {
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout" }),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.message || "Sign-out failed. Please retry.");
        }
      }
      router.push("/login");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-out failed.");
    }
  }
  const sidebar = (
    <>
      <div className="px-6 pb-9 pt-8">
        <Link href="/" aria-label="CentralHub home" onClick={() => setMobile(false)}>
          <Logo />
        </Link>
        <p className="ml-10 mt-1.5 text-[9px] font-medium tracking-[1.8px] text-slate-400">
          PEOPLE, CONNECTED
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5">
        <p className="eyebrow mb-3 px-3">Workspace</p>
        <nav aria-label="Main navigation" className="space-y-1">
          {visibleNavigation.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobile(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-[42px] items-center gap-3 rounded-lg px-3 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-[#eaf4f0] text-[#176d5e]"
                    : "text-[#647282] hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                <item.icon className="size-[17px]" strokeWidth={1.7} />
                {item.label}
                {item.href === "/leave" && pending > 0 && (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-md bg-white text-[10px] text-primary">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="my-6 border-t border-border" />
        <p className="eyebrow mb-3 px-3">Manage</p>
        <nav aria-label="Management navigation" className="space-y-1">
          <Link
            href="/approvals"
            onClick={() => setMobile(false)}
            className={cn(
              "flex h-[42px] items-center gap-3 rounded-lg px-3 text-xs font-medium",
              path === "/approvals"
                ? "bg-teal-50 text-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <ClipboardCheck className="size-[17px]" strokeWidth={1.7} />
            Requests & approvals
          </Link>
          {admin && (
            <Link
              href="/administration"
              onClick={() => setMobile(false)}
              className={cn(
                "flex h-[42px] items-center gap-3 rounded-lg px-3 text-xs font-medium",
                path === "/administration"
                  ? "bg-teal-50 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Settings2 className="size-[17px]" strokeWidth={1.7} />
              Administration
            </Link>
          )}
        </nav>
      </div>
      <div className="px-5 pb-4 pt-6">
        <div className="rounded-xl bg-[#f5f8f7] p-4">
          <div className="mb-2.5 flex items-center gap-2 text-primary">
            <CircleHelp className="size-4" />
            <span className="text-xs font-semibold">A little guidance?</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Find your way around your workspace.
          </p>
          <button
            onClick={() => {
              setHelp(true);
              setMobile(false);
            }}
            className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary"
          >
            Explore the quick guide <ArrowUpRight className="size-3" />
          </button>
        </div>
      </div>
      <div className="mx-5 border-t border-border" />
      <Link
        href="/settings"
        onClick={() => setMobile(false)}
        className="flex items-center gap-3 px-5 py-5 hover:bg-muted"
      >
        <Avatar name={viewer.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold">{viewer.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {viewer.roles[0] || "Employee"}
          </p>
        </div>
        <Settings2 className="size-4 text-slate-400" />
      </Link>
    </>
  );
  return (
    <div className="min-h-dvh">
      <SessionPulse />
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-3 text-sm text-white focus:not-sr-only"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-border bg-white lg:flex">
        {sidebar}
      </aside>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-l-0 p-0">
          <div className="sr-only">
            <DialogTitle>Navigation</DialogTitle>
            <DialogDescription>Navigate your CentralHub workspace.</DialogDescription>
          </div>
          <div className="flex h-full flex-col">{sidebar}</div>
        </DialogContent>
      </Dialog>
      <div className="lg:pl-[228px]">
        <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between gap-4 border-b border-border bg-white/95 px-5 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <span className="hidden text-xs text-slate-400 sm:inline">Workspace</span>
            <span className="hidden text-xs text-slate-300 sm:inline">/</span>
            <span className="truncate text-xs font-medium">{current}</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={() => setSearch(true)}
              className="flex h-9 items-center gap-2.5 rounded-lg text-xs text-slate-400 hover:text-primary"
              aria-label="Search workspace"
            >
              <Search className="size-[17px]" />
              <span className="hidden md:inline">Search anything…</span>
              <kbd className="ml-10 hidden rounded border border-border bg-slate-50 px-1.5 py-0.5 text-[10px] xl:inline">
                Search
              </kbd>
            </button>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                >
                  <Bell className="!size-[18px]" />
                  {unread > 0 && (
                    <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-amber-500 ring-2 ring-white" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(350px,calc(100vw-2rem))]">
                <div className="flex items-center justify-between px-3 py-3">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button className="text-[10px] text-primary" onClick={() => act("notifications")}>
                    <CheckCheck className="mr-1 inline size-3" />
                    Mark all read
                  </button>
                </div>
                <DropdownMenuSeparator />
                {data.notifications.length ? (
                  data.notifications.map((n) => (
                    <DropdownMenuItem key={n.id} asChild>
                      <Link
                        href={n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/"}
                        className="!items-start py-3"
                      >
                        <span
                          className={cn(
                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                            n.read_at ? "bg-slate-200" : "bg-primary",
                          )}
                        />
                        <span>
                          <strong className="text-xs font-medium">{n.title}</strong>
                          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                            {n.body}
                          </span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <p className="px-3 py-5 text-xs text-muted-foreground">You’re all caught up.</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full"
                  aria-label="Open user menu"
                >
                  <Avatar name={viewer.name} size="sm" />
                  <ChevronDown className="size-3 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold">{viewer.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{viewer.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings2 />
                    My profile & security
                  </Link>
                </DropdownMenuItem>
                {data.isDemo && (
                  <DropdownMenuItem onSelect={resetDemo}>
                    <Activity />
                    Reset preview data
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1530px] px-5 py-7 outline-none sm:px-8 sm:py-8 xl:px-9"
        >
          {children}
          <footer className="mt-9 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-[10px] text-slate-400">
            <span>© {new Date().getFullYear()} CentralHub. People, connected.</span>
            <span className="flex items-center gap-1.5">
              {data.isDemo ? (
                <>
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Development preview · fictional data
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3" />
                  Your workspace is secure
                </>
              )}
            </span>
          </footer>
        </main>
      </div>
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Find your way</DialogTitle>
            <DialogDescription>
              Search people in your scope or jump to a workspace page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-input px-3">
            <Search className="size-4 text-slate-400" />
            <input
              autoFocus
              aria-label="Search people and pages"
              placeholder="Search people, teams, or pages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="max-h-80 space-y-1 overflow-auto">
            {visibleNavigation
              .filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
              .map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setSearch(false)}
                  className="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-muted"
                >
                  <n.icon className="size-4 text-primary" />
                  {n.label}
                  <ArrowUpRight className="ml-auto size-3 text-slate-400" />
                </Link>
              ))}
            {query &&
              data.employees
                .filter((e) =>
                  `${e.full_name} ${e.job_title}`.toLowerCase().includes(query.toLowerCase()),
                )
                .slice(0, 8)
                .map((e) => (
                  <Link
                    key={e.id}
                    href={`/employees/${e.id}`}
                    onClick={() => setSearch(false)}
                    className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted"
                  >
                    <Avatar name={e.full_name} color={e.avatar_color} size="sm" />
                    <span className="text-xs">
                      {e.full_name}
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {e.job_title}
                      </span>
                    </span>
                  </Link>
                ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A calmer workday starts here</DialogTitle>
            <DialogDescription>Your quick guide to CentralHub.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            {[
              [
                Clock3,
                "Keep your day on track",
                "Clock in and out in Attendance. If a time needs changing, submit a correction for review.",
              ],
              [
                CalendarDays,
                "Make room for time off",
                "Check your balances and request leave. Your request goes to an explicitly assigned approver.",
              ],
              [
                FileText,
                "Keep the essentials close",
                "Read policies, acknowledge updates, and download your own documents and published payslips.",
              ],
              [
                Sparkles,
                "Make space to grow",
                "Find your tasks, training, and growth conversations in Performance & growth.",
              ],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Clock3;
              return (
                <div key={String(title)} className="flex gap-3">
                  <I className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">{String(title)}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {String(body)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <Badge tone="teal">Need more help? Contact your People & Culture team.</Badge>
        </DialogContent>
      </Dialog>
    </div>
  );
}
