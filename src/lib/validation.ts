import { z } from "zod";
import { profileTypes } from "./types";

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use no more than 128 characters.");
export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});
export const dateSchema = z.iso.date();
export const employeeSchema = z.object({
  id: z.uuid().optional(),
  full_name: z.string().trim().min(2).max(100),
  employee_number: z.string().trim().min(2).max(30),
  email: z.email().max(254),
  phone: z.string().max(30).nullable().optional(),
  job_title: z.string().trim().min(2).max(100),
  profile_type: z.enum(profileTypes),
  department_id: z.uuid(),
  team_id: z.uuid().nullable().optional(),
  manager_id: z.uuid().nullable().optional(),
  employment_status: z.enum(["Active", "On leave", "Probation", "Archived"]),
  start_date: dateSchema,
  location: z.string().trim().min(2).max(100),
});
export const leaveSchema = z
  .object({
    leave_type_id: z.uuid(),
    start_date: dateSchema,
    end_date: dateSchema,
    reason: z
      .string()
      .trim()
      .min(5, "Please add a short reason (at least 5 characters).")
      .max(1000),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must be on or after the start date.",
    path: ["end_date"],
  });
export const payrollSchema = z
  .object({
    employee_id: z.uuid(),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM."),
    basic_pay: z.coerce.number().min(0).max(100000000),
    allowances: z.coerce.number().min(0).max(100000000),
    deductions: z.coerce.number().min(0).max(100000000),
    currency: z.enum(["PHP", "USD", "EUR", "GBP"]),
  })
  .refine((v) => v.deductions <= v.basic_pay + v.allowances, {
    message: "Deductions cannot exceed gross pay.",
    path: ["deductions"],
  });
export const actionSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export function errorMessage(error: unknown) {
  return error instanceof z.ZodError
    ? (error.issues[0]?.message ?? "Check the form fields.")
    : "We couldn’t complete that action. Please try again.";
}
