create or replace function public.can_read_document(p_id uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare d public.documents; my_dept uuid;
begin
  if not public.active_access() then return false; end if;
  select * into d from public.documents where id=p_id; if not found then return false; end if;
  select department_id into my_dept from public.employees where id=public.my_employee_id();
  if d.category='company' then return d.department_id is null or d.department_id=my_dept or public.department_permission('documents.read',d.department_id); end if;
  if d.category='personnel' then return public.has_permission('documents.read',d.employee_id); end if;
  return public.has_permission('sensitive.'||d.category||'.read',d.employee_id);
end; $$;
create or replace function public.download_document(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  if not public.can_read_document(p_id) then raise exception 'Document not available.' using errcode='42501'; end if;
  select * into d from public.documents where id=p_id;
  perform public.log_event('document.download','document',p_id); return to_jsonb(d);
end; $$;
create or replace function public.register_document(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid:=nullif(p_data->>'employee_id','')::uuid; dept uuid:=nullif(p_data->>'department_id','')::uuid; category text:=p_data->>'category'; result uuid:=gen_random_uuid();
begin
  perform public.require_active();
  if category='company' then
    if dept is null then perform public.require_access('documents.manage');
    elsif not public.department_permission('documents.manage',dept) then raise exception 'Document scope is not authorized.' using errcode='42501'; end if;
  elsif category='personnel' then perform public.require_access('documents.manage',target);
  else perform public.require_access('sensitive.'||category||'.write',target); end if;
  insert into public.documents(id,title,category,employee_id,department_id,storage_path,requires_ack,file_size)
    values(result,p_data->>'title',category,target,dept,result::text||'/'||result::text||'.'||(p_data->>'extension'),coalesce((p_data->>'requires_ack')::boolean,false),(p_data->>'file_size')::bigint);
  perform public.log_event('document.uploaded','document',result); return result;
end; $$;
create or replace function public.acknowledge_document(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_document(p_id) then raise exception 'Document not available.' using errcode='42501'; end if;
  if not exists(select 1 from public.documents where id=p_id and requires_ack) then raise exception 'This document does not require acknowledgement.'; end if;
  insert into public.document_acknowledgements(document_id,employee_id) values(p_id,public.my_employee_id()) on conflict do nothing;
  perform public.log_event('document.acknowledged','document',p_id);
end; $$;
create or replace function public.publish_announcement(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare dept uuid:=nullif(p_data->>'department_id','')::uuid; result uuid;
begin
  if dept is null then perform public.require_access('announcements.manage');
  elsif not public.department_permission('announcements.manage',dept) then raise exception 'Announcement scope is not authorized.' using errcode='42501'; end if;
  insert into public.announcements(title,body,category,pinned,department_id,author_id)
    values(p_data->>'title',p_data->>'body',p_data->>'category',coalesce((p_data->>'pinned')::boolean,false),dept,public.my_employee_id()) returning id into result;
  perform public.log_event('announcement.published','announcement',result); return result;
end; $$;
create or replace function public.read_notifications() returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active(); update public.notifications set read_at=now() where employee_id=public.my_employee_id() and read_at is null;
end; $$;

create or replace function public.workforce_summary() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_active();
  with visible as (select * from public.employees where public.has_permission('workforce.summary',id) and employment_status<>'Archived'),
  depts as (select d.name,d.color,count(v.id) as count from visible v join public.departments d on d.id=v.department_id group by d.id)
  select jsonb_build_object('total',(select count(*) from visible),'active',(select count(*) from visible where employment_status in ('Active','Probation')),
    'on_leave',(select count(distinct employee_id) from public.leave_requests where status='Approved' and public.company_today() between start_date and end_date and employee_id in (select id from visible)),
    'departments',coalesce((select jsonb_agg(to_jsonb(depts)) from depts),'[]'::jsonb)) into result;
  return result;
end; $$;

create or replace function public.set_account_status(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  perform public.require_access('accounts.manage');
  if p_user=auth.uid() or p_status not in ('active','suspended','deactivated') then raise exception 'Choose another account and a valid status.'; end if;
  select employee_id into target from public.accounts where id=p_user and status<>'invited' for update;
  if not found then raise exception 'Activate the invitation before changing account status.'; end if;
  if p_status='active' and exists(select 1 from public.employees where id=target and employment_status='Archived') then raise exception 'Restore the employee record before reactivating the account.'; end if;
  update public.accounts set status=p_status::public.account_status,revoked_before=now() where id=p_user;
  update public.app_sessions set revoked_at=now() where user_id=p_user;
  perform public.log_event('account.'||p_status,'account',p_user);
end; $$;
create or replace function public.link_invitation(p_user uuid,p_employee uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_access('accounts.manage');
  if exists(select 1 from public.accounts where employee_id=p_employee or id=p_user) then raise exception 'This employee already has an account.'; end if;
  if not exists(select 1 from public.employees e join auth.users u on lower(u.email)=lower(e.email) where e.id=p_employee and u.id=p_user and e.employment_status<>'Archived') then raise exception 'Invitation must match the employee’s work email.'; end if;
  insert into public.accounts(id,employee_id,status) values(p_user,p_employee,'invited');
  perform public.log_event('account.invited','account',p_user);
end; $$;

create or replace function public.assign_role(p_user uuid,p_role text,p_scope public.access_scope,p_department uuid default null,p_team uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare assignment uuid; template public.role_templates; perm text;
begin
  perform public.require_access('access.manage');
  select * into template from public.role_templates where name=p_role;
  if not found then raise exception 'Unknown role template.'; end if;
  if exists(select 1 from public.role_assignments where user_id=p_user and role_name=p_role and scope=p_scope and department_id is not distinct from p_department and team_id is not distinct from p_team) then raise exception 'This role and scope are already assigned.'; end if;
  insert into public.role_assignments(user_id,role_name,scope,department_id,team_id) values(p_user,p_role,p_scope,p_department,p_team) returning id into assignment;
  foreach perm in array template.permissions loop
    insert into public.permission_grants(user_id,permission,scope,department_id,team_id,role_assignment_id,granted_by) values(p_user,perm,p_scope,p_department,p_team,assignment,auth.uid());
  end loop;
  perform public.log_event('access.role_assigned','account',p_user); return assignment;
end; $$;
create or replace function public.grant_permission(p_user uuid,p_permission text,p_scope public.access_scope,p_department uuid default null,p_team uuid default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_access('access.manage');
  insert into public.permission_grants(user_id,permission,scope,department_id,team_id,granted_by) values(p_user,p_permission,p_scope,p_department,p_team,auth.uid());
  perform public.log_event('access.permission_granted','account',p_user);
end; $$;
create or replace function public.revoke_permission(p_id uuid,p_role boolean default false) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_access('access.manage');
  if p_role then delete from public.role_assignments where id=p_id; else delete from public.permission_grants where id=p_id; end if;
  perform public.log_event('access.revoked',case when p_role then 'role_assignment' else 'permission_grant' end,p_id);
end; $$;
create or replace function public.save_organization(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform public.require_access('organization.manage');
  if p_kind='department' then
    insert into public.departments(name,color,parent_id) values(trim(p_data->>'name'),coalesce(p_data->>'color','#168078'),nullif(p_data->>'parent_id','')::uuid) returning id into result;
  elsif p_kind='team' then
    insert into public.teams(name,department_id) values(trim(p_data->>'name'),(p_data->>'department_id')::uuid) returning id into result;
  elsif p_kind='route' then
    if not exists(select 1 from public.accounts where employee_id=(p_data->>'approver_id')::uuid and status='active') then raise exception 'Approver must have an active account.'; end if;
    insert into public.approval_routes(department_id,request_type,approver_id,delegate_id,delegate_until)
      values((p_data->>'department_id')::uuid,p_data->>'request_type',(p_data->>'approver_id')::uuid,nullif(p_data->>'delegate_id','')::uuid,nullif(p_data->>'delegate_until','')::date)
      on conflict(department_id,request_type) do update set approver_id=excluded.approver_id,delegate_id=excluded.delegate_id,delegate_until=excluded.delegate_until returning id into result;
  elsif p_kind='leave_type' then
    insert into public.leave_types(name,annual_allowance,color) values(trim(p_data->>'name'),(p_data->>'annual_allowance')::numeric,coalesce(p_data->>'color','teal')) returning id into result;
    insert into public.leave_balances(employee_id,leave_type_id,year,allowance) select id,result,extract(year from public.company_today())::int,(p_data->>'annual_allowance')::numeric from public.employees where employment_status<>'Archived';
  elsif p_kind='balance' then
    insert into public.leave_balances(employee_id,leave_type_id,year,allowance) values((p_data->>'employee_id')::uuid,(p_data->>'leave_type_id')::uuid,(p_data->>'year')::int,(p_data->>'allowance')::numeric)
      on conflict(employee_id,leave_type_id,year) do update set allowance=excluded.allowance;
    result:=(p_data->>'employee_id')::uuid;
  elsif p_kind='holiday' then
    insert into public.holidays(holiday_date,name) values((p_data->>'date')::date,trim(p_data->>'name')) on conflict(holiday_date) do update set name=excluded.name;
  elsif p_kind='settings' then
    if not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') then raise exception 'Choose a valid IANA timezone.'; end if;
    update public.organization_settings set company_name=left(p_data->>'company_name',100),timezone=p_data->>'timezone',currency=p_data->>'currency';
  else raise exception 'Unknown organization action.'; end if;
  perform public.log_event('organization.'||p_kind||'_saved',p_kind,result); return result;
end; $$;

create or replace function public.request_extra(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); route public.approval_routes; result uuid; dept uuid;
begin
  perform public.require_active(); select department_id into dept from public.employees where id=me;
  if length(trim(p_data->>'reason')) not between 5 and 1000 then raise exception 'Enter a reason between 5 and 1,000 characters.'; end if;
  route:=public.approval_route_for(me,p_kind);
  if p_kind='overtime' then
    insert into public.overtime_requests(employee_id,work_date,hours,reason,approver_id) values(me,(p_data->>'work_date')::date,(p_data->>'hours')::numeric,p_data->>'reason',route.approver_id) returning id into result;
  elsif p_kind='planning' then
    perform public.require_access('planning.manage',me);
    insert into public.planning_requests(employee_id,department_id,title,headcount,budget,reason,approver_id) values(me,dept,p_data->>'title',(p_data->>'headcount')::int,nullif(p_data->>'budget','')::numeric,p_data->>'reason',route.approver_id) returning id into result;
  else raise exception 'Unknown request.'; end if;
  perform public.notify_employee(route.approver_id,'A '||p_kind||' request needs review','Open your approvals to review the request.','/approvals');
  perform public.log_event(p_kind||'.requested',p_kind,result); return result;
end; $$;
create or replace function public.decide_extra(p_kind text,p_id uuid,p_decision text) returns void language plpgsql security definer set search_path = '' as $$
declare emp uuid; approver uuid; state text;
begin
  perform public.require_active();
  if p_kind='overtime' then select employee_id,approver_id,status into emp,approver,state from public.overtime_requests where id=p_id for update;
  elsif p_kind='planning' then select employee_id,approver_id,status into emp,approver,state from public.planning_requests where id=p_id for update;
  else raise exception 'Unknown request.'; end if;
  if emp is null or emp=public.my_employee_id() or approver is distinct from public.my_employee_id() then raise exception 'You cannot approve this request.' using errcode='42501'; end if;
  perform public.require_access(case when p_kind='planning' then 'planning.manage' else 'leave.approve' end,emp);
  if state<>'Pending' or p_decision not in ('Approved','Rejected') then raise exception 'Invalid request decision.'; end if;
  if p_kind='overtime' then update public.overtime_requests set status=p_decision where id=p_id; else update public.planning_requests set status=p_decision where id=p_id; end if;
  perform public.notify_employee(emp,'Your request was '||lower(p_decision),'Open Approvals for the updated status.','/approvals');
  perform public.log_event(p_kind||'.'||lower(p_decision),p_kind,p_id);
end; $$;

-- Service-role-only recovery lifecycle; ticket material is generated by the Next.js server.
create or replace function public.issue_recovery_ticket(p_hash text,p_user uuid,p_purpose text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.accounts where id=p_user and ((p_purpose='recovery' and status='active') or (p_purpose='invite' and status='invited'))) then raise exception 'Account is not available.' using errcode='42501'; end if;
  delete from public.recovery_tickets where user_id=p_user or expires_at<now();
  insert into public.recovery_tickets(token_hash,user_id,purpose) values(p_hash,p_user,p_purpose);
end; $$;
create or replace function public.consume_recovery_ticket(p_hash text,p_user uuid) returns text language plpgsql security definer set search_path = '' as $$
declare ticket public.recovery_tickets;
begin
  select * into ticket from public.recovery_tickets where token_hash=p_hash and user_id=p_user and consumed_at is null and expires_at>now() for update;
  if not found then raise exception 'This link has expired or has already been used.' using errcode='42501'; end if;
  if not exists(select 1 from public.accounts where id=p_user and ((ticket.purpose='recovery' and status='active') or (ticket.purpose='invite' and status='invited'))) then raise exception 'Account is not available.' using errcode='42501'; end if;
  update public.recovery_tickets set consumed_at=now() where token_hash=p_hash;
  return ticket.purpose;
end; $$;
create or replace function public.finish_password_reset(p_user uuid,p_activate boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.accounts set status=case when p_activate and status='invited' then 'active'::public.account_status else status end,revoked_before=now() where id=p_user;
  update public.app_sessions set revoked_at=now() where user_id=p_user;
  insert into public.audit_events(actor_id,action,resource_type,resource_id) values(p_user,case when p_activate then 'account.activated' else 'account.password_reset' end,'account',p_user);
end; $$;
