create table public.organization_settings (id boolean primary key default true check(id), company_name text not null default 'CentralHub', timezone text not null default 'Asia/Manila', currency text not null default 'PHP');
insert into public.organization_settings default values;
create table public.holidays (holiday_date date primary key, name text not null);
create unique index attendance_open_idx on public.attendance(employee_id) where clock_in is not null and clock_out is null;

create or replace function public.company_today() returns date language sql stable security definer set search_path='' as $$
  select (now() at time zone timezone)::date from public.organization_settings;
$$;

create or replace function public.notify_employee(p_employee uuid,p_title text,p_body text,p_href text) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(employee_id,title,body,href) values(p_employee,p_title,p_body,p_href);
$$;
create or replace function public.require_access(p_permission text,p_employee uuid default null) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_permission,p_employee) then raise exception 'You do not have access to this action.' using errcode='42501'; end if;
end; $$;
create or replace function public.require_active() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.active_access() then raise exception 'Sign in with an active account and complete required verification.' using errcode='42501'; end if;
end; $$;
create or replace function public.approval_route_for(p_employee uuid,p_type text) returns public.approval_routes language plpgsql stable security definer set search_path = '' as $$
declare r public.approval_routes;
begin
  select ar.* into r from public.approval_routes ar join public.employees e on e.department_id=ar.department_id where e.id=p_employee and ar.request_type=p_type;
  if not found then raise exception 'No approval route is configured. Please contact HR.'; end if;
  if r.approver_id=p_employee then
    if r.delegate_id is null or r.delegate_id=p_employee or r.delegate_until<public.company_today() then raise exception 'A different approver must be assigned to your request.'; end if;
    r.approver_id:=r.delegate_id; r.delegate_id:=null; r.delegate_until:=null;
  end if;
  return r;
end; $$;

create or replace function public.clock_attendance(p_action text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); a public.attendance; work_day date; tz text;
begin
  perform public.require_active();
  select timezone into tz from public.organization_settings;
  work_day:=(now() at time zone tz)::date;
  perform pg_advisory_xact_lock(hashtextextended(me::text,0));
  if p_action='in' then
    if exists(select 1 from public.attendance where employee_id=me and clock_in is not null and clock_out is null) then raise exception 'You are already clocked in.'; end if;
    insert into public.attendance(employee_id,work_date,clock_in,status) values(me,work_day,now(),'Present')
      on conflict(employee_id,work_date) do update set clock_in=excluded.clock_in,status='Present' where public.attendance.clock_in is null returning * into a;
    if a.id is null then raise exception 'Your attendance is already recorded. Submit a correction if needed.'; end if;
  elsif p_action='out' then
    select * into a from public.attendance where employee_id=me and clock_in is not null and clock_out is null for update;
    if not found then raise exception 'Clock in before clocking out.'; end if;
    update public.attendance set clock_out=now() where id=a.id returning * into a;
  else raise exception 'Invalid attendance action.'; end if;
  perform public.log_event('attendance.clock_'||p_action,'attendance',a.id);
  return to_jsonb(a);
end; $$;

create or replace function public.request_leave(p_type uuid,p_start date,p_end date,p_reason text) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); n int; yr int; b public.leave_balances; r public.approval_routes; result uuid;
begin
  perform public.require_active();
  if p_start<public.company_today() or p_end<p_start or p_end>p_start+366 or extract(year from p_start)<>extract(year from p_end) then raise exception 'Use a future date range within one calendar year.'; end if;
  if length(trim(p_reason)) not between 5 and 1000 then raise exception 'Add a reason between 5 and 1,000 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,0));
  yr:=extract(year from p_start)::int;
  select count(*) into n from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d
    where extract(isodow from d)<6 and not exists(select 1 from public.holidays h where h.holiday_date=d::date);
  if n<1 then raise exception 'Select at least one working day.'; end if;
  select * into b from public.leave_balances where employee_id=me and leave_type_id=p_type and year=yr for update;
  if not found or b.allowance-b.used-b.pending<n then raise exception 'You do not have enough available leave.'; end if;
  if exists(select 1 from public.leave_requests where employee_id=me and status in ('Pending','Approved') and start_date<=p_end and end_date>=p_start) then raise exception 'These dates overlap an existing request.'; end if;
  r:=public.approval_route_for(me,'leave');
  insert into public.leave_requests(employee_id,leave_type_id,start_date,end_date,days,reason,approver_id,delegate_id,delegate_until)
    values(me,p_type,p_start,p_end,n,trim(p_reason),r.approver_id,r.delegate_id,r.delegate_until) returning id into result;
  update public.leave_balances set pending=pending+n where employee_id=me and leave_type_id=p_type and year=yr;
  perform public.notify_employee(r.approver_id,'A leave request needs your review','A team member submitted a leave request.','/leave');
  if r.delegate_id is not null and r.delegate_until>=public.company_today() then perform public.notify_employee(r.delegate_id,'A delegated request needs your review','A team member submitted a leave request.','/leave'); end if;
  perform public.log_event('leave.request','leave_request',result);
  return result;
end; $$;

create or replace function public.decide_leave(p_id uuid,p_decision text,p_note text default '') returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); r public.leave_requests;
begin
  perform public.require_active();
  if p_decision not in ('Approved','Rejected','Cancelled') or length(p_note)>1000 then raise exception 'Invalid decision.'; end if;
  select * into r from public.leave_requests where id=p_id for update;
  if not found then raise exception 'Request not available.' using errcode='42501'; end if;
  if p_decision='Cancelled' then
    if r.employee_id<>me or r.status<>'Pending' then raise exception 'Only your pending requests can be cancelled.' using errcode='42501'; end if;
  else
    perform public.require_access('leave.approve',r.employee_id);
    if r.employee_id=me then raise exception 'You cannot approve your own request.' using errcode='42501'; end if;
    if r.approver_id is distinct from me and not(coalesce(r.delegate_id=me and r.delegate_until>=public.company_today(),false)) then raise exception 'You are not the assigned approver.' using errcode='42501'; end if;
    if r.status<>'Pending' then raise exception 'This request has already been decided.'; end if;
  end if;
  update public.leave_balances set pending=pending-r.days,used=used+case when p_decision='Approved' then r.days else 0 end
    where employee_id=r.employee_id and leave_type_id=r.leave_type_id and year=extract(year from r.start_date)::int;
  update public.leave_requests set status=p_decision,decision_note=nullif(trim(p_note),''),decided_by=me where id=p_id;
  perform public.notify_employee(r.employee_id,'Leave request '||lower(p_decision),'Your request has been updated. Open Time off for details.','/leave');
  perform public.log_event('leave.'||lower(p_decision),'leave_request',p_id);
end; $$;

create or replace function public.request_correction(p_attendance uuid,p_in timestamptz,p_out timestamptz,p_reason text) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); a public.attendance; r public.approval_routes; result uuid; tz text;
begin
  perform public.require_active();
  select * into a from public.attendance where id=p_attendance and employee_id=me;
  if not found then raise exception 'Attendance record not available.' using errcode='42501'; end if;
  select timezone into tz from public.organization_settings;
  if (p_in at time zone tz)::date<>a.work_date or p_in>now() or p_out>now() or p_out<=p_in or p_out>p_in+interval '24 hours' then raise exception 'Use valid times for the selected work day.'; end if;
  r:=public.approval_route_for(me,'attendance');
  insert into public.attendance_corrections(employee_id,attendance_id,requested_in,requested_out,reason,approver_id,delegate_id,delegate_until)
    values(me,p_attendance,p_in,p_out,p_reason,r.approver_id,r.delegate_id,r.delegate_until) returning id into result;
  perform public.notify_employee(r.approver_id,'Attendance correction to review','A team member requested a time correction.','/attendance');
  perform public.log_event('attendance.correction_requested','attendance_correction',result);
  return result;
end; $$;
create or replace function public.decide_correction(p_id uuid,p_decision text,p_note text default '') returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=public.my_employee_id(); r public.attendance_corrections; a public.attendance;
begin
  perform public.require_active();
  select * into r from public.attendance_corrections where id=p_id for update;
  if not found then raise exception 'Correction not available.' using errcode='42501'; end if;
  perform public.require_access('attendance.manage',r.employee_id);
  if r.employee_id=me or (r.approver_id is distinct from me and not(coalesce(r.delegate_id=me and r.delegate_until>=public.company_today(),false))) then raise exception 'A different assigned approver must review this request.' using errcode='42501'; end if;
  if r.status<>'Pending' or p_decision not in ('Approved','Rejected') then raise exception 'Invalid correction decision.'; end if;
  if p_decision='Approved' then
    select * into a from public.attendance where id=r.attendance_id for update;
    insert into public.attendance_history(attendance_id,employee_id,old_in,old_out,new_in,new_out,changed_by) values(a.id,a.employee_id,a.clock_in,a.clock_out,r.requested_in,r.requested_out,auth.uid());
    update public.attendance set clock_in=r.requested_in,clock_out=r.requested_out,note='Approved correction' where id=a.id;
  end if;
  update public.attendance_corrections set status=p_decision,decision_note=left(p_note,1000) where id=p_id;
  perform public.notify_employee(r.employee_id,'Attendance correction '||lower(p_decision),'Your attendance correction has been reviewed.','/attendance');
  perform public.log_event('attendance.correction_'||lower(p_decision),'attendance_correction',p_id);
end; $$;

create or replace function public.save_employee(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid:=nullif(p_data->>'id','')::uuid; dept uuid:=(p_data->>'department_id')::uuid; team uuid:=nullif(p_data->>'team_id','')::uuid; mgr uuid:=nullif(p_data->>'manager_id','')::uuid;
begin
  perform public.require_active();
  if target is null then
    if not public.department_permission('employees.manage',dept) and not exists(select 1 from public.permission_grants where user_id=auth.uid() and permission='employees.manage' and scope='team' and team_id=team) then raise exception 'You cannot create an employee in this scope.' using errcode='42501'; end if;
  else perform public.require_access('employees.manage',target); end if;
  -- Both old and destination scope must be authorized; changing a department cannot widen access.
  if not public.department_permission('employees.manage',dept) and not exists(select 1 from public.permission_grants where user_id=auth.uid() and permission='employees.manage' and scope='team' and team_id=team) then raise exception 'The destination scope is not authorized.' using errcode='42501'; end if;
  if team is not null and not exists(select 1 from public.teams where id=team and department_id=dept) then raise exception 'Choose a team in the selected department.'; end if;
  if mgr is not null and not public.has_permission('employees.read',mgr) then raise exception 'Reporting manager is outside your scope.' using errcode='42501'; end if;
  if mgr=target or exists(with recursive managers as (select id,manager_id from public.employees where id=mgr union select e.id,e.manager_id from public.employees e join managers m on e.id=m.manager_id) select 1 from managers where id=target) then raise exception 'Reporting relationships cannot contain a cycle.'; end if;
  if target is null then
    insert into public.employees(employee_number,full_name,email,phone,job_title,profile_type,department_id,team_id,manager_id,employment_status,start_date,location)
      values(p_data->>'employee_number',p_data->>'full_name',lower(p_data->>'email'),p_data->>'phone',p_data->>'job_title',p_data->>'profile_type',dept,team,mgr,p_data->>'employment_status',(p_data->>'start_date')::date,p_data->>'location') returning id into target;
    insert into public.leave_balances(employee_id,leave_type_id,year,allowance) select target,id,extract(year from public.company_today())::int,annual_allowance from public.leave_types;
  else
    update public.employees set employee_number=p_data->>'employee_number',full_name=p_data->>'full_name',email=lower(p_data->>'email'),phone=p_data->>'phone',job_title=p_data->>'job_title',profile_type=p_data->>'profile_type',department_id=dept,team_id=team,manager_id=mgr,employment_status=p_data->>'employment_status',start_date=(p_data->>'start_date')::date,location=p_data->>'location',updated_at=now() where id=target;
    if p_data->>'employment_status'='Archived' then
      if target=public.my_employee_id() then raise exception 'You cannot archive your own employee record.' using errcode='42501'; end if;
      update public.accounts set status='deactivated',revoked_before=now() where employee_id=target;
      update public.app_sessions set revoked_at=now() where user_id in (select id from public.accounts where employee_id=target);
    end if;
  end if;
  perform public.log_event('employee.saved','employee',target);
  return target;
end; $$;

create or replace function public.read_personal(p_employee uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_active();
  if p_employee<>public.my_employee_id() then perform public.require_access('private.read',p_employee); end if;
  select to_jsonb(p) into result from public.employee_private p where employee_id=p_employee;
  perform public.log_event('personal.read','employee',p_employee);
  return coalesce(result,'{}'::jsonb);
end; $$;
create or replace function public.save_personal(p_employee uuid,p_data jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active();
  if p_employee<>public.my_employee_id() then perform public.require_access('private.write',p_employee); end if;
  if length(p_data::text)>5000 then raise exception 'Personal information is too long.'; end if;
  insert into public.employee_private(employee_id,personal_email,address,emergency_name,emergency_phone)
    values(p_employee,left(p_data->>'personal_email',254),left(p_data->>'address',500),left(p_data->>'emergency_name',100),left(p_data->>'emergency_phone',30))
    on conflict(employee_id) do update set personal_email=excluded.personal_email,address=excluded.address,emergency_name=excluded.emergency_name,emergency_phone=excluded.emergency_phone,updated_at=now();
  perform public.log_event('personal.updated','employee',p_employee);
end; $$;
create or replace function public.read_sensitive(p_employee uuid,p_category text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_access('sensitive.'||p_category||'.read',p_employee);
  select data into result from public.sensitive_records where employee_id=p_employee and category=p_category;
  perform public.log_event('sensitive.'||p_category||'.read','employee',p_employee);
  return coalesce(result,'{}'::jsonb);
end; $$;
create or replace function public.save_sensitive(p_employee uuid,p_category text,p_data jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_access('sensitive.'||p_category||'.write',p_employee);
  if length(p_data::text)>20000 then raise exception 'Record is too large.'; end if;
  insert into public.sensitive_records(employee_id,category,data) values(p_employee,p_category,p_data) on conflict(employee_id,category) do update set data=excluded.data,updated_at=now();
  perform public.log_event('sensitive.'||p_category||'.updated','employee',p_employee);
end; $$;

create or replace function public.list_payslips() returns setof public.payslips language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active();
  perform public.log_event('payroll.list','payslip');
  return query select p.* from public.payslips p where (p.employee_id=public.my_employee_id() and p.status='Published') or (p.employee_id<>public.my_employee_id() and public.has_permission('payroll.read',p.employee_id)) or exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.permission='payroll.read' and public.has_permission('payroll.manage',p.employee_id)) order by p.period desc limit 1000;
end; $$;
create or replace function public.get_payslip(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.payslips;
begin
  perform public.require_active(); select * into p from public.payslips where id=p_id;
  if not found or not ((p.employee_id=public.my_employee_id() and p.status='Published') or (p.employee_id<>public.my_employee_id() and public.has_permission('payroll.read',p.employee_id)) or public.has_permission('payroll.manage',p.employee_id)) then raise exception 'Payslip not available.' using errcode='42501'; end if;
  perform public.log_event('payslip.download','payslip',p_id); return to_jsonb(p);
end; $$;
create or replace function public.create_payroll(p_records jsonb) returns int language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int:=0; result uuid;
begin
  perform public.require_active();
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 200 then raise exception 'Import between 1 and 200 records at a time.'; end if;
  for r in select * from jsonb_array_elements(p_records) loop
    perform public.require_access('payroll.manage',(r->>'employee_id')::uuid);
    insert into public.payslips(employee_id,period,basic_pay,allowances,deductions,currency,created_by)
      values((r->>'employee_id')::uuid,r->>'period',(r->>'basic_pay')::numeric,(r->>'allowances')::numeric,(r->>'deductions')::numeric,r->>'currency',auth.uid()) returning id into result;
    perform public.log_event('payroll.created','payslip',result); n:=n+1;
  end loop; return n;
end; $$;
create or replace function public.publish_payslip(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare p public.payslips;
begin
  select * into p from public.payslips where id=p_id for update;
  if not found then raise exception 'Payslip not available.' using errcode='42501'; end if;
  perform public.require_access('payroll.manage',p.employee_id);
  if p.status<>'Draft' then raise exception 'This payslip is already published.'; end if;
  update public.payslips set status='Published',published_at=now() where id=p_id;
  perform public.notify_employee(p.employee_id,'Your payslip is ready','Your published payslip is available in Payroll.','/payroll');
  perform public.log_event('payroll.published','payslip',p_id);
end; $$;

create or replace function public.save_schedule(p_employee uuid,p_date date,p_start time,p_end time,p_location text) returns void language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform public.require_access('schedules.manage',p_employee);
  if length(p_location) not between 2 and 100 or p_start=p_end then raise exception 'Enter a location and valid shift.'; end if;
  insert into public.schedules(employee_id,work_date,start_time,end_time,location) values(p_employee,p_date,p_start,p_end,p_location)
    on conflict(employee_id,work_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,location=excluded.location returning id into result;
  perform public.notify_employee(p_employee,'Your schedule was updated','Check your upcoming shift in Attendance.','/attendance');
  perform public.log_event('schedule.saved','schedule',result);
end; $$;

create or replace function public.update_task(p_id uuid,p_complete boolean) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  perform public.require_active(); select * into t from public.tasks where id=p_id;
  if not found or (t.employee_id<>public.my_employee_id() and not public.has_permission('tasks.manage',t.employee_id)) then raise exception 'Task not available.' using errcode='42501'; end if;
  update public.tasks set completed=p_complete where id=p_id; perform public.log_event('task.updated','task',p_id);
end; $$;
create or replace function public.save_review(p_id uuid,p_feedback text,p_rating int default null) returns void language plpgsql security definer set search_path = '' as $$
declare r public.reviews; me uuid:=public.my_employee_id();
begin
  perform public.require_active(); select * into r from public.reviews where id=p_id for update;
  if not found or length(trim(p_feedback)) not between 5 and 5000 then raise exception 'Enter feedback between 5 and 5,000 characters.'; end if;
  if r.employee_id=me then update public.reviews set employee_feedback=p_feedback where id=p_id;
  elsif r.reviewer_id=me then
    if p_rating is null or p_rating not between 1 and 5 then raise exception 'Select a rating from 1 to 5.'; end if;
    update public.reviews set feedback=p_feedback,rating=p_rating,status='Completed' where id=p_id;
  else raise exception 'Only the employee or assigned reviewer can submit feedback.' using errcode='42501'; end if;
  perform public.log_event('review.feedback_saved','review',p_id);
end; $$;
create or replace function public.create_development_item(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; emp uuid:=(p_data->>'employee_id')::uuid;
begin
  if p_kind='task' then
    perform public.require_access('tasks.manage',emp);
    insert into public.tasks(employee_id,title,description,category,due_date) values(emp,left(p_data->>'title',200),left(coalesce(p_data->>'description',''),2000),p_data->>'category',(p_data->>'due_date')::date) returning id into result;
  elsif p_kind='training' then
    perform public.require_access('performance.manage',emp);
    insert into public.training(employee_id,title,category,expires_at) values(emp,left(p_data->>'title',200),p_data->>'category',nullif(p_data->>'expires_at','')::date) returning id into result;
  elsif p_kind='review' then
    perform public.require_access('performance.manage',emp);
    if not public.has_permission('employees.read',(p_data->>'reviewer_id')::uuid) then raise exception 'Reviewer is outside your scope.' using errcode='42501'; end if;
    insert into public.reviews(employee_id,reviewer_id,cycle,due_date) values(emp,(p_data->>'reviewer_id')::uuid,left(p_data->>'cycle',200),(p_data->>'due_date')::date) returning id into result;
  else raise exception 'Invalid development item.'; end if;
  perform public.notify_employee(emp,'A new '||p_kind||' is assigned to you','Open Performance & growth to see the details.','/performance');
  perform public.log_event(p_kind||'.created',p_kind,result); return result;
end; $$;
create or replace function public.complete_training(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.training;
begin
  perform public.require_active(); select * into t from public.training where id=p_id;
  if not found or t.employee_id<>public.my_employee_id() then raise exception 'Training not available.' using errcode='42501'; end if;
  if t.category in ('Certification','Safety certification') then raise exception 'An authorized reviewer must verify certifications.'; end if;
  update public.training set status='Completed',completed_at=now() where id=p_id; perform public.log_event('training.completed','training',p_id);
end; $$;
