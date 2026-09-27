-- Initial templates are applied only by an explicit administrator assignment.
insert into public.role_templates(name,suggested_scope,permissions,description) values
('Owner','company',array['workforce.summary','planning.manage','organization.manage','access.manage','audit.read']::text[],'Governance and access administration. Confidential HR and payroll require additional grants.'),
('President','company',array['workforce.summary','planning.manage','leave.approve']::text[],'Executive approvals require a separate approval assignment.'),
('Vice-President','department',array['workforce.summary','planning.manage','leave.approve']::text[],'Grant each assigned division''s departments explicitly.'),
('CEO','company',array['workforce.summary','planning.manage','leave.approve']::text[],'Strategic metrics and designated executive approvals.'),
('COO','department',array['workforce.summary','attendance.read','attendance.manage','schedules.manage','leave.approve']::text[],'Assigned business units only.'),
('CFO','company',array['workforce.summary','planning.manage']::text[],'Compensation budgets use planning records. Payroll review needs an explicit payroll.read grant. No medical or disciplinary access.'),
('CMO','department',array['workforce.summary','employees.read','planning.manage','leave.read','leave.approve']::text[],'Assigned marketing department or teams.'),
('Director','department',array['workforce.summary','employees.read','planning.manage','performance.read','leave.read','leave.approve']::text[],'Assigned departments only.'),
('Managerial','team',array['workforce.summary','employees.read','attendance.read','attendance.manage','leave.read','leave.approve','performance.read','performance.manage','tasks.manage']::text[],'Assigned teams; approver assignments remain explicit.'),
('Supervisor','direct_reports',array['employees.read','attendance.read','schedules.manage','requests.recommend']::text[],'No final approval permission by default.'),
('Specialist','own',array[]::text[],'Self-service and assigned tasks; functional privileges are separate.'),
('Rank & File','own',array[]::text[],'Self-service and assigned work tasks.'),
('Janitorial','own',array[]::text[],'Own locations, shifts, and cleaning checklists.'),
('Skilled & Labor','own',array[]::text[],'Own work, safety training, and certifications.'),
('Intern / Trainee','own',array[]::text[],'Own learning plan, onboarding, and mentor feedback.'),
('Others','own',array[]::text[],'Custom job title; self-service unless explicitly extended.'),
('HR Administrator','company',array['employees.read','employees.manage','private.read','private.write','workforce.summary','attendance.read','attendance.manage','schedules.manage','leave.read','leave.approve','documents.read','documents.manage','performance.read','performance.manage','tasks.manage','announcements.manage','organization.manage','audit.read']::text[],'Sensitive categories, access management, and payroll are separate.'),
('HR Officer','department',array['employees.read','employees.manage','private.read','private.write','attendance.read','leave.read','documents.read','documents.manage','tasks.manage']::text[],'Scoped HR maintenance. No implicit final approval or payroll access.'),
('Payroll Administrator','company',array['employees.read','payroll.read','payroll.manage']::text[],'Bank information is a separate grant.'),
('Recruitment Officer','department',array['employees.read','recruitment.manage','tasks.manage','performance.manage']::text[],'Recruitment and onboarding; no general private personnel access.'),
('Technical Administrator','company',array['accounts.manage','technical.manage']::text[],'Account operations only. No confidential records or permission grants.')
on conflict(name) do nothing;
