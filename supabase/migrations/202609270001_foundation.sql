-- CentralHub: no privileged role is ever derived from a job title or user metadata.
create type public.access_scope as enum ('own','direct_reports','team','department','company');
create type public.account_status as enum ('invited','active','suspended','deactivated');

create table public.departments (
  id uuid primary key default gen_random_uuid(), name text not null unique check (length(name) between 2 and 100),
  color text not null default '#168078', parent_id uuid references public.departments(id), created_at timestamptz not null default now()
);
create table public.teams (
  id uuid primary key default gen_random_uuid(), name text not null, department_id uuid not null references public.departments(id), unique(name,department_id)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(), employee_number text not null unique,
  full_name text not null check(length(full_name) between 2 and 100), email text not null unique,
  phone text, job_title text not null, profile_type text not null check(profile_type in ('Owner','President','Vice-President','CEO','COO','CFO','CMO','Director','Managerial','Supervisor','Specialist','Rank & File','Janitorial','Skilled & Labor','Intern / Trainee','Others')),
  department_id uuid not null references public.departments(id), team_id uuid references public.teams(id),
  manager_id uuid references public.employees(id), employment_status text not null default 'Active' check(employment_status in ('Active','On leave','Probation','Archived')),
  start_date date not null, location text not null default 'Manila', avatar_color text not null default 'teal', photo_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(manager_id is distinct from id)
);
create index employees_department_idx on public.employees(department_id);
create index employees_team_idx on public.employees(team_id);
create index employees_manager_idx on public.employees(manager_id);
create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade, employee_id uuid not null unique references public.employees(id),
  status public.account_status not null default 'invited', revoked_before timestamptz, created_at timestamptz not null default now()
);
create table public.app_sessions (
  id uuid primary key, user_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '8 hours'), revoked_at timestamptz
);
create index app_sessions_user_idx on public.app_sessions(user_id);
create table public.permissions (
  code text primary key, privileged boolean not null default true
);
insert into public.permissions(code) values
  ('employees.read'),('employees.manage'),('private.read'),('private.write'),('workforce.summary'),('planning.manage'),
  ('attendance.read'),('attendance.manage'),('schedules.manage'),('leave.read'),('leave.approve'),('requests.recommend'),
  ('payroll.read'),('payroll.manage'),('documents.read'),('documents.manage'),('performance.read'),('performance.manage'),
  ('tasks.manage'),('announcements.manage'),('organization.manage'),('access.manage'),('accounts.manage'),('technical.manage'),
  ('audit.read'),('recruitment.manage'),('sensitive.bank.read'),('sensitive.bank.write'),('sensitive.government.read'),('sensitive.government.write'),
  ('sensitive.medical.read'),('sensitive.medical.write'),('sensitive.disciplinary.read'),('sensitive.disciplinary.write'),('sensitive.identity.read'),('sensitive.identity.write');
create table public.role_templates (name text primary key, suggested_scope public.access_scope not null, permissions text[] not null default '{}', description text not null);
create table public.role_assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.accounts(id) on delete cascade,
  role_name text not null references public.role_templates(name), scope public.access_scope not null,
  department_id uuid references public.departments(id), team_id uuid references public.teams(id), created_at timestamptz not null default now(),
  check((scope = 'department') = (department_id is not null)), check((scope = 'team') = (team_id is not null))
);
create table public.permission_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.accounts(id) on delete cascade,
  permission text not null references public.permissions(code), scope public.access_scope not null,
  department_id uuid references public.departments(id), team_id uuid references public.teams(id),
  role_assignment_id uuid references public.role_assignments(id) on delete cascade, granted_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check((scope = 'department') = (department_id is not null)), check((scope = 'team') = (team_id is not null))
);
create index permission_grants_user_idx on public.permission_grants(user_id,permission);

-- Private and highly sensitive fields never share a row with directory fields.
create table public.employee_private (
  employee_id uuid primary key references public.employees(id), personal_email text, address text, emergency_name text, emergency_phone text, updated_at timestamptz not null default now()
);
create table public.sensitive_records (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
  category text not null check(category in ('bank','government','medical','disciplinary','identity')), data jsonb not null,
  updated_at timestamptz not null default now(), unique(employee_id,category)
);
create table public.attendance (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
  work_date date not null, clock_in timestamptz, clock_out timestamptz,
  status text not null default 'Present' check(status in ('Present','Late','Remote','Absent')),
  note text, unique(employee_id,work_date), check(clock_out is null or (clock_in is not null and clock_out > clock_in))
);
create table public.schedules (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), work_date date not null,
  start_time time not null default '09:00', end_time time not null default '18:00', location text not null default 'Main office', unique(employee_id,work_date)
);
create table public.approval_routes (
  id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id),
  request_type text not null check(request_type in ('leave','attendance','overtime','planning')),
  approver_id uuid not null references public.employees(id), delegate_id uuid references public.employees(id), delegate_until date,
  unique(department_id,request_type), check(delegate_id is distinct from approver_id), check((delegate_id is null) = (delegate_until is null))
);
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), attendance_id uuid not null references public.attendance(id),
  requested_in timestamptz not null, requested_out timestamptz, reason text not null check(length(reason) between 5 and 1000),
  status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')), approver_id uuid references public.employees(id),
  delegate_id uuid references public.employees(id), delegate_until date, decision_note text, created_at timestamptz not null default now(),
  check(requested_out is null or requested_out > requested_in)
);
create unique index correction_pending_idx on public.attendance_corrections(attendance_id) where status = 'Pending';
create table public.attendance_history (
  id uuid primary key default gen_random_uuid(), attendance_id uuid not null references public.attendance(id), employee_id uuid not null references public.employees(id),
  old_in timestamptz, old_out timestamptz, new_in timestamptz, new_out timestamptz, changed_by uuid not null references auth.users(id), changed_at timestamptz not null default now()
);
create table public.leave_types (
  id uuid primary key default gen_random_uuid(), name text not null unique, color text not null default 'teal', annual_allowance numeric(6,1) not null check(annual_allowance >= 0)
);
create table public.leave_balances (
  employee_id uuid not null references public.employees(id), leave_type_id uuid not null references public.leave_types(id), year int not null,
  allowance numeric(6,1) not null check(allowance >= 0), used numeric(6,1) not null default 0 check(used >= 0), pending numeric(6,1) not null default 0 check(pending >= 0),
  primary key(employee_id,leave_type_id,year), check(used+pending <= allowance)
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), leave_type_id uuid not null references public.leave_types(id),
  start_date date not null, end_date date not null, days numeric(6,1) not null check(days > 0), reason text not null check(length(reason) between 5 and 1000),
  status text not null default 'Pending' check(status in ('Pending','Approved','Rejected','Cancelled')),
  approver_id uuid references public.employees(id), delegate_id uuid references public.employees(id), delegate_until date,
  decision_note text, decided_by uuid references public.employees(id), created_at timestamptz not null default now(),
  check(end_date >= start_date), check(extract(year from start_date) = extract(year from end_date))
);
create index leave_requests_employee_idx on public.leave_requests(employee_id,start_date,end_date);
create table public.payslips (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  basic_pay numeric(14,2) not null check(basic_pay >= 0), allowances numeric(14,2) not null default 0 check(allowances >= 0), deductions numeric(14,2) not null default 0 check(deductions >= 0),
  currency text not null default 'PHP' check(currency in ('PHP','USD','EUR','GBP')),
  status text not null default 'Draft' check(status in ('Draft','Published')), published_at timestamptz, created_by uuid references auth.users(id),
  unique(employee_id,period), check(deductions <= basic_pay+allowances), check((status = 'Published') = (published_at is not null))
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 2 and 200),
  category text not null check(category in ('company','personnel','bank','government','medical','disciplinary','identity')),
  employee_id uuid references public.employees(id), department_id uuid references public.departments(id),
  storage_path text not null unique, requires_ack boolean not null default false, file_size bigint not null default 0 check(file_size between 0 and 10485760),
  created_at timestamptz not null default now(), check((category = 'company') = (employee_id is null))
);
create table public.document_acknowledgements (
  document_id uuid not null references public.documents(id), employee_id uuid not null references public.employees(id), acknowledged_at timestamptz not null default now(), primary key(document_id,employee_id)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 3 and 160), body text not null check(length(body) between 5 and 5000),
  category text not null default 'Company news', pinned boolean not null default false, department_id uuid references public.departments(id),
  author_id uuid not null references public.employees(id), created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), reviewer_id uuid not null references public.employees(id),
  cycle text not null, due_date date not null, status text not null default 'In progress' check(status in ('In progress','Completed')),
  feedback text, employee_feedback text, rating integer check(rating between 1 and 5), check(reviewer_id <> employee_id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), title text not null, description text not null default '',
  category text not null default 'Work', due_date date not null, completed boolean not null default false
);
create table public.training (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), title text not null,
  category text not null default 'Learning', status text not null default 'Assigned' check(status in ('Assigned','In progress','Completed')),
  completed_at timestamptz, expires_at date
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), title text not null, body text not null,
  href text not null default '/', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(), title text not null, event_date date not null, time_label text not null,
  category text not null default 'Company', department_id uuid references public.departments(id)
);
create table public.planning_requests (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), department_id uuid not null references public.departments(id),
  title text not null, headcount integer not null check(headcount between 1 and 1000), budget numeric(14,2) check(budget >= 0),
  reason text not null, status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')), approver_id uuid references public.employees(id), created_at timestamptz not null default now()
);
create table public.overtime_requests (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), work_date date not null,
  hours numeric(4,1) not null check(hours > 0 and hours <= 16), reason text not null, status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
  approver_id uuid references public.employees(id), created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), action text not null, resource_type text not null,
  resource_id uuid, created_at timestamptz not null default now()
);
create index audit_events_created_idx on public.audit_events(created_at desc);
create table public.auth_rate_limits (key_hash text primary key, window_start timestamptz not null default now(), attempts int not null default 1);
create table public.recovery_tickets (token_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade, purpose text not null check(purpose in ('recovery','invite')), expires_at timestamptz not null default(now()+interval '15 minutes'), consumed_at timestamptz);

create or replace function public.my_employee_id() returns uuid language sql stable security definer set search_path = '' as $$
  select employee_id from public.accounts where id = auth.uid();
$$;
create or replace function public.requires_mfa() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.permission_grants g join public.permissions p on p.code=g.permission where g.user_id=auth.uid() and p.privileged);
$$;
create or replace function public.session_valid() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.accounts a join public.app_sessions s on s.user_id=a.id
    where a.id=auth.uid() and a.status='active' and s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.revoked_at is null and s.expires_at>now() and (a.revoked_before is null or to_timestamp((auth.jwt()->>'iat')::double precision)>a.revoked_before));
$$;
create or replace function public.active_access() returns boolean language sql stable security definer set search_path = '' as $$
  select public.session_valid() and (not public.requires_mfa() or coalesce(auth.jwt()->>'aal','aal1')='aal2');
$$;
create or replace function public.has_permission(p_permission text, p_employee uuid default null) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare e public.employees; me uuid;
begin
  if not public.active_access() then return false; end if;
  me := public.my_employee_id();
  if p_employee = me and p_permission = any(array['employees.read','profile.update','attendance.read','attendance.clock','leave.read','leave.request','payroll.read','documents.read','performance.read','tasks.read','tasks.complete','training.read']) then return true; end if;
  if p_employee is not null then select * into e from public.employees where id=p_employee; if not found then return false; end if; end if;
  return exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.permission=p_permission and
    (g.scope='company' or (g.scope='own' and p_employee=me) or (g.scope='direct_reports' and e.manager_id=me)
      or (g.scope='team' and e.team_id=g.team_id) or (g.scope='department' and e.department_id=g.department_id)));
end; $$;
create or replace function public.department_permission(p_permission text,p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.active_access() and exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.permission=p_permission and (g.scope='company' or (g.scope='department' and g.department_id=p_department)));
$$;
create or replace function public.log_event(p_action text,p_type text,p_id uuid default null) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events(actor_id,action,resource_type,resource_id) values(auth.uid(),p_action,p_type,p_id);
$$;
create or replace function public.register_session() returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if sid is null or not exists(select 1 from public.accounts where id=auth.uid() and status='active' and (revoked_before is null or to_timestamp((auth.jwt()->>'iat')::double precision)>revoked_before)) then raise exception 'Account is not active.' using errcode='42501'; end if;
  insert into public.app_sessions(id,user_id) values(sid,auth.uid()) on conflict(id) do nothing;
  if not public.session_valid() then raise exception 'Your session has expired. Please sign in again.' using errcode='42501'; end if;
end; $$;
create or replace function public.account_context() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts; e public.employees;
begin
  select * into a from public.accounts where id=auth.uid();
  if not found then return null; end if;
  select * into e from public.employees where id=a.employee_id;
  return jsonb_build_object('id',a.id,'employee_id',a.employee_id,'name',e.full_name,'email',e.email,'job_title',e.job_title,'profile_type',e.profile_type,
    'status',a.status,'mfa_required',public.requires_mfa(),'session_valid',public.session_valid(),'aal',coalesce(auth.jwt()->>'aal','aal1'),
    'roles',coalesce((select jsonb_agg(role_name) from public.role_assignments where user_id=a.id),'[]'::jsonb),
    'grants',case when public.active_access() then coalesce((select jsonb_agg(jsonb_build_object('permission',permission,'scope',scope,'department_id',department_id,'team_id',team_id)) from public.permission_grants where user_id=a.id),'[]'::jsonb) else '[]'::jsonb end);
end; $$;
create or replace function public.revoke_session() returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.app_sessions set revoked_at=now() where user_id=auth.uid() and id=nullif(auth.jwt()->>'session_id','')::uuid;
  perform public.log_event('session.logout','account',auth.uid());
end; $$;

-- Only the server's Auth helper may issue or consume tickets and rate-limit keys.
create or replace function public.check_auth_rate_limit(p_key_hash text) returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.auth_rate_limits where window_start < now()-interval '1 day';
  insert into public.auth_rate_limits(key_hash) values(p_key_hash)
    on conflict(key_hash) do update set attempts=case when public.auth_rate_limits.window_start<now()-interval '15 minutes' then 1 else public.auth_rate_limits.attempts+1 end,
      window_start=case when public.auth_rate_limits.window_start<now()-interval '15 minutes' then now() else public.auth_rate_limits.window_start end returning attempts into n;
  return n<=8;
end; $$;
