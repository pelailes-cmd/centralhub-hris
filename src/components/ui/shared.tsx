import { cn, initials } from "@/lib/utils";
import { CircleCheck, Inbox, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "./button";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="logo-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span className="text-[20px] font-bold tracking-[-.8px]">
          central<span className="text-primary">hub</span>
          <span className="ml-0.5 text-primary">.</span>
        </span>
      )}
    </span>
  );
}
export function Avatar({
  name,
  color = "teal",
  size = "md",
  photoId,
}: {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  photoId?: string;
}) {
  return (
    <span
      className={cn("avatar", `avatar-${color}`, {
        "size-8 text-[10px]": size === "sm",
        "size-10 text-xs": size === "md",
        "size-12 text-sm": size === "lg",
        "size-20 text-2xl": size === "xl",
      })}
      aria-hidden="true"
    >
      {photoId ? (
        <Image
          unoptimized
          src={`/api/downloads/avatar/${photoId}`}
          alt=""
          width={80}
          height={80}
          className="size-full rounded-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const tone = ["Active", "Approved", "Published", "Present", "Completed", "active"].includes(
    status,
  )
    ? "teal"
    : ["Pending", "Late", "Probation", "Draft", "In progress", "invited"].includes(status)
      ? "amber"
      : ["Rejected", "Archived", "deactivated", "suspended", "Absent"].includes(status)
        ? "rose"
        : status === "Remote"
          ? "blue"
          : "neutral";
  return (
    <Badge tone={tone} dot>
      {status}
    </Badge>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      {" "}
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
export function Card({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border bg-white shadow-[0_1px_2px_#0f172a03]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
export function CardHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-5">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-.15px]">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-slate-400" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const inputClass =
  "flex h-10 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-[13px] outline-none placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-3 focus-visible:ring-teal-600/15 disabled:bg-muted disabled:opacity-60";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-24 resize-y", className)} {...props} />;
}
export function Field({
  label,
  name,
  hint,
  children,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  name: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-xs font-medium text-slate-700">
        {label}
        {props.required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      {children ?? <Input id={name} name={name} {...props} />}
      {hint && (
        <p className="text-[11px] leading-relaxed text-muted-foreground" id={`${name}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
export function SubmitButton({
  pending,
  children = "Save changes",
}: {
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
      {pending ? "Saving…" : children}
    </Button>
  );
}
export function FormError({ message }: { message?: string }) {
  return message ? (
    <p
      role="alert"
      className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  ) : null;
}
