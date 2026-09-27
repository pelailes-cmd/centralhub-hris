-- Tables are read-only through PostgREST. All writes go through audited, scoped RPCs.
-- Only CentralHub-owned objects are changed; other public-schema applications keep their grants.
do $$ declare table_name text; begin
  foreach table_name in array array['departments','teams','employees','accounts','app_sessions','permissions','role_templates','role_assignments','permission_grants','employee_private','sensitive_records','attendance','schedules','approval_routes','attendance_corrections','attendance_history','leave_types','leave_balances','leave_requests','payslips','documents','document_acknowledgements','announcements','reviews','tasks','training','notifications','events','planning_requests','overtime_requests','audit_events','auth_rate_limits','recovery_tickets','organization_settings','holidays'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;
grant usage on schema public to authenticated;
grant select on public.departments,public.teams,public.employees,public.accounts,public.role_templates,public.role_assignments,public.permission_grants,public.permissions,
  public.attendance,public.schedules,public.attendance_corrections,public.attendance_history,public.approval_routes,public.leave_types,public.leave_balances,public.leave_requests,
  public.documents,public.document_acknowledgements,public.announcements,public.reviews,public.tasks,public.training,public.notifications,public.events,public.audit_events,
  public.organization_settings,public.holidays,public.planning_requests,public.overtime_requests to authenticated;

create policy departments_read on public.departments for select to authenticated using(public.active_access());
create policy teams_read on public.teams for select to authenticated using(public.active_access());
create policy employees_read on public.employees for select to authenticated using(public.has_permission('employees.read',id) or (public.active_access() and exists(select 1 from public.reviews r where r.employee_id=employees.id and r.reviewer_id=public.my_employee_id())));
create policy accounts_read on public.accounts for select to authenticated using(public.has_permission('accounts.manage') or public.has_permission('access.manage'));
create policy roles_read on public.role_templates for select to authenticated using(public.active_access());
create policy permissions_read on public.permissions for select to authenticated using(public.has_permission('access.manage'));
create policy assignments_read on public.role_assignments for select to authenticated using(public.active_access() and (user_id=auth.uid() or public.has_permission('access.manage')));
create policy grants_read on public.permission_grants for select to authenticated using(public.active_access() and (user_id=auth.uid() or public.has_permission('access.manage')));
create policy attendance_read on public.attendance for select to authenticated using(public.has_permission('attendance.read',employee_id));
create policy schedules_read on public.schedules for select to authenticated using(public.has_permission('attendance.read',employee_id) or public.has_permission('schedules.manage',employee_id));
create policy corrections_read on public.attendance_corrections for select to authenticated using(public.has_permission('attendance.read',employee_id) or (public.has_permission('attendance.manage',employee_id) and (approver_id=public.my_employee_id() or (delegate_id=public.my_employee_id() and delegate_until>=public.company_today()))));
create policy history_read on public.attendance_history for select to authenticated using(public.has_permission('attendance.read',employee_id));
create policy routes_read on public.approval_routes for select to authenticated using(public.has_permission('organization.manage'));
create policy leave_types_read on public.leave_types for select to authenticated using(public.active_access());
create policy balances_read on public.leave_balances for select to authenticated using(public.has_permission('leave.read',employee_id));
create policy requests_read on public.leave_requests for select to authenticated using(public.has_permission('leave.read',employee_id) or (public.has_permission('leave.approve',employee_id) and (approver_id=public.my_employee_id() or (delegate_id=public.my_employee_id() and delegate_until>=public.company_today()))));
create policy documents_read on public.documents for select to authenticated using(public.can_read_document(id));
create policy acknowledgements_read on public.document_acknowledgements for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or public.has_permission('documents.manage',employee_id)) and public.can_read_document(document_id));
create policy announcements_read on public.announcements for select to authenticated using(public.active_access() and (department_id is null or department_id=(select e.department_id from public.employees e where e.id=public.my_employee_id()) or public.department_permission('announcements.manage',department_id)));
create policy reviews_read on public.reviews for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or reviewer_id=public.my_employee_id() or public.has_permission('performance.read',employee_id)));
create policy tasks_read on public.tasks for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or public.has_permission('tasks.manage',employee_id)));
create policy training_read on public.training for select to authenticated using(public.active_access() and (employee_id=public.my_employee_id() or public.has_permission('performance.read',employee_id) or public.has_permission('performance.manage',employee_id)));
create policy notifications_read on public.notifications for select to authenticated using(public.active_access() and employee_id=public.my_employee_id());
create policy events_read on public.events for select to authenticated using(public.active_access() and (department_id is null or department_id=(select e.department_id from public.employees e where e.id=public.my_employee_id())));
create policy audit_read on public.audit_events for select to authenticated using(public.has_permission('audit.read'));
create policy settings_read on public.organization_settings for select to authenticated using(public.active_access());
create policy holidays_read on public.holidays for select to authenticated using(public.active_access());
create policy planning_read on public.planning_requests for select to authenticated using(public.has_permission('planning.manage',employee_id));
create policy overtime_read on public.overtime_requests for select to authenticated using(public.has_permission('attendance.read',employee_id) or (public.has_permission('leave.approve',employee_id) and approver_id=public.my_employee_id()));

revoke execute on function
  public.my_employee_id(),
  public.requires_mfa(),
  public.session_valid(),
  public.active_access(),
  public.has_permission(text,uuid),
  public.department_permission(text,uuid),
  public.log_event(text,text,uuid),
  public.register_session(),
  public.account_context(),
  public.revoke_session(),
  public.check_auth_rate_limit(text),
  public.company_today(),
  public.notify_employee(uuid,text,text,text),
  public.require_access(text,uuid),
  public.require_active(),
  public.approval_route_for(uuid,text),
  public.clock_attendance(text),
  public.request_leave(uuid,date,date,text),
  public.decide_leave(uuid,text,text),
  public.request_correction(uuid,timestamptz,timestamptz,text),
  public.decide_correction(uuid,text,text),
  public.save_employee(jsonb),
  public.read_personal(uuid),
  public.save_personal(uuid,jsonb),
  public.read_sensitive(uuid,text),
  public.save_sensitive(uuid,text,jsonb),
  public.list_payslips(),
  public.get_payslip(uuid),
  public.create_payroll(jsonb),
  public.publish_payslip(uuid),
  public.save_schedule(uuid,date,time,time,text),
  public.update_task(uuid,boolean),
  public.save_review(uuid,text,int),
  public.create_development_item(text,jsonb),
  public.complete_training(uuid),
  public.can_read_document(uuid),
  public.download_document(uuid),
  public.register_document(jsonb),
  public.acknowledge_document(uuid),
  public.publish_announcement(jsonb),
  public.read_notifications(),
  public.workforce_summary(),
  public.set_account_status(uuid,text),
  public.link_invitation(uuid,uuid),
  public.assign_role(uuid,text,public.access_scope,uuid,uuid),
  public.grant_permission(uuid,text,public.access_scope,uuid,uuid),
  public.revoke_permission(uuid,boolean),
  public.save_organization(text,jsonb),
  public.request_extra(text,jsonb),
  public.decide_extra(text,uuid,text),
  public.issue_recovery_ticket(text,uuid,text),
  public.consume_recovery_ticket(text,uuid),
  public.finish_password_reset(uuid,boolean)
from public,anon,authenticated;
grant execute on function public.company_today(),public.my_employee_id(),public.requires_mfa(),public.session_valid(),public.active_access(),public.has_permission(text,uuid),public.department_permission(text,uuid),public.can_read_document(uuid),
  public.register_session(),public.account_context(),public.revoke_session(),public.clock_attendance(text),public.request_leave(uuid,date,date,text),public.decide_leave(uuid,text,text),
  public.request_correction(uuid,timestamptz,timestamptz,text),public.decide_correction(uuid,text,text),public.save_employee(jsonb),public.read_personal(uuid),public.save_personal(uuid,jsonb),
  public.read_sensitive(uuid,text),public.save_sensitive(uuid,text,jsonb),public.list_payslips(),public.get_payslip(uuid),public.create_payroll(jsonb),public.publish_payslip(uuid),
  public.save_schedule(uuid,date,time,time,text),public.update_task(uuid,boolean),public.save_review(uuid,text,integer),public.create_development_item(text,jsonb),public.complete_training(uuid),
  public.download_document(uuid),public.register_document(jsonb),public.acknowledge_document(uuid),public.publish_announcement(jsonb),public.read_notifications(),public.workforce_summary(),
  public.set_account_status(uuid,text),public.link_invitation(uuid,uuid),public.assign_role(uuid,text,public.access_scope,uuid,uuid),public.grant_permission(uuid,text,public.access_scope,uuid,uuid),
  public.revoke_permission(uuid,boolean),public.save_organization(text,jsonb),public.request_extra(text,jsonb),public.decide_extra(text,uuid,text) to authenticated;
grant execute on function
  public.my_employee_id(),
  public.requires_mfa(),
  public.session_valid(),
  public.active_access(),
  public.has_permission(text,uuid),
  public.department_permission(text,uuid),
  public.log_event(text,text,uuid),
  public.register_session(),
  public.account_context(),
  public.revoke_session(),
  public.check_auth_rate_limit(text),
  public.company_today(),
  public.notify_employee(uuid,text,text,text),
  public.require_access(text,uuid),
  public.require_active(),
  public.approval_route_for(uuid,text),
  public.clock_attendance(text),
  public.request_leave(uuid,date,date,text),
  public.decide_leave(uuid,text,text),
  public.request_correction(uuid,timestamptz,timestamptz,text),
  public.decide_correction(uuid,text,text),
  public.save_employee(jsonb),
  public.read_personal(uuid),
  public.save_personal(uuid,jsonb),
  public.read_sensitive(uuid,text),
  public.save_sensitive(uuid,text,jsonb),
  public.list_payslips(),
  public.get_payslip(uuid),
  public.create_payroll(jsonb),
  public.publish_payslip(uuid),
  public.save_schedule(uuid,date,time,time,text),
  public.update_task(uuid,boolean),
  public.save_review(uuid,text,int),
  public.create_development_item(text,jsonb),
  public.complete_training(uuid),
  public.can_read_document(uuid),
  public.download_document(uuid),
  public.register_document(jsonb),
  public.acknowledge_document(uuid),
  public.publish_announcement(jsonb),
  public.read_notifications(),
  public.workforce_summary(),
  public.set_account_status(uuid,text),
  public.link_invitation(uuid,uuid),
  public.assign_role(uuid,text,public.access_scope,uuid,uuid),
  public.grant_permission(uuid,text,public.access_scope,uuid,uuid),
  public.revoke_permission(uuid,boolean),
  public.save_organization(text,jsonb),
  public.request_extra(text,jsonb),
  public.decide_extra(text,uuid,text),
  public.issue_recovery_ticket(text,uuid,text),
  public.consume_recovery_ticket(text,uuid),
  public.finish_password_reset(uuid,boolean)
to service_role;

-- Raw sensitive tables, session records, audit inserts, Auth tickets, and rate limits have
-- no authenticated grants or write policies. Service keys must stay server-side.
-- Later migrations explicitly revoke default grants on each new table and function.
