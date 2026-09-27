import type { Employee, Grant, Viewer } from "./types";

export const baselinePermissions = [
  "employees.read",
  "profile.update",
  "attendance.read",
  "attendance.clock",
  "leave.read",
  "leave.request",
  "payroll.read",
  "documents.read",
  "performance.read",
  "tasks.read",
  "tasks.complete",
  "training.read",
];

// UI affordances only. PostgreSQL independently checks every operation and record.
export function can(viewer: Viewer, permission: string, employee?: Employee) {
  if (employee?.id === viewer.employee_id && baselinePermissions.includes(permission)) return true;
  return viewer.grants.some(
    (grant) =>
      grant.permission === permission && (!employee || scopeIncludes(grant, viewer, employee)),
  );
}
export function scopeIncludes(grant: Grant, viewer: Viewer, employee: Employee) {
  switch (grant.scope) {
    case "company":
      return true;
    case "own":
      return employee.id === viewer.employee_id;
    case "direct_reports":
      return employee.manager_id === viewer.employee_id;
    case "team":
      return !!grant.team_id && employee.team_id === grant.team_id;
    case "department":
      return !!grant.department_id && employee.department_id === grant.department_id;
    default:
      return false;
  }
}
export const permissionLabels: Record<string, string> = {
  "employees.read": "View work profiles",
  "employees.manage": "Manage employee lifecycle",
  "private.read": "Read private personal information",
  "private.write": "Maintain private personal information",
  "workforce.summary": "View workforce summaries",
  "planning.manage": "Workforce planning",
  "attendance.read": "View attendance",
  "attendance.manage": "Approve attendance corrections",
  "schedules.manage": "Assign schedules",
  "leave.read": "View leave requests",
  "leave.approve": "Approve assigned requests",
  "requests.recommend": "Recommend request decisions",
  "payroll.read": "Read compensation and payslips",
  "payroll.manage": "Create and publish payroll",
  "documents.read": "Read employee documents",
  "documents.manage": "Manage documents and policies",
  "performance.read": "View reviews",
  "performance.manage": "Assign reviews and training",
  "tasks.manage": "Assign work and onboarding",
  "announcements.manage": "Publish announcements",
  "organization.manage": "Manage organization and workflows",
  "access.manage": "Manage explicit access grants",
  "accounts.manage": "Invite and suspend accounts",
  "technical.manage": "Technical configuration",
  "audit.read": "View audit history",
  "recruitment.manage": "Manage recruitment and onboarding",
  "sensitive.bank.read": "Read bank information",
  "sensitive.bank.write": "Update bank information",
  "sensitive.government.read": "Read government identifiers",
  "sensitive.government.write": "Update government identifiers",
  "sensitive.medical.read": "Read medical records",
  "sensitive.medical.write": "Update medical records",
  "sensitive.disciplinary.read": "Read disciplinary records",
  "sensitive.disciplinary.write": "Update disciplinary records",
  "sensitive.identity.read": "Read identity documents",
  "sensitive.identity.write": "Update identity documents",
};
export const roleTemplates: Record<string, { scope: string; permissions: string[]; note: string }> =
  {
    Owner: {
      scope: "company",
      permissions: [
        "workforce.summary",
        "planning.manage",
        "organization.manage",
        "access.manage",
        "audit.read",
      ],
      note: "Governance and access administration. Confidential HR and payroll require additional grants.",
    },
    President: {
      scope: "company",
      permissions: ["workforce.summary", "planning.manage", "leave.approve"],
      note: "Executive approvals require a separate approval assignment.",
    },
    "Vice-President": {
      scope: "department",
      permissions: ["workforce.summary", "planning.manage", "leave.approve"],
      note: "Grant each assigned division's departments explicitly.",
    },
    CEO: {
      scope: "company",
      permissions: ["workforce.summary", "planning.manage", "leave.approve"],
      note: "Strategic metrics and designated executive approvals.",
    },
    COO: {
      scope: "department",
      permissions: [
        "workforce.summary",
        "attendance.read",
        "attendance.manage",
        "schedules.manage",
        "leave.approve",
      ],
      note: "Assigned business units only.",
    },
    CFO: {
      scope: "company",
      permissions: ["workforce.summary", "planning.manage"],
      note: "Compensation budgets use planning records. Payroll review needs an explicit payroll.read grant. No medical or disciplinary access.",
    },
    CMO: {
      scope: "department",
      permissions: [
        "workforce.summary",
        "employees.read",
        "planning.manage",
        "leave.read",
        "leave.approve",
      ],
      note: "Assigned marketing department or teams.",
    },
    Director: {
      scope: "department",
      permissions: [
        "workforce.summary",
        "employees.read",
        "planning.manage",
        "performance.read",
        "leave.read",
        "leave.approve",
      ],
      note: "Assigned departments only.",
    },
    Managerial: {
      scope: "team",
      permissions: [
        "workforce.summary",
        "employees.read",
        "attendance.read",
        "attendance.manage",
        "leave.read",
        "leave.approve",
        "performance.read",
        "performance.manage",
        "tasks.manage",
      ],
      note: "Assigned teams; approver assignments remain explicit.",
    },
    Supervisor: {
      scope: "direct_reports",
      permissions: ["employees.read", "attendance.read", "schedules.manage", "requests.recommend"],
      note: "No final approval permission by default.",
    },
    Specialist: {
      scope: "own",
      permissions: [],
      note: "Self-service and assigned tasks; functional privileges are separate.",
    },
    "Rank & File": { scope: "own", permissions: [], note: "Self-service and assigned work tasks." },
    Janitorial: {
      scope: "own",
      permissions: [],
      note: "Own locations, shifts, and cleaning checklists.",
    },
    "Skilled & Labor": {
      scope: "own",
      permissions: [],
      note: "Own work, safety training, and certifications.",
    },
    "Intern / Trainee": {
      scope: "own",
      permissions: [],
      note: "Own learning plan, onboarding, and mentor feedback.",
    },
    Others: {
      scope: "own",
      permissions: [],
      note: "Custom job title; self-service unless explicitly extended.",
    },
    "HR Administrator": {
      scope: "company",
      permissions: [
        "employees.read",
        "employees.manage",
        "private.read",
        "private.write",
        "workforce.summary",
        "attendance.read",
        "attendance.manage",
        "schedules.manage",
        "leave.read",
        "leave.approve",
        "documents.read",
        "documents.manage",
        "performance.read",
        "performance.manage",
        "tasks.manage",
        "announcements.manage",
        "organization.manage",
        "audit.read",
      ],
      note: "Sensitive categories, access management, and payroll are separate.",
    },
    "HR Officer": {
      scope: "department",
      permissions: [
        "employees.read",
        "employees.manage",
        "private.read",
        "private.write",
        "attendance.read",
        "leave.read",
        "documents.read",
        "documents.manage",
        "tasks.manage",
      ],
      note: "Scoped HR maintenance. No implicit final approval or payroll access.",
    },
    "Payroll Administrator": {
      scope: "company",
      permissions: ["employees.read", "payroll.read", "payroll.manage"],
      note: "Bank information is a separate grant.",
    },
    "Recruitment Officer": {
      scope: "department",
      permissions: ["employees.read", "recruitment.manage", "tasks.manage", "performance.manage"],
      note: "Recruitment and onboarding; no general private personnel access.",
    },
    "Technical Administrator": {
      scope: "company",
      permissions: ["accounts.manage", "technical.manage"],
      note: "Account operations only. No confidential records or permission grants.",
    },
  };
