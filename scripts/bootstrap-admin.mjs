import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Deployment environment variables are also supported. */
}
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  BOOTSTRAP_ADMIN_EMAIL: email,
  BOOTSTRAP_ADMIN_PASSWORD: password,
} = process.env;
if (!url || !key || !email)
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BOOTSTRAP_ADMIN_EMAIL in your environment.",
  );
if (password && password.length < 12)
  throw new Error(
    "Use a bootstrap password of at least 12 characters, or omit it to send an invitation.",
  );
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const existing = await client.from("accounts").select("id", { count: "exact", head: true });
check(existing);
if (existing.count)
  throw new Error(
    "Application accounts already exist. Use the authorized access administration UI instead of bootstrapping again.",
  );
let department = check(
  await client.from("departments").select("id").eq("name", "Leadership").maybeSingle(),
);
if (!department)
  department = check(
    await client
      .from("departments")
      .insert({ name: "Leadership", color: "#178579" })
      .select("id")
      .single(),
  );
let employee = check(
  await client.from("employees").select("id").eq("email", email.toLowerCase()).maybeSingle(),
);
if (!employee)
  employee = check(
    await client
      .from("employees")
      .insert({
        employee_number: process.env.BOOTSTRAP_EMPLOYEE_NUMBER || "CH-0001",
        full_name: process.env.BOOTSTRAP_ADMIN_NAME || "Workspace Administrator",
        email: email.toLowerCase(),
        job_title: "Company Administrator",
        profile_type: "Owner",
        department_id: department.id,
        employment_status: "Active",
        start_date: new Date().toISOString().slice(0, 10),
        location: "Main office",
      })
      .select("id")
      .single(),
  );
const authResult = password
  ? await client.auth.admin.createUser({ email, password, email_confirm: true })
  : await client.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    });
if (authResult.error || !authResult.data.user)
  throw new Error(
    "Could not create the first Auth user. Check the Auth dashboard and email configuration; no existing user was overwritten.",
  );
const user = authResult.data.user;
check(
  await client
    .from("accounts")
    .insert({ id: user.id, employee_id: employee.id, status: password ? "active" : "invited" }),
);
// Explicit bootstrap combination. Owner does not implicitly get confidential HR/payroll access.
for (const name of ["Owner", "Technical Administrator"]) {
  const template = check(
    await client.from("role_templates").select("permissions").eq("name", name).single(),
  );
  const role = check(
    await client
      .from("role_assignments")
      .insert({ user_id: user.id, role_name: name, scope: "company" })
      .select("id")
      .single(),
  );
  if (template.permissions.length)
    check(
      await client.from("permission_grants").insert(
        template.permissions.map((permission) => ({
          user_id: user.id,
          permission,
          scope: "company",
          role_assignment_id: role.id,
          granted_by: user.id,
        })),
      ),
    );
}
check(
  await client.from("audit_events").insert({
    actor_id: user.id,
    action: "system.bootstrap",
    resource_type: "account",
    resource_id: user.id,
  }),
);
console.log(
  password
    ? "First administrator created. Sign in and enroll an authenticator to continue."
    : "First administrator invited. Activate the account from its email, then enroll an authenticator.",
);
console.log(
  "Assigned: Owner + Technical Administrator, company scope. HR and payroll require separate explicit assignments.",
);
