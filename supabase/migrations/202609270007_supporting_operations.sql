create table public.positions (id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 2 and 100),department_id uuid references public.departments(id),unique(title,department_id));
alter table public.employees add column position_id uuid references public.positions(id);
alter table public.positions enable row level security;
revoke all on public.positions from public,anon,authenticated;
grant select on public.positions to authenticated;
grant all on public.positions to service_role;
create policy positions_read on public.positions for select to authenticated using(public.active_access());

create or replace function public.synchronize_position() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.positions(title,department_id) values(new.job_title,new.department_id) on conflict(title,department_id) do update set title=excluded.title returning id into new.position_id;
  return new;
end; $$;
create trigger employee_position before insert or update of job_title,department_id on public.employees for each row execute function public.synchronize_position();

create or replace function public.create_position(p_title text,p_department uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform public.require_access('organization.manage');
  insert into public.positions(title,department_id) values(p_title,p_department) returning id into result;
  perform public.log_event('position.created','position',result);return result;
end; $$;
create or replace function public.account_candidates() returns table(id uuid,full_name text,email text,employee_number text) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_permission('accounts.manage') and not public.has_permission('access.manage') then raise exception 'Account administration is not authorized.' using errcode='42501';end if;
  return query select e.id,e.full_name,e.email,e.employee_number from public.employees e where e.employment_status<>'Archived' order by e.full_name;
end; $$;
create or replace function public.export_directory() returns table(employee_number text,full_name text,email text,job_title text,department text,employment_status text) language plpgsql security definer set search_path='' as $$
begin
  perform public.require_active();perform public.log_event('directory.export','employee');
  return query select e.employee_number,e.full_name,e.email,e.job_title,d.name,e.employment_status from public.employees e join public.departments d on d.id=e.department_id where public.has_permission('employees.read',e.id) order by e.full_name;
end; $$;
create or replace function public.export_audit() returns setof public.audit_events language plpgsql security definer set search_path='' as $$
begin
  perform public.require_access('audit.read');perform public.log_event('audit.export','audit_event');
  return query select * from public.audit_events order by created_at desc limit 10000;
end; $$;
create or replace function public.save_employee_photo(p_employee uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_active();
  if p_employee<>public.my_employee_id() then perform public.require_access('employees.manage',p_employee);end if;
  if p_path !~ ('^avatars/'||p_employee::text||'/[a-f0-9-]{36}\.(png|jpg)$') then raise exception 'Invalid photo path.';end if;
  update public.employees set photo_path=p_path,updated_at=now() where id=p_employee;
  perform public.log_event('employee.photo_updated','employee',p_employee);
end; $$;
create or replace function public.verify_training(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.training;
begin
  select * into t from public.training where id=p_id for update;
  if not found then raise exception 'Training record not available.' using errcode='42501';end if;
  perform public.require_access('performance.manage',t.employee_id);
  if t.employee_id=public.my_employee_id() then raise exception 'A different authorized reviewer must verify your certification.' using errcode='42501';end if;
  update public.training set status='Completed',completed_at=now() where id=p_id;
  perform public.log_event('training.verified','training',p_id);
end; $$;

create table public.request_recommendations (
  id uuid primary key default gen_random_uuid(),request_id uuid not null,request_type text not null check(request_type in('leave','attendance','overtime','planning')),
  employee_id uuid not null references public.employees(id),recommended_by uuid not null references public.employees(id),
  recommendation text not null check(recommendation in('Recommended','Needs discussion')),note text not null check(length(note) between 5 and 1000),created_at timestamptz not null default now(),unique(request_id,recommended_by)
);
alter table public.request_recommendations enable row level security;
revoke all on public.request_recommendations from public,anon,authenticated;
grant select on public.request_recommendations to authenticated;
grant all on public.request_recommendations to service_role;
create policy recommendations_read on public.request_recommendations for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or recommended_by=public.my_employee_id() or public.has_permission('leave.approve',employee_id) or public.has_permission('requests.recommend',employee_id)));
create policy recommendation_leave_read on public.leave_requests for select to authenticated using(public.has_permission('requests.recommend',employee_id));
create policy recommendation_overtime_read on public.overtime_requests for select to authenticated using(public.has_permission('requests.recommend',employee_id));
create or replace function public.recommend_request(p_id uuid,p_type text,p_recommendation text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare emp uuid;state text;
begin
  if p_type='leave' then select employee_id,status into emp,state from public.leave_requests where id=p_id;
  elsif p_type='attendance' then select employee_id,status into emp,state from public.attendance_corrections where id=p_id;
  elsif p_type='overtime' then select employee_id,status into emp,state from public.overtime_requests where id=p_id;
  elsif p_type='planning' then select employee_id,status into emp,state from public.planning_requests where id=p_id;
  else raise exception 'Unknown request type.';end if;
  perform public.require_access('requests.recommend',emp);
  if emp is null or emp=public.my_employee_id() or state<>'Pending' then raise exception 'Only another employee’s pending request can be recommended.';end if;
  insert into public.request_recommendations(request_id,request_type,employee_id,recommended_by,recommendation,note) values(p_id,p_type,emp,public.my_employee_id(),p_recommendation,p_note)
    on conflict(request_id,recommended_by) do update set recommendation=excluded.recommendation,note=excluded.note,created_at=now();
  perform public.log_event('request.recommended',p_type,p_id);
end; $$;

revoke execute on function public.synchronize_position(),public.create_position(text,uuid),public.account_candidates(),public.export_directory(),public.export_audit(),public.save_employee_photo(uuid,text),public.verify_training(uuid),public.recommend_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_position(text,uuid),public.account_candidates(),public.export_directory(),public.export_audit(),public.save_employee_photo(uuid,text),public.verify_training(uuid),public.recommend_request(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.synchronize_position() to service_role;
