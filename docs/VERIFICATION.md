# Verification

The automated suites validate the actual SQL migrations and the development interface. Hosted Supabase credentials were not supplied for this repository-first implementation, so SMTP delivery, hosted Auth, production Storage, and live deployment are separate setup checks.

## Recorded results — September 27, 2026

| Check                                        | Result                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                       | Passed                                                                                                                              |
| TypeScript                                   | Passed                                                                                                                              |
| Database, validation, and account HTTP tests | **62 passed**: 46 PostgreSQL tests, 7 validation tests, 9 account-flow tests                                                        |
| Production build                             | Passed with Next.js 16.3.6                                                                                                          |
| Production smoke checks                      | Protected pages redirected to setup; private downloads and mutations rejected missing Supabase; development preview stayed disabled |
| Chrome browser workflows                     | **All 9 verified** across the final run and targeted rerun                                                                          |
| Responsive layouts                           | Checked at 360, 390, 768, and 1440 pixels; no document-level horizontal overflow                                                    |
| Accessibility                                | No axe WCAG A/AA violations on the overview, all module pages, and login; navigation focus trapping and Escape dismissal passed     |

The final full browser run passed eight workflows; the overview exceeded its original 90-second whole-test limit while other checks were running. With a 180-second development test budget, its isolated rerun passed in 11.1 seconds. Individual assertion timeouts were unchanged. No test failures remain unresolved.

The checks exposed and corrected muted-text contrast, mobile table overflow, keyboard access to the positions list, employee-profile routing, company-date boundaries, overly broad migration grants, and temporary password-verification session cleanup. Desktop and mobile screenshots are committed under `docs/screenshots`.

## Automated database and logic coverage

`npm test` executes migrations and policies in PGlite (PostgreSQL). The harness creates minimal `auth.users`, `auth.sessions`, `auth.uid()`, and `auth.jwt()` interfaces so it can exercise actual row-level policies and RPCs under an `authenticated` database role.

Coverage includes baseline self-access; all 16 classifications and 21 templates; privileged MFA gates; another employee's payslip and document rejection; unpublished payslip restrictions; raw sensitive-table and mutation denial; assigned-team scope; explicit reviewer context; immediate permission changes; account deactivation and logout; session expiry; leave balance reservation/approval and overlap prevention; self-approval rejection; separate approval assignment; restricted payroll/HR actions; payslip publication and notifications; private-read auditing; role-escalation rejection; single-use/expired recovery tickets; server-only token issuance; login rate limits; strong password validation; payroll import validation; and spreadsheet formula protection.

These tests do not pretend to exercise Supabase's password hashing or email delivery. Those are provided by Supabase Auth and require a configured local/hosted Auth service.

The account HTTP tests execute the actual Next.js authentication route and access helpers with controlled Supabase provider doubles. They cover server-authoritative MFA decisions, ignored role input, login throttling, deactivated-account rejection, logout, non-enumerating recovery responses, single-use reset processing, current-password verification, session cleanup, and Origin checks. Database tests also verify that migrations preserve unrelated application objects and that delegation expiry and leave dates use the company timezone.

## Browser coverage

The Playwright suite exercises the fixed fictional development persona. It covers navigation, employee search/filter/pagination, employee creation and persistence, task completion, leave request/review behavior, profile settings, private document and payslip download UI, responsive layouts, keyboard interaction with navigation/dialogs, and automated accessibility checks. Desktop and mobile screenshots can be generated under the ignored `artifacts` directory.

## Live Supabase acceptance checks

Use a disposable local Supabase project with the supplied migrations, seed, Auth templates, and `seed:accounts` script. Then verify:

1. **Login/logout:** sign in as `priya.shah@example.test` using the password supplied to the seed script. Confirm that only her own employee/private records are available, then sign out. Reusing the old session must be rejected.
2. **Privileged MFA:** sign in as `maya.chen@example.test`. Complete enrollment and a six-digit verification. AAL1 access to authenticated records must fail before verification.
3. **Recovery:** request a reset from `/forgot-password`, open the local mail inbox, use the token once, set a new password, and confirm old sessions are rejected. Reusing the link or ticket must fail. An expired link must fail. Responses must not reveal whether an email exists.
4. **Invitation:** use an account with `accounts.manage` to invite an employee without an account. Activate from the email; sign in; confirm baseline self-service, with elevated grants only after an explicit role/permission assignment.
5. **Status:** suspend/deactivate a second user while they are signed in in another browser. Their next page load, API mutation, private read, and document download must fail. Reactivation requires a fresh sign-in.
6. **Object access:** request another employee's `/api/downloads/payslip/<id>` and `/api/downloads/document/<id>`. Confirm denial. Try direct PostgREST sensitive-table requests and raw storage object paths; confirm denial.
7. **Scope:** restrict a manager to one team. Check directory search, exports, schedules, leave, private downloads, and direct API requests against an employee outside that team.
8. **Approvals:** submit leave, verify reserved balance and notification, approve with the assigned authorized reviewer, and verify updated balance/status. Repeat with self-approval and an unassigned reviewer; both must fail. Exercise delegate expiry.
9. **Payroll:** create/import drafts as the payroll account. Confirm the employee cannot see drafts. Publish; verify notification and the employee's authorized CSV download. Confirm HR/technical accounts cannot read compensation without a grant.
10. **Files and reviews:** upload a policy and a restricted employee document. Verify audience, acknowledgement, and audit events. Confirm that only the assigned reviewer can write reviewer feedback and that employees can write only their own reflection.

## Current data-window assumptions

The directory uses server-side filtering, exact counts, and eight-row pagination. Other screens use bounded authorized data windows: 300 recent attendance/leave/document records, 100 schedules/corrections/announcements, 1,000 payslips/reviews, 300 tasks, 200 training/extra-request/recommendation records, 30 notifications, 20 upcoming events, and 100 audit rows on screen. The schema retains the full history. Adjust or add cursor-paginated history screens before onboarding a workforce that exceeds these initial viewing windows.

## Remaining environment setup

Configure the Supabase project, apply migrations, supply environment variables, set SMTP/templates/redirect URLs/MFA options, bootstrap an administrator, assign real permissions/routes, replace fictional policies, and choose a Node-compatible host. No live Supabase project, public website deployment, payroll jurisdiction, or external messaging service is provisioned by the source repository.
