export const profileTypes = [
  "Owner",
  "President",
  "Vice-President",
  "CEO",
  "COO",
  "CFO",
  "CMO",
  "Director",
  "Managerial",
  "Supervisor",
  "Specialist",
  "Rank & File",
  "Janitorial",
  "Skilled & Labor",
  "Intern / Trainee",
  "Others",
] as const;
export const functionalRoles = [
  "HR Administrator",
  "HR Officer",
  "Payroll Administrator",
  "Recruitment Officer",
  "Technical Administrator",
] as const;
export type ProfileType = (typeof profileTypes)[number];
export type Scope = "own" | "direct_reports" | "team" | "department" | "company";
export type Grant = {
  permission: string;
  scope: Scope;
  team_id?: string | null;
  department_id?: string | null;
};
export type Employee = {
  id: string;
  employee_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  profile_type: string;
  department_id: string;
  team_id: string | null;
  manager_id: string | null;
  employment_status: string;
  start_date: string;
  location: string;
  avatar_color: string;
  photo_path?: string | null;
};
export type Department = { id: string; name: string; color: string; parent_id: string | null };
export type Team = { id: string; name: string; department_id: string };
export type Viewer = {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  job_title: string;
  profile_type: string;
  roles: string[];
  grants: Grant[];
  mfa_required: boolean;
  status: string;
  session_valid: boolean;
  aal: string;
};
export type Attendance = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  note: string | null;
};
export type Schedule = {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  location: string;
};
export type Correction = {
  id: string;
  employee_id: string;
  attendance_id: string;
  requested_in: string;
  requested_out: string | null;
  reason: string;
  status: string;
  approver_id: string | null;
  created_at: string;
};
export type LeaveType = { id: string; name: string; color: string; annual_allowance: number };
export type LeaveBalance = {
  employee_id: string;
  leave_type_id: string;
  year: number;
  allowance: number;
  used: number;
  pending: number;
};
export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: string;
  approver_id: string | null;
  delegate_id: string | null;
  decision_note: string | null;
  created_at: string;
};
export type Payslip = {
  id: string;
  employee_id: string;
  period: string;
  basic_pay: number;
  allowances: number;
  deductions: number;
  currency: string;
  status: string;
  published_at: string | null;
};
export type Document = {
  id: string;
  title: string;
  category: string;
  employee_id: string | null;
  department_id: string | null;
  storage_path: string;
  requires_ack: boolean;
  created_at: string;
  file_size: number;
};
export type Acknowledgement = { document_id: string; employee_id: string; acknowledged_at: string };
export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  department_id: string | null;
  author_id: string;
  created_at: string;
};
export type Review = {
  id: string;
  employee_id: string;
  reviewer_id: string;
  cycle: string;
  due_date: string;
  status: string;
  feedback: string | null;
  employee_feedback: string | null;
  rating: number | null;
};
export type Task = {
  id: string;
  employee_id: string;
  title: string;
  category: string;
  due_date: string;
  completed: boolean;
  description: string;
};
export type Training = {
  id: string;
  employee_id: string;
  title: string;
  category: string;
  status: string;
  completed_at: string | null;
  expires_at: string | null;
};
export type Notification = {
  id: string;
  employee_id: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};
export type Event = {
  id: string;
  title: string;
  event_date: string;
  time_label: string;
  category: string;
  department_id: string | null;
};
export type AuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
};
export type ApprovalRoute = {
  id: string;
  department_id: string;
  request_type: string;
  approver_id: string;
  delegate_id: string | null;
  delegate_until: string | null;
};
export type Account = { id: string; employee_id: string; status: string; created_at: string };
export type WorkforceSummary = {
  total: number;
  active: number;
  on_leave: number;
  departments: { name: string; count: number; color: string }[];
};
export type ExtraRequest = {
  id: string;
  employee_id: string;
  status: string;
  reason: string;
  approver_id: string | null;
  created_at: string;
  work_date?: string;
  hours?: number;
  title?: string;
  headcount?: number;
  budget?: number | null;
  department_id?: string;
};
export type Recommendation = {
  id: string;
  request_id: string;
  request_type: string;
  employee_id: string;
  recommended_by: string;
  recommendation: string;
  note: string;
  created_at: string;
};
export type Candidate = {
  id: string;
  full_name: string;
  email: string;
  position_title: string;
  department_id: string;
  stage: string;
  notes: string;
  hired_employee_id: string | null;
  created_at: string;
};
export type WorkspaceData = {
  viewer: Viewer;
  employees: Employee[];
  departments: Department[];
  teams: Team[];
  attendance: Attendance[];
  schedules: Schedule[];
  corrections: Correction[];
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  leaves: LeaveRequest[];
  payslips: Payslip[];
  documents: Document[];
  acknowledgements: Acknowledgement[];
  announcements: Announcement[];
  reviews: Review[];
  tasks: Task[];
  training: Training[];
  notifications: Notification[];
  events: Event[];
  audit: AuditEvent[];
  accounts: Account[];
  routes: ApprovalRoute[];
  summary: WorkforceSummary;
  isDemo: boolean;
  organization: { company_name: string; timezone: string; currency: string };
  overtime: ExtraRequest[];
  planning: ExtraRequest[];
  recommendations: Recommendation[];
  candidates: Candidate[];
  positions: { id: string; title: string; department_id: string | null }[];
  holidays: { holiday_date: string; name: string }[];
};
export type ActionResult = { ok: boolean; message: string; data?: unknown };
