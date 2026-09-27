import { can } from "./permissions";
import type {
  ActionResult,
  Announcement,
  Employee,
  LeaveRequest,
  Review,
  Task,
  Training,
  WorkspaceData,
} from "./types";
import { employeeSchema, leaveSchema } from "./validation";

export function demoMutation(
  source: WorkspaceData,
  action: string,
  p: Record<string, unknown>,
): { state: WorkspaceData; result: ActionResult } {
  const d = structuredClone(source);
  const me = d.viewer.employee_id;
  const now = new Date().toISOString();
  const byId = (employeeId: unknown) => d.employees.find((e) => e.id === employeeId);
  const check = (permission: string, employeeId?: unknown) => {
    if (!can(d.viewer, permission, byId(employeeId)))
      throw new Error("This preview account does not have permission for that action.");
  };
  let message = "Changes saved in your development preview.";
  let data: unknown;
  switch (action) {
    case "employee": {
      check("employees.manage", p.id);
      const v = employeeSchema.parse(p);
      if (
        d.employees.some(
          (e) => e.id !== v.id && (e.email === v.email || e.employee_number === v.employee_number),
        )
      )
        throw new Error("An employee with that email or number already exists.");
      if (v.manager_id === v.id) throw new Error("An employee cannot report to themselves.");
      const record = {
        ...v,
        id: v.id || crypto.randomUUID(),
        avatar_color: "teal",
        phone: v.phone || null,
        manager_id: v.manager_id || null,
        team_id: v.team_id || null,
      } as Employee;
      d.employees = v.id
        ? d.employees.map((e) => (e.id === v.id ? record : e))
        : [...d.employees, record];
      message = v.id ? "Employee updated." : "Employee added to the development preview.";
      break;
    }
    case "clock": {
      const open = d.attendance.find((a) => a.employee_id === me && a.clock_in && !a.clock_out);
      if (p.direction === "in") {
        if (open) throw new Error("You’re already clocked in.");
        const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        if (d.attendance.some((a) => a.employee_id === me && a.work_date === day))
          throw new Error("Your attendance is already recorded. Submit a correction if needed.");
        d.attendance.unshift({
          id: crypto.randomUUID(),
          employee_id: me,
          work_date: day,
          clock_in: now,
          clock_out: null,
          status: "Present",
          note: null,
        });
        message = "You’re clocked in. Have a great day.";
      } else {
        if (!open) throw new Error("Clock in before clocking out.");
        open.clock_out = now;
        message = "You’re clocked out. See you next time.";
      }
      break;
    }
    case "leave": {
      const v = leaveSchema.parse(p);
      let days = 0;
      for (
        let date = new Date(v.start_date + "T12:00:00");
        date <= new Date(v.end_date + "T12:00:00");
        date.setDate(date.getDate() + 1)
      ) {
        if (
          date.getDay() !== 0 &&
          date.getDay() !== 6 &&
          !d.holidays.some(
            (h) =>
              h.holiday_date ===
              `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          )
        )
          days++;
      }
      if (!days) throw new Error("Choose at least one working day.");
      if (
        d.leaves.some(
          (l) =>
            l.employee_id === me &&
            ["Pending", "Approved"].includes(l.status) &&
            l.start_date <= v.end_date &&
            l.end_date >= v.start_date,
        )
      )
        throw new Error("These dates overlap an existing request.");
      const balance = d.leaveBalances.find(
        (b) => b.employee_id === me && b.leave_type_id === v.leave_type_id,
      );
      if (!balance || balance.allowance - balance.used - balance.pending < days)
        throw new Error("You don’t have enough available leave.");
      const route = d.routes.find(
        (r) => r.department_id === byId(me)?.department_id && r.request_type === "leave",
      );
      if (!route || route.approver_id === me)
        throw new Error("Please ask HR to assign a different approver.");
      balance.pending += days;
      d.leaves.unshift({
        ...v,
        id: crypto.randomUUID(),
        employee_id: me,
        days,
        status: "Pending",
        approver_id: route.approver_id,
        delegate_id: route.delegate_id,
        decision_note: null,
        created_at: now,
      } as LeaveRequest);
      message = "Leave requested. Your assigned approver has been notified.";
      break;
    }
    case "decide-leave": {
      const r = d.leaves.find((l) => l.id === p.id);
      if (!r || r.status !== "Pending") throw new Error("This request is no longer pending.");
      if (p.decision === "Cancelled") {
        if (r.employee_id !== me) throw new Error("Only your own requests can be cancelled.");
      } else {
        check("leave.approve", r.employee_id);
        if (r.employee_id === me || (r.approver_id !== me && r.delegate_id !== me))
          throw new Error("A different assigned approver must review this request.");
      }
      r.status = String(p.decision);
      r.decision_note = String(p.note || "");
      const balance = d.leaveBalances.find(
        (b) => b.employee_id === r.employee_id && b.leave_type_id === r.leave_type_id,
      );
      if (balance) {
        balance.pending -= r.days;
        if (p.decision === "Approved") balance.used += r.days;
      }
      message = `Request ${String(p.decision).toLowerCase()}.`;
      break;
    }
    case "correction": {
      const a = d.attendance.find((a) => a.id === p.attendance_id && a.employee_id === me);
      if (!a) throw new Error("Attendance record unavailable.");
      if (d.corrections.some((c) => c.attendance_id === a.id && c.status === "Pending"))
        throw new Error("This record already has a pending correction.");
      d.corrections.unshift({
        id: crypto.randomUUID(),
        employee_id: me,
        attendance_id: a.id,
        requested_in: String(p.requested_in),
        requested_out: p.requested_out ? String(p.requested_out) : null,
        reason: String(p.reason),
        status: "Pending",
        approver_id:
          d.routes.find(
            (r) => r.department_id === byId(me)?.department_id && r.request_type === "attendance",
          )?.approver_id || null,
        created_at: now,
      });
      message = "Correction submitted for review.";
      break;
    }
    case "decide-correction": {
      const r = d.corrections.find((c) => c.id === p.id);
      if (!r || r.employee_id === me || r.approver_id !== me)
        throw new Error("Only a different assigned approver can review this correction.");
      check("attendance.manage", r.employee_id);
      r.status = String(p.decision);
      if (p.decision === "Approved") {
        const a = d.attendance.find((a) => a.id === r.attendance_id);
        if (a) {
          a.clock_in = r.requested_in;
          a.clock_out = r.requested_out;
          a.note = "Approved correction";
        }
      }
      break;
    }
    case "schedule": {
      check("schedules.manage", p.employee_id);
      d.schedules = d.schedules.filter(
        (s) => !(s.employee_id === p.employee_id && s.work_date === p.work_date),
      );
      d.schedules.push({
        id: crypto.randomUUID(),
        employee_id: String(p.employee_id),
        work_date: String(p.work_date),
        start_time: String(p.start_time),
        end_time: String(p.end_time),
        location: String(p.location),
      });
      message = "Shift assigned.";
      break;
    }
    case "candidate": {
      check("recruitment.manage");
      const record = {
        ...p,
        id: p.id || crypto.randomUUID(),
        created_at: now,
      } as WorkspaceData["candidates"][number];
      d.candidates = p.id
        ? d.candidates.map((c) => (c.id === p.id ? record : c))
        : [record, ...d.candidates];
      message = "Candidate record saved.";
      break;
    }
    case "position":
      check("organization.manage");
      d.positions.push({
        id: crypto.randomUUID(),
        title: String(p.title),
        department_id: p.department_id ? String(p.department_id) : null,
      });
      message = "Position created.";
      break;
    case "extra-request": {
      const v = p.data as Record<string, unknown>;
      if (p.kind === "planning") check("planning.manage");
      const route = d.routes.find(
        (r) =>
          r.request_type === p.kind &&
          r.department_id === (v.department_id || byId(me)?.department_id),
      );
      if (!route || route.approver_id === me)
        throw new Error("A different approver must be configured for this request.");
      const record = {
        ...v,
        id: crypto.randomUUID(),
        employee_id: me,
        status: "Pending",
        approver_id: route.approver_id,
        created_at: now,
      } as WorkspaceData["overtime"][number];
      if (p.kind === "planning") d.planning.unshift(record);
      else d.overtime.unshift(record);
      message = "Request submitted to your assigned approver.";
      break;
    }
    case "decide-extra": {
      const r = (p.kind === "planning" ? d.planning : d.overtime).find((r) => r.id === p.id);
      if (!r || r.employee_id === me || r.approver_id !== me || r.status !== "Pending")
        throw new Error("Only a different assigned approver can review this request.");
      check(p.kind === "planning" ? "planning.manage" : "leave.approve", r.employee_id);
      r.status = String(p.decision);
      message = "Request reviewed.";
      break;
    }
    case "verify-training": {
      const t = d.training.find((t) => t.id === p.id);
      if (!t || t.employee_id === me)
        throw new Error("A different authorized reviewer must verify this certification.");
      check("performance.manage", t.employee_id);
      t.status = "Completed";
      t.completed_at = now;
      message = "Training completion verified.";
      break;
    }
    case "document":
      check("documents.manage");
      d.documents.unshift(p as unknown as WorkspaceData["documents"][number]);
      message = "Document saved in this browser’s development preview.";
      break;
    case "acknowledge":
      if (!d.acknowledgements.some((a) => a.document_id === p.id && a.employee_id === me))
        d.acknowledgements.push({
          document_id: String(p.id),
          employee_id: me,
          acknowledged_at: now,
        });
      message = "Acknowledgement recorded. Thank you.";
      break;
    case "announcement":
      check("announcements.manage");
      d.announcements.unshift({
        ...p,
        id: crypto.randomUUID(),
        author_id: me,
        created_at: now,
      } as Announcement);
      message = "Announcement published.";
      break;
    case "task": {
      const t = d.tasks.find((t) => t.id === p.id);
      if (!t) throw new Error("Task unavailable.");
      if (t.employee_id !== me) check("tasks.manage", t.employee_id);
      t.completed = Boolean(p.completed);
      message = t.completed ? "Task complete. Nicely done." : "Task reopened.";
      break;
    }
    case "review": {
      const r = d.reviews.find((r) => r.id === p.id);
      if (!r) throw new Error("Review unavailable.");
      if (r.employee_id === me) r.employee_feedback = String(p.feedback);
      else if (r.reviewer_id === me) {
        r.feedback = String(p.feedback);
        r.rating = Number(p.rating);
        r.status = "Completed";
      } else throw new Error("Only the assigned reviewer can submit this feedback.");
      message = "Your feedback has been saved.";
      break;
    }
    case "development": {
      const v = p.data as Record<string, unknown>;
      check(p.kind === "task" ? "tasks.manage" : "performance.manage", v.employee_id);
      const item = { ...v, id: crypto.randomUUID() };
      if (p.kind === "task")
        d.tasks.push({ ...item, completed: false, description: v.description || "" } as Task);
      else if (p.kind === "review")
        d.reviews.push({
          ...item,
          status: "In progress",
          feedback: null,
          employee_feedback: null,
          rating: null,
        } as Review);
      else
        d.training.push({
          ...item,
          status: "Assigned",
          completed_at: null,
          expires_at: v.expires_at || null,
        } as Training);
      message = "Development item assigned.";
      break;
    }
    case "training": {
      const t = d.training.find((t) => t.id === p.id && t.employee_id === me);
      if (!t) throw new Error("Training unavailable.");
      if (t.category.includes("certification"))
        throw new Error("A reviewer must verify this certification.");
      t.status = "Completed";
      t.completed_at = now;
      break;
    }
    case "notifications":
      d.notifications.forEach((n) => {
        n.read_at = now;
      });
      message = "All caught up.";
      break;
    case "personal-read":
      data = JSON.parse(localStorage.getItem(`centralhub-personal-${me}`) || "{}");
      break;
    case "personal":
      localStorage.setItem(`centralhub-personal-${me}`, JSON.stringify(p.data));
      message = "Your preview profile has been updated.";
      break;
    case "organization": {
      check("organization.manage");
      const v = p.data as Record<string, string>;
      if (p.kind === "department")
        d.departments.push({
          id: crypto.randomUUID(),
          name: v.name,
          color: v.color || "#178579",
          parent_id: v.parent_id || null,
        });
      else if (p.kind === "team")
        d.teams.push({ id: crypto.randomUUID(), name: v.name, department_id: v.department_id });
      else if (p.kind === "route") {
        d.routes = d.routes.filter(
          (r) => !(r.department_id === v.department_id && r.request_type === v.request_type),
        );
        d.routes.push({
          id: crypto.randomUUID(),
          department_id: v.department_id,
          request_type: v.request_type,
          approver_id: v.approver_id,
          delegate_id: v.delegate_id || null,
          delegate_until: v.delegate_until || null,
        });
      } else if (p.kind === "leave_type")
        d.leaveTypes.push({
          id: crypto.randomUUID(),
          name: v.name,
          color: v.color || "teal",
          annual_allowance: Number(v.annual_allowance),
        });
      else if (p.kind === "balance") {
        const b = d.leaveBalances.find(
          (b) => b.employee_id === v.employee_id && b.leave_type_id === v.leave_type_id,
        );
        if (b) b.allowance = Number(v.allowance);
      } else if (p.kind === "holiday") {
        d.holidays = d.holidays.filter((h) => h.holiday_date !== v.date);
        d.holidays.push({ holiday_date: v.date, name: v.name });
      } else if (p.kind === "settings") {
        d.organization = {
          company_name: v.company_name,
          timezone: v.timezone,
          currency: v.currency,
        };
      } else throw new Error("Unknown organization setting.");
      break;
    }
    default:
      throw new Error("Connect Supabase to use this account or administrative action.");
  }
  if (!action.endsWith("read"))
    d.audit.unshift({
      id: crypto.randomUUID(),
      actor_id: d.viewer.id,
      action: `${action}.updated`,
      resource_type: action,
      resource_id: typeof p.id === "string" ? p.id : null,
      created_at: now,
    });
  d.summary = {
    ...d.summary,
    total: d.employees.filter((e) => e.employment_status !== "Archived").length,
    active: d.employees.filter((e) => ["Active", "Probation"].includes(e.employment_status)).length,
    departments: d.departments.map((dept) => ({
      name: dept.name,
      color: dept.color,
      count: d.employees.filter(
        (e) => e.department_id === dept.id && e.employment_status !== "Archived",
      ).length,
    })),
  };
  return { state: d, result: { ok: true, message, data } };
}
