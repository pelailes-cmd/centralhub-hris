# Set up CentralHub using your browser

This guide is for the existing **Vercel + hosted Supabase** deployment:

- Website: <https://centralhub-hris.vercel.app>
- Hosting: <https://vercel.com/afhinzzailes-9029s-projects/centralhub-hris>
- Source: <https://github.com/pelailes-cmd/centralhub-hris>
- Backend: open your project at <https://supabase.com/dashboard>.

Vercel builds and runs the website. You can complete these steps without installing Node.js, Docker, or the Supabase CLI. The README's `.env.local`, local build, and sample-account instructions are for development on your computer.

This guide assumes the SQL files in `supabase/migrations` have already been applied in filename order. Applying SQL does not change the hosted project's Auth dashboard settings or create a sign-in account. `supabase/config.toml` configures local Supabase only.

## 1. Check the website configuration

Open the Vercel project, then **Settings → Environment Variables**. Check that the following names exist for **Production**. Values go in Vercel, never in GitHub files or chat.

| Name                                   | Value or source                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project's URL, shown in its Connect dialog or Settings → Data API                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Settings → API Keys → publishable key                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`            | Supabase Settings → API Keys → legacy `service_role` key; mark this Vercel variable **Sensitive** |
| `NEXT_PUBLIC_SITE_URL`                 | `https://centralhub-hris.vercel.app`                                                              |
| `AUTH_RATE_LIMIT_PEPPER`               | A unique random secret of at least 32 characters; mark it **Sensitive**                           |
| `ENABLE_DEMO`                          | `false`                                                                                           |
| `ALLOW_DEVELOPMENT_SEED`               | `false`                                                                                           |

**For this deployment, these seven variables were already present when this guide was added. The site served its login page successfully. You do not need to recreate them or generate another pepper.** This check confirms configuration is present; successful account login still needs the following steps.

If you later change an environment value, open **Deployments**, find the current production deployment, open its **⋯** menu, and choose **Redeploy**. Wait for **Ready**, then open <https://centralhub-hris.vercel.app/login>. Supabase dashboard setting changes themselves do not require a Vercel redeployment.

## 2. Set the login and email-link URLs

In your Supabase project, open **Authentication → URL Configuration**.

1. Set **Site URL** to `https://centralhub-hris.vercel.app` and save.
2. Under **Redirect URLs**, click **Add URL**.
3. Add exactly `https://centralhub-hris.vercel.app/auth/confirm` and save.

Use the stable website address above, not a temporary Vercel deployment address or the GitHub repository URL.

## 3. Configure authentication

Open **Authentication → Sign In / Providers**. In **User Signups**, set:

| Setting                    | Value |
| -------------------------- | ----- |
| Allow new users to sign up | Off   |
| Allow anonymous sign-ins   | Off   |
| Confirm email              | On    |

Save changes. Disabling public sign-up still allows your administrator to create and invite users.

Open the **Email** provider and keep email/password sign-in enabled. Set the **minimum password length** to **12** and **Email OTP expiry** to **1800 seconds**, then save. If your dashboard shows secure password changes or confirmation of email changes, keep those protections enabled.

Open **Authentication → Sessions**:

1. In **Access Tokens**, set **Access token expiry time** to **900 seconds**, then save.
2. In **Refresh Tokens**, turn **Detect and revoke potentially compromised refresh tokens** on. This is refresh-token rotation.
3. Set **Refresh token reuse interval** to **10 seconds**, then save.

The separate **User Sessions** controls may require a paid Supabase plan. They are not needed to set the access-token and refresh-token options above. CentralHub also enforces its own eight-hour application sessions.

Open **Authentication → Multi-Factor Authentication**. Set **TOTP (App Authenticator)** to **Enabled**, set **Maximum number of per-user MFA factors** to **3**, and save. **Enabled** permits both enrollment and verification; **Verify Enabled** only lets already-enrolled users verify. TOTP is the six-digit code supplied by an authenticator app such as Microsoft Authenticator, Google Authenticator, or 1Password. CentralHub requires it for privileged accounts.

Open **Authentication → Rate Limits** and set these initial values, matching the project's local configuration:

| Setting                              | Initial value | Dashboard unit                                                                      |
| ------------------------------------ | ------------- | ----------------------------------------------------------------------------------- |
| Rate limit for sign-ups and sign-ins | **30**        | Requests per five minutes per IP address                                            |
| Rate limit for token verifications   | **20**        | OTP/magic-link verifications per five minutes per IP address                        |
| Rate limit for sending emails        | **6**         | Emails per hour for the project; editable after custom SMTP is configured in step 7 |

Save changes. Leave unrelated limits at their defaults. If the email field is disabled, complete step 7 and return here. Six emails per hour is a small setup limit; increase it to fit your team's invitation/recovery needs and SMTP provider allowance before a larger rollout. CentralHub separately limits login/recovery operations to eight attempts per email and operation within 15 minutes.

## 4. Create your first login in Supabase

SMTP is not required for this first account because you will create it with a password in the project dashboard.

1. Open **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Enter your real work email address.
4. Choose a unique password of at least **12 characters** and save it in your password manager.
5. Enable **Auto Confirm User** for this initial administrator.
6. Click **Create user**.

You should now see that email in the Users list. If you already created this same confirmed user, reuse it and its password instead of creating another one.

This creates the login identity. The next step connects it to CentralHub and grants its initial permissions. Do not enter passwords or API keys into the SQL editor.

## 5. Connect that login to the first administrator account

1. Open [`scripts/bootstrap-admin-dashboard.sql`](../scripts/bootstrap-admin-dashboard.sql) in GitHub.
2. Click **Raw** to view only the SQL. Select all the SQL and copy it.
3. Return to Supabase and open **SQL Editor → New query**.
4. Paste the complete SQL. Near the top, replace `REPLACE_WITH_YOUR_ADMIN_EMAIL` with the exact email you created in step 4 and `REPLACE_WITH_YOUR_FULL_NAME` with your full name. Keep the surrounding `$email$` and `$name$` markers.

For example, those two lines will look like this, using your own details:

```sql
v_admin_email text := lower(btrim($email$your.name@your-company.com$email$));
v_admin_name text := btrim($name$Your Full Name$name$);
```

These are just the two editable lines; run the **complete file**, not only this example. Leave the employee number as `CH-ADMIN-001` unless that number already belongs to someone else.

5. Keep the SQL Editor's database role set to **postgres** and click **Run**.
6. The result should show your email, status **active**, and the roles **Owner** and **Technical Administrator**.

The setup is a one-time database transaction. It refuses to run if any CentralHub account already exists, if the Auth user is unconfirmed/disabled, or if a matching employee is archived. It can reuse a matching existing employee without changing that person's job title or classification. If a database write fails, its new account/employee/permission changes roll back together; the Auth user from step 4 remains available.

If you see **“CentralHub already has an account”**, do not delete records to get past it. Use the existing administrator account. The setup intentionally does not overwrite an existing workspace.

If you previously ran `supabase/seed.sql`, the fictional employees do not have passwords or sign-in accounts. Keep `ENABLE_DEMO=false`; the seed is unnecessary for hosted setup. Review and archive fictional employee records before adding real staff rather than resetting a database that may contain real information.

## 6. Sign in and configure your responsibilities

1. Open <https://centralhub-hris.vercel.app/login>.
2. Sign in with the email and password from step 4.
3. On the MFA screen, click **Set up authenticator**.
4. In your authenticator app, add an account and scan the QR code displayed by CentralHub, or enter its setup key manually.
5. Enter the current **6-digit verification code** and click **Verify and continue**.

You should reach the CentralHub dashboard. Owner + Technical Administrator provides company/access administration and account operations. HR and payroll responsibilities must be assigned explicitly.

If you will maintain employee records:

1. Open **Administration → Roles & permissions → Assign role**.
2. Set **Account** to your account.
3. Set **Role template** to **HR Administrator**.
4. Set **Access scope** to **Company-wide**, if you are responsible for the whole company.
5. Click **Save changes**.

Only assign **Payroll Administrator** to someone authorized to handle payroll. Medical, disciplinary, bank, government-ID, and identity-document permissions remain separate. See the [permission matrix](PERMISSIONS.md).

Configure **Company settings**, then departments, teams, positions, leave types, annual allowances, and holidays under **Administration → Organization**. Add real employees under **People** after assigning HR responsibility. Set explicit approvers in **Administration → Approval workflows**, with the corresponding permissions and scope assigned to their accounts. Add work schedules using **Attendance → Assign a shift**. Employees cannot approve their own requests, so a second authorized approver is needed for an approver's own requests.

## 7. Configure email before inviting employees

Invitations and forgotten-password emails require a working email sender. Supabase's built-in sender has restrictions and is unsuitable for a staff rollout. Configure **custom SMTP** using an email provider and a verified sender address/domain.

In Supabase, open **Authentication → Emails**, then its **SMTP Settings** or custom SMTP section. Enter the sender name, sender email, SMTP host, port, username, and SMTP password supplied by your email provider. Save the settings. These credentials belong in Supabase, not GitHub.

For example, if you use [Resend](https://resend.com/docs/send-with-supabase-smtp):

1. Add a domain you own in Resend and complete the DNS verification it requests.
2. Create a sending API key.
3. Use SMTP host `smtp.resend.com`, port `465`, username `resend`, and that API key as the SMTP password.
4. Set the sender to an address on your verified domain, and the sender name to **CentralHub**.

Other providers work too; use their documented SMTP values. If you do not yet have a sender/provider, you can still complete first-administrator password login, MFA, and company settings. Finish email setup before relying on invitations or password recovery.

Next, open the Supabase Auth **Email Templates** section:

| Template       | Copy the entire file into the template message body                       |
| -------------- | ------------------------------------------------------------------------- |
| Invite user    | [`supabase/templates/invite.html`](../supabase/templates/invite.html)     |
| Reset password | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) |

Open each file in GitHub, click **Raw**, copy the complete HTML, paste it into the corresponding template, and save. Set subjects such as **Your invitation to CentralHub** and **Reset your CentralHub password**. Keep `{{ .SiteURL }}` and `{{ .TokenHash }}` exactly as written; Supabase fills them in when sending the email.

## 8. Verify one invitation and password reset

1. As an authorized HR administrator, create an employee record in **People** using an email inbox you can access for testing.
2. Open **Administration → Accounts → Invite employee**, select that employee, and send the invitation. Use CentralHub for subsequent account invitations so it also creates the necessary employee/account link.
3. Open the invitation in a separate browser profile or private window. Set a password and sign in. Verify that the employee sees their own records and has only the permissions you assigned.
4. Sign out of that employee account. Open <https://centralhub-hris.vercel.app/forgot-password>, request a reset, and use the email to choose a new password.
5. Confirm the new password works and the used reset link cannot be reused. The recovery email expires after 30 minutes with the settings above.
6. With the appropriate document permission, upload and download a small test document. Confirm **Storage → hris-private** exists in Supabase and stays **private**. The migrations create this bucket; making it public would expose files outside the application's access checks.

## If a step does not work

| Symptom                                      | What to check                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Website shows a setup page                   | All required Vercel variables are in Production; redeploy after adding/changing them.                                                                              |
| Login fails after creating a Supabase user   | Use the correct password, confirm the email, and complete step 5 so `public.accounts` links that Auth user to an active employee account.                          |
| SQL says the Auth user does not exist        | The email in the SQL must match the user created in Authentication → Users in the same Supabase project.                                                           |
| SQL says an account already exists           | Use the existing administrator; do not rerun setup or remove accounts to bypass the guard.                                                                         |
| An authenticator code is rejected            | Use the current code for this CentralHub account and enable automatic date/time on the phone. Check that TOTP enrollment and verification are enabled in Supabase. |
| Invitation or recovery email does not arrive | Check spam, SMTP provider delivery logs, the verified sender, Supabase Auth logs, and email rate limits. Request a fresh link after fixing delivery.               |
| Email link opens localhost or fails          | Recheck Site URL, the exact `/auth/confirm` redirect URL, and both HTML templates, then request a new link.                                                        |
| People editing or payroll is unavailable     | Assign the appropriate functional role and scope under Administration; a job title or Owner classification does not grant that access.                             |

The local-development commands `supabase start`, `supabase db reset`, `npm run seed:accounts`, `npm run build`, and `npm start` are not part of these hosted steps. GitHub stores the source, Vercel builds/runs the website, and Supabase runs the backend.
