create table public.candidates (
  id uuid primary key default gen_random_uuid(),full_name text not null check(length(full_name) between 2 and 100),email text not null,
  position_title text not null check(length(position_title) between 2 and 100),department_id uuid not null references public.departments(id),
  stage text not null default 'Applied' check(stage in('Applied','Screening','Interview','Offer','Hired','Not proceeding')),
  notes text not null default '' check(length(notes)<=3000),hired_employee_id uuid unique references public.employees(id),created_at timestamptz not null default now()
);
alter table public.candidates enable row level security;
revoke all on public.candidates from public,anon,authenticated;
grant all on public.candidates to service_role;
create or replace function public.list_candidates() returns setof public.candidates language plpgsql security definer set search_path='' as $$
begin
  perform public.require_active();
  insert into public.audit_events(actor_id,action,resource_type,resource_id) select auth.uid(),'recruitment.read','candidate',id from public.candidates where public.department_permission('recruitment.manage',department_id);
  return query select * from public.candidates where public.department_permission('recruitment.manage',department_id) order by created_at desc limit 500;
end; $$;
create or replace function public.save_candidate(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=nullif(p_data->>'id','')::uuid;dept uuid:=(p_data->>'department_id')::uuid;old public.candidates;hired uuid:=nullif(p_data->>'hired_employee_id','')::uuid;
begin
  if not public.department_permission('recruitment.manage',dept) then raise exception 'Recruitment scope is not authorized.' using errcode='42501';end if;
  if result is not null then
    select * into old from public.candidates where id=result for update;
    if not found or not public.department_permission('recruitment.manage',old.department_id) then raise exception 'Candidate not available.' using errcode='42501';end if;
  end if;
  if hired is not null and (not public.has_permission('employees.read',hired) or not exists(select 1 from public.employees where id=hired and department_id=dept)) then raise exception 'Link an employee in the authorized hiring department.' using errcode='42501';end if;
  if result is null then
    insert into public.candidates(full_name,email,position_title,department_id,stage,notes,hired_employee_id) values(p_data->>'full_name',p_data->>'email',p_data->>'position_title',dept,p_data->>'stage',coalesce(p_data->>'notes',''),hired) returning id into result;
  else
    update public.candidates set full_name=p_data->>'full_name',email=p_data->>'email',position_title=p_data->>'position_title',department_id=dept,stage=p_data->>'stage',notes=coalesce(p_data->>'notes',''),hired_employee_id=hired where id=result;
  end if;
  if p_data->>'stage'='Hired' and hired is not null and old.hired_employee_id is distinct from hired then
    perform public.require_access('tasks.manage',hired);
    insert into public.tasks(employee_id,title,description,category,due_date) values(hired,'Your first week: meet your team','Meet your manager, read the employee handbook, and confirm your profile and emergency contact.','Onboarding',public.company_today()+7);
    perform public.notify_employee(hired,'Welcome to the team','Your first onboarding task is ready in Performance & growth.','/performance');
  end if;
  perform public.log_event('recruitment.saved','candidate',result);return result;
end; $$;
revoke execute on function public.list_candidates(),public.save_candidate(jsonb) from public,anon,authenticated;
grant execute on function public.list_candidates(),public.save_candidate(jsonb) to authenticated,service_role;

-- Account operators may also be restricted to specific organizational scopes.
drop policy accounts_read on public.accounts;
create policy accounts_read on public.accounts for select to authenticated using(public.has_permission('accounts.manage',employee_id) or public.has_permission('access.manage'));
create or replace function public.account_candidates() returns table(id uuid,full_name text,email text,employee_number text) language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_active();
  return query select e.id,e.full_name,e.email,e.employee_number from public.employees e where e.employment_status<>'Archived' and (public.has_permission('accounts.manage',e.id) or public.has_permission('access.manage')) order by e.full_name;
end; $$;
create or replace function public.set_account_status(p_user uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform public.require_active();
  select employee_id into target from public.accounts where id=p_user and status<>'invited' for update;
  if not found then raise exception 'Activate the invitation before changing account status.';end if;
  perform public.require_access('accounts.manage',target);
  if p_user=auth.uid() or p_status not in('active','suspended','deactivated') then raise exception 'Choose another account and a valid status.';end if;
  if p_status='active' and exists(select 1 from public.employees where id=target and employment_status='Archived') then raise exception 'Restore the employee record before reactivating the account.';end if;
  update public.accounts set status=p_status::public.account_status,revoked_before=now() where id=p_user;
  update public.app_sessions set revoked_at=now() where user_id=p_user;
  perform public.log_event('account.'||p_status,'account',p_user);
end; $$;
create or replace function public.link_invitation(p_user uuid,p_employee uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_access('accounts.manage',p_employee);
  if exists(select 1 from public.accounts where employee_id=p_employee or id=p_user) then raise exception 'This employee already has an account.';end if;
  if not exists(select 1 from public.employees e join auth.users u on lower(u.email)=lower(e.email) where e.id=p_employee and u.id=p_user and e.employment_status<>'Archived') then raise exception 'Invitation must match the employee’s work email.';end if;
  insert into public.accounts(id,employee_id,status) values(p_user,p_employee,'invited');perform public.log_event('account.invited','account',p_user);
end; $$;
