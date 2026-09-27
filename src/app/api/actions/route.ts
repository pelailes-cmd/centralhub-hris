import { apiContext, assertOrigin, databaseError, HttpError } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  actionSchema,
  dateSchema,
  employeeSchema,
  leaveSchema,
  payrollSchema,
} from "@/lib/validation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const id = z.uuid();
const decision = z.enum(["Approved", "Rejected", "Cancelled"]);
const scope = z.enum(["own", "direct_reports", "team", "department", "company"]);
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 500000)
      throw new HttpError(413, "This request is too large.");
    const { action, payload: p } = actionSchema.parse(await request.json());
    const { client } = await apiContext();
    let result: { data: unknown; error: { code?: string; message: string } | null };
    let message = "Changes saved.";
    switch (action) {
      case "clock":
        result = await client.rpc("clock_attendance", {
          p_action: z.enum(["in", "out"]).parse(p.direction),
        });
        message =
          p.direction === "in"
            ? "You’re clocked in. Have a great day."
            : "You’re clocked out. See you next time.";
        break;
      case "employee":
        result = await client.rpc("save_employee", { p_data: employeeSchema.parse(p) });
        message = p.id
          ? "Employee profile updated."
          : "Employee added. You can now arrange their account invitation.";
        break;
      case "candidate":
        result = await client.rpc("save_candidate", {
          p_data: z
            .object({
              id: id.optional(),
              full_name: z.string().trim().min(2).max(100),
              email: z.email(),
              position_title: z.string().trim().min(2).max(100),
              department_id: id,
              stage: z.enum([
                "Applied",
                "Screening",
                "Interview",
                "Offer",
                "Hired",
                "Not proceeding",
              ]),
              notes: z.string().max(3000),
              hired_employee_id: id.nullable(),
            })
            .parse(p),
        });
        message = "Candidate record saved.";
        break;
      case "leave": {
        const v = leaveSchema.parse(p);
        result = await client.rpc("request_leave", {
          p_type: v.leave_type_id,
          p_start: v.start_date,
          p_end: v.end_date,
          p_reason: v.reason,
        });
        message = "Leave requested. Your assigned approver has been notified.";
        break;
      }
      case "decide-leave":
        result = await client.rpc("decide_leave", {
          p_id: id.parse(p.id),
          p_decision: decision.parse(p.decision),
          p_note: z
            .string()
            .max(1000)
            .parse(p.note ?? ""),
        });
        message = `Request ${String(p.decision).toLowerCase()}.`;
        break;
      case "correction":
        result = await client.rpc("request_correction", {
          p_attendance: id.parse(p.attendance_id),
          p_in: z.iso.datetime({ offset: true }).parse(p.requested_in),
          p_out: p.requested_out ? z.iso.datetime({ offset: true }).parse(p.requested_out) : null,
          p_reason: z.string().min(5).max(1000).parse(p.reason),
        });
        message = "Correction submitted for review.";
        break;
      case "decide-correction":
        result = await client.rpc("decide_correction", {
          p_id: id.parse(p.id),
          p_decision: z.enum(["Approved", "Rejected"]).parse(p.decision),
          p_note: z
            .string()
            .max(1000)
            .parse(p.note ?? ""),
        });
        message = "Attendance correction reviewed.";
        break;
      case "schedule":
        result = await client.rpc("save_schedule", {
          p_employee: id.parse(p.employee_id),
          p_date: dateSchema.parse(p.work_date),
          p_start: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .parse(p.start_time),
          p_end: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .parse(p.end_time),
          p_location: z.string().min(2).max(100).parse(p.location),
        });
        message = "Shift assigned and employee notified.";
        break;
      case "payroll":
        result = await client.rpc("create_payroll", {
          p_records: z.array(payrollSchema).min(1).max(200).parse(p.records),
        });
        message = "Payroll draft saved. Review it before publishing.";
        break;
      case "publish-payslip":
        result = await client.rpc("publish_payslip", { p_id: id.parse(p.id) });
        message = "Payslip published and employee notified.";
        break;
      case "acknowledge":
        result = await client.rpc("acknowledge_document", { p_id: id.parse(p.id) });
        message = "Acknowledgement recorded. Thank you.";
        break;
      case "announcement": {
        const v = z
          .object({
            title: z.string().trim().min(3).max(160),
            body: z.string().trim().min(5).max(5000),
            category: z.string().max(60),
            pinned: z.boolean(),
            department_id: id.nullable(),
          })
          .parse(p);
        result = await client.rpc("publish_announcement", { p_data: v });
        message = "Announcement published.";
        break;
      }
      case "task":
        result = await client.rpc("update_task", {
          p_id: id.parse(p.id),
          p_complete: z.boolean().parse(p.completed),
        });
        message = p.completed ? "Task complete. Nicely done." : "Task reopened.";
        break;
      case "review":
        result = await client.rpc("save_review", {
          p_id: id.parse(p.id),
          p_feedback: z.string().trim().min(5).max(5000).parse(p.feedback),
          p_rating: p.rating ? z.coerce.number().int().min(1).max(5).parse(p.rating) : null,
        });
        message = "Your feedback has been saved.";
        break;
      case "development":
        result = await client.rpc("create_development_item", {
          p_kind: z.enum(["task", "training", "review"]).parse(p.kind),
          p_data: z.record(z.string(), z.unknown()).parse(p.data),
        });
        message = "Development item assigned.";
        break;
      case "training":
        result = await client.rpc("complete_training", { p_id: id.parse(p.id) });
        message = "Learning marked complete.";
        break;
      case "verify-training":
        result = await client.rpc("verify_training", { p_id: id.parse(p.id) });
        message = "Training completion verified.";
        break;
      case "position":
        result = await client.rpc("create_position", {
          p_title: z.string().trim().min(2).max(100).parse(p.title),
          p_department: id.nullable().parse(p.department_id ?? null),
        });
        message = "Position created.";
        break;
      case "recommend":
        result = await client.rpc("recommend_request", {
          p_id: id.parse(p.id),
          p_type: z.enum(["leave", "attendance", "overtime", "planning"]).parse(p.type),
          p_recommendation: z.enum(["Recommended", "Needs discussion"]).parse(p.recommendation),
          p_note: z.string().trim().min(5).max(1000).parse(p.note),
        });
        message = "Recommendation recorded for the final approver.";
        break;
      case "notifications":
        result = await client.rpc("read_notifications");
        message = "Notifications marked as read.";
        break;
      case "personal-read":
        result = await client.rpc("read_personal", { p_employee: id.parse(p.employee_id) });
        break;
      case "personal": {
        const v = z
          .object({
            personal_email: z.union([z.email(), z.literal("")]),
            address: z.string().max(500),
            emergency_name: z.string().max(100),
            emergency_phone: z.string().max(30),
          })
          .parse(p.data);
        result = await client.rpc("save_personal", {
          p_employee: id.parse(p.employee_id),
          p_data: v,
        });
        message = "Your personal information is up to date.";
        break;
      }
      case "sensitive-read":
        result = await client.rpc("read_sensitive", {
          p_employee: id.parse(p.employee_id),
          p_category: z
            .enum(["bank", "government", "medical", "disciplinary", "identity"])
            .parse(p.category),
        });
        break;
      case "sensitive":
        result = await client.rpc("save_sensitive", {
          p_employee: id.parse(p.employee_id),
          p_category: z
            .enum(["bank", "government", "medical", "disciplinary", "identity"])
            .parse(p.category),
          p_data: z.record(z.string(), z.unknown()).parse(p.data),
        });
        break;
      case "account-status":
        result = await client.rpc("set_account_status", {
          p_user: id.parse(p.user_id),
          p_status: z.enum(["active", "suspended", "deactivated"]).parse(p.status),
        });
        message = "Account access updated. Existing sessions have been revoked.";
        break;
      case "role":
        result = await client.rpc("assign_role", {
          p_user: id.parse(p.user_id),
          p_role: z.string().max(100).parse(p.role),
          p_scope: scope.parse(p.scope),
          p_department: id.nullable().parse(p.department_id ?? null),
          p_team: id.nullable().parse(p.team_id ?? null),
        });
        message = "Role template assigned with the selected scope.";
        break;
      case "grant":
        result = await client.rpc("grant_permission", {
          p_user: id.parse(p.user_id),
          p_permission: z.string().max(100).parse(p.permission),
          p_scope: scope.parse(p.scope),
          p_department: id.nullable().parse(p.department_id ?? null),
          p_team: id.nullable().parse(p.team_id ?? null),
        });
        message = "Explicit permission granted.";
        break;
      case "revoke-grant":
        result = await client.rpc("revoke_permission", {
          p_id: id.parse(p.id),
          p_role: z.boolean().parse(p.is_role ?? false),
        });
        message = "Access revoked. The change applies immediately.";
        break;
      case "organization":
        result = await client.rpc("save_organization", {
          p_kind: z
            .enum(["department", "team", "route", "leave_type", "balance", "holiday", "settings"])
            .parse(p.kind),
          p_data: z.record(z.string(), z.unknown()).parse(p.data),
        });
        message = "Organization settings saved.";
        break;
      case "extra-request":
        result = await client.rpc("request_extra", {
          p_kind: z.enum(["overtime", "planning"]).parse(p.kind),
          p_data: z.record(z.string(), z.unknown()).parse(p.data),
        });
        message = "Request submitted to your assigned approver.";
        break;
      case "decide-extra":
        result = await client.rpc("decide_extra", {
          p_kind: z.enum(["overtime", "planning"]).parse(p.kind),
          p_id: id.parse(p.id),
          p_decision: z.enum(["Approved", "Rejected"]).parse(p.decision),
        });
        message = "Request reviewed.";
        break;
      case "invite": {
        const employeeId = id.parse(p.employee_id);
        const { data: allowed } = await client.rpc("has_permission", {
          p_permission: "accounts.manage",
          p_employee: employeeId,
        });
        if (!allowed) throw new HttpError(403, "You do not have account invitation permission.");
        const admin = createSupabaseAdmin();
        const { data: employee } = await admin
          .from("employees")
          .select("email,employment_status")
          .eq("id", employeeId)
          .single();
        if (!employee || employee.employment_status === "Archived")
          throw new HttpError(400, "Choose an active employee record.");
        const { data: existing } = await admin
          .from("accounts")
          .select("id")
          .eq("employee_id", employeeId)
          .maybeSingle();
        if (existing) throw new HttpError(409, "This employee already has an account.");
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
          employee.email,
          { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
        );
        if (inviteError || !invited.user)
          throw new HttpError(
            400,
            "The invitation could not be sent. Check the email service and existing Auth users.",
          );
        result = await client.rpc("link_invitation", {
          p_user: invited.user.id,
          p_employee: employeeId,
        });
        // If linking fails, the invited Auth user has no active application account and no data access.
        message = "Invitation sent. Access begins after account activation.";
        break;
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
    if (result.error) databaseError(result.error);
    return NextResponse.json(
      { ok: true, message, data: result.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof HttpError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues[0]?.message
              : "We couldn’t complete this action. Please try again.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
