-- Bind application access to the actual Supabase Auth session, not a cached JWT claim.
-- A refresh token cannot reopen a session that predates an account revocation.
create or replace function public.session_valid() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.accounts a
    join public.app_sessions s on s.user_id=a.id
    join auth.sessions auth_session on auth_session.id=s.id and auth_session.user_id=a.id
    where a.id=auth.uid() and a.status='active' and s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.revoked_at is null and s.expires_at>now()
      and auth_session.created_at>now()-interval '8 hours'
      and (a.revoked_before is null or auth_session.created_at>a.revoked_before));
$$;
create or replace function public.register_session() returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;started timestamptz;
begin
  select s.created_at into started from auth.sessions s join public.accounts a on a.id=s.user_id
    where s.id=sid and s.user_id=auth.uid() and a.status='active'
      and (a.revoked_before is null or s.created_at>a.revoked_before);
  if started is null then raise exception 'Account is not active. Sign in again or contact your administrator.' using errcode='42501';end if;
  insert into public.app_sessions(id,user_id,created_at,expires_at) values(sid,auth.uid(),started,started+interval '8 hours') on conflict(id) do nothing;
  if not public.session_valid() then raise exception 'Your session has expired. Please sign in again.' using errcode='42501';end if;
end; $$;

create or replace function public.assigned_user_can(p_employee uuid,p_permission text,p_target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.accounts a join public.permission_grants g on g.user_id=a.id
    join public.employees target on target.id=p_target
    where a.employee_id=p_employee and a.status='active' and g.permission=p_permission and
      (g.scope='company' or (g.scope='own' and p_target=p_employee) or (g.scope='direct_reports' and target.manager_id=p_employee)
        or (g.scope='department' and target.department_id=g.department_id) or (g.scope='team' and target.team_id=g.team_id)));
$$;
drop function public.approval_route_for(uuid,text);
create or replace function public.approval_route_for(p_employee uuid,p_type text,p_department uuid default null) returns public.approval_routes language plpgsql stable security definer set search_path='' as $$
declare r public.approval_routes;dept uuid;permission text;
begin
  select coalesce(p_department,department_id) into dept from public.employees where id=p_employee;
  select * into r from public.approval_routes where department_id=dept and request_type=p_type;
  if not found then raise exception 'No approval route is configured. Please contact HR.';end if;
  if r.approver_id=p_employee then
    if r.delegate_id is null or r.delegate_id=p_employee or r.delegate_until<public.company_today() then raise exception 'A different approver must be assigned to your request.';end if;
    r.approver_id:=r.delegate_id;r.delegate_id:=null;r.delegate_until:=null;
  end if;
  permission:=case when p_type='attendance' then 'attendance.manage' when p_type='planning' then 'planning.manage' else 'leave.approve' end;
  if p_type='planning' then
    if not exists(select 1 from public.accounts a join public.permission_grants g on g.user_id=a.id where a.employee_id=r.approver_id and a.status='active' and g.permission=permission and (g.scope='company' or (g.scope='department' and g.department_id=dept))) then raise exception 'The assigned approver needs permission for this department. Please contact HR.';end if;
  elsif not public.assigned_user_can(r.approver_id,permission,p_employee) then raise exception 'The assigned approver needs permission for your scope. Please contact HR.';end if;
  return r;
end; $$;

create or replace function public.request_extra(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=public.my_employee_id();route public.approval_routes;result uuid;dept uuid;
begin
  perform public.require_active();select department_id into dept from public.employees where id=me;
  if length(trim(p_data->>'reason')) not between 5 and 1000 then raise exception 'Enter a reason between 5 and 1,000 characters.';end if;
  if p_kind='planning' then
    dept:=coalesce(nullif(p_data->>'department_id','')::uuid,dept);
    if not public.department_permission('planning.manage',dept) then raise exception 'You cannot submit a plan for this department.' using errcode='42501';end if;
    route:=public.approval_route_for(me,p_kind,dept);
    insert into public.planning_requests(employee_id,department_id,title,headcount,budget,reason,approver_id) values(me,dept,p_data->>'title',(p_data->>'headcount')::int,nullif(p_data->>'budget','')::numeric,p_data->>'reason',route.approver_id) returning id into result;
  elsif p_kind='overtime' then
    route:=public.approval_route_for(me,p_kind);
    insert into public.overtime_requests(employee_id,work_date,hours,reason,approver_id) values(me,(p_data->>'work_date')::date,(p_data->>'hours')::numeric,p_data->>'reason',route.approver_id) returning id into result;
  else raise exception 'Unknown request.';end if;
  perform public.notify_employee(route.approver_id,'A '||p_kind||' request needs review','Open your approvals to review the request.','/approvals');
  perform public.log_event(p_kind||'.requested',p_kind,result);return result;
end; $$;
drop policy planning_read on public.planning_requests;
create policy planning_read on public.planning_requests for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or public.department_permission('planning.manage',department_id)));
create or replace function public.decide_extra(p_kind text,p_id uuid,p_decision text) returns void language plpgsql security definer set search_path='' as $$
declare emp uuid;approver uuid;state text;dept uuid;
begin
  perform public.require_active();
  if p_kind='overtime' then select employee_id,approver_id,status into emp,approver,state from public.overtime_requests where id=p_id for update;
  elsif p_kind='planning' then select employee_id,approver_id,status,department_id into emp,approver,state,dept from public.planning_requests where id=p_id for update;
  else raise exception 'Unknown request.';end if;
  if emp is null or emp=public.my_employee_id() or approver is distinct from public.my_employee_id() then raise exception 'You cannot approve this request.' using errcode='42501';end if;
  if p_kind='planning' then
    if not public.department_permission('planning.manage',dept) then raise exception 'This department is outside your planning scope.' using errcode='42501';end if;
  else perform public.require_access('leave.approve',emp);end if;
  if state<>'Pending' or p_decision not in ('Approved','Rejected') then raise exception 'Invalid request decision.';end if;
  if p_kind='overtime' then update public.overtime_requests set status=p_decision where id=p_id;else update public.planning_requests set status=p_decision where id=p_id;end if;
  perform public.notify_employee(emp,'Your request was '||lower(p_decision),'Open Approvals for the updated status.','/approvals');
  perform public.log_event(p_kind||'.'||lower(p_decision),p_kind,p_id);
end; $$;

create or replace function public.is_assigned_reviewer(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.active_access() and exists(select 1 from public.reviews where employee_id=p_employee and reviewer_id=public.my_employee_id());
$$;
drop policy employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated using(public.has_permission('employees.read',id) or public.is_assigned_reviewer(id));
create or replace function public.list_reviews() returns setof public.reviews language plpgsql security definer set search_path='' as $$
begin
  perform public.require_active();
  insert into public.audit_events(actor_id,action,resource_type,resource_id)
    select auth.uid(),'performance.read','review',r.id from public.reviews r where r.employee_id=public.my_employee_id() or r.reviewer_id=public.my_employee_id() or public.has_permission('performance.read',r.employee_id);
  return query select r.* from public.reviews r where r.employee_id=public.my_employee_id() or r.reviewer_id=public.my_employee_id() or public.has_permission('performance.read',r.employee_id) order by r.due_date limit 1000;
end; $$;
revoke select on public.reviews from authenticated;
revoke execute on function public.assigned_user_can(uuid,text,uuid),public.approval_route_for(uuid,text,uuid),public.is_assigned_reviewer(uuid),public.list_reviews() from public,anon,authenticated;
grant execute on function public.list_reviews(),public.is_assigned_reviewer(uuid) to authenticated,service_role;
grant execute on function public.company_today(),public.assigned_user_can(uuid,text,uuid),public.approval_route_for(uuid,text,uuid) to service_role;
