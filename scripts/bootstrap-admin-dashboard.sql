-- One-time setup for the owner of the Supabase project.
-- First create an email/password user in Authentication > Users, with Auto Confirm User enabled.
-- Copy this file into the Supabase SQL Editor and run it as postgres.
-- Edit only the email and name placeholders below. No password or API key belongs in this file.
-- This is an operator script, not a migration or a function exposed to the website.

do $centralhub_bootstrap$
declare
  v_admin_email text := lower(btrim($email$REPLACE_WITH_YOUR_ADMIN_EMAIL$email$));
  v_admin_name text := btrim($name$REPLACE_WITH_YOUR_FULL_NAME$name$);
  v_employee_number text := btrim($number$CH-ADMIN-001$number$);
  v_user auth.users%rowtype;
  v_employee public.employees%rowtype;
  v_department_id uuid;
  v_assignment_id uuid;
  v_template public.role_templates%rowtype;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Run this setup in the Supabase SQL Editor using its postgres role.'
      using errcode = '42501';
  end if;

  if position('@' in v_admin_email) < 2
    or starts_with(v_admin_name, 'REPLACE_WITH_')
    or length(v_admin_name) not between 2 and 100
    or length(v_employee_number) = 0 then
    raise exception 'Replace the admin email and full name placeholders before running this setup.'
      using errcode = '22023';
  end if;

  -- Serialize first-account setup and refuse to replace any existing application account.
  lock table public.accounts in share row exclusive mode;
  if exists (select 1 from public.accounts) then
    raise exception 'CentralHub already has an account. Sign in with the existing administrator and use Administration instead.';
  end if;

  if (select count(*) from public.role_templates
      where name in ('Owner', 'Technical Administrator')) <> 2 then
    raise exception 'The initial role templates are missing. Apply all files in supabase/migrations first.';
  end if;

  if (select count(*) from auth.users where lower(email) = v_admin_email) <> 1 then
    raise exception 'Create this user in Supabase Authentication > Users first, using the same email as this script.';
  end if;
  select * into v_user from auth.users where lower(email) = v_admin_email;

  if v_user.email_confirmed_at is null then
    raise exception 'Confirm this Auth user before setup. Enable Auto Confirm User when creating the initial administrator.';
  end if;
  if v_user.deleted_at is not null or v_user.banned_until > now() then
    raise exception 'The selected Auth user is disabled. Use an active, confirmed Auth user.';
  end if;

  if (select count(*) from public.employees where lower(email) = v_admin_email) > 1 then
    raise exception 'More than one employee uses this email. Resolve those duplicate records before setup.';
  end if;
  select * into v_employee from public.employees where lower(email) = v_admin_email;

  if found then
    if v_employee.employment_status = 'Archived' then
      raise exception 'The employee for this email is archived. This setup does not reactivate archived employees.';
    end if;
    -- Preserve any existing employee's job classification and work-directory details.
  else
    if exists (select 1 from public.employees where employee_number = v_employee_number) then
      raise exception 'The employee number is already in use. Choose another v_employee_number at the top of this script.';
    end if;

    select id into v_department_id from public.departments where name = 'Leadership';
    if v_department_id is null then
      insert into public.departments(name, color)
        values ('Leadership', '#178579') returning id into v_department_id;
    end if;

    insert into public.employees(
      employee_number, full_name, email, job_title, profile_type,
      department_id, employment_status, start_date, location
    ) values (
      v_employee_number, v_admin_name, v_admin_email, 'Company Administrator', 'Owner',
      v_department_id, 'Active', current_date, 'Main office'
    ) returning * into v_employee;
  end if;

  insert into public.accounts(id, employee_id, status)
    values (v_user.id, v_employee.id, 'active');

  for v_template in
    select * from public.role_templates
    where name in ('Owner', 'Technical Administrator') order by name
  loop
    insert into public.role_assignments(user_id, role_name, scope)
      values (v_user.id, v_template.name, 'company') returning id into v_assignment_id;

    insert into public.permission_grants(
      user_id, permission, scope, role_assignment_id, granted_by
    )
      select v_user.id, granted.permission, 'company'::public.access_scope, v_assignment_id, v_user.id
      from unnest(v_template.permissions) as granted(permission);
  end loop;

  insert into public.audit_events(actor_id, action, resource_type, resource_id)
    values (v_user.id, 'system.bootstrap', 'account', v_user.id);
end;
$centralhub_bootstrap$;

-- A successful first setup returns one active account with both explicit role assignments.
select e.employee_number, e.full_name, e.email, a.status,
  array_agg(r.role_name order by r.role_name) as assigned_roles
from public.accounts a
join public.employees e on e.id = a.employee_id
join public.role_assignments r on r.user_id = a.id
group by e.employee_number, e.full_name, e.email, a.status;
