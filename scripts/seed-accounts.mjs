import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Explicit shell environment is supported. */
}
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  DEMO_ACCOUNT_PASSWORD: password,
} = process.env;
if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEVELOPMENT_SEED !== "true" ||
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "Demo account creation is restricted to an explicitly enabled LOCAL Supabase development project.",
  );
if (!key || !password || password.length < 12)
  throw new Error(
    "Set the local service key and a DEMO_ACCOUNT_PASSWORD of at least 12 characters. There is no default password.",
  );
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const employees = check(
  await client
    .from("employees")
    .select("*")
    .like("email", "%@example.test")
    .order("employee_number"),
);
if (!employees.length)
  throw new Error("Apply migrations and supabase/seed.sql to the disposable local database first.");
const templates = check(await client.from("role_templates").select("*"));
const users = check(await client.auth.admin.listUsers({ perPage: 100, page: 1 })).users;
const functional = {
  "maya.chen@example.test": ["HR Administrator", "Recruitment Officer"],
  "lena.brooks@example.test": "HR Officer",
  "ryan.cole@example.test": "Payroll Administrator",
  "aisha.johnson@example.test": "Recruitment Officer",
  "leo.anderson@example.test": "Technical Administrator",
};
for (const employee of employees) {
  let user = users.find((u) => u.email === employee.email);
  if (!user) {
    const created = await client.auth.admin.createUser({
      email: employee.email,
      password,
      email_confirm: true,
    });
    if (created.error) throw new Error("A development Auth account could not be created.");
    user = created.data.user;
  }
  if (!user) throw new Error("Development user is missing.");
  check(
    await client
      .from("accounts")
      .upsert({ id: user.id, employee_id: employee.id, status: "active" }),
  );
  const names = [
    employee.profile_type,
    ...(functional[employee.email] ? [functional[employee.email]].flat() : []),
  ];
  for (const name of names) {
    const template = templates.find((t) => t.name === name);
    if (!template) throw new Error(`Missing role template ${name}.`);
    const existing = check(
      await client
        .from("role_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("role_name", name),
    );
    if (existing.length) continue;
    const target = {
      user_id: user.id,
      role_name: name,
      scope: template.suggested_scope,
      department_id: template.suggested_scope === "department" ? employee.department_id : null,
      team_id: template.suggested_scope === "team" ? employee.team_id : null,
    };
    const role = check(await client.from("role_assignments").insert(target).select("id").single());
    if (template.permissions.length)
      check(
        await client.from("permission_grants").insert(
          template.permissions.map((permission) => ({
            user_id: user.id,
            permission,
            scope: target.scope,
            department_id: target.department_id,
            team_id: target.team_id,
            role_assignment_id: role.id,
            granted_by: user.id,
          })),
        ),
      );
  }
}
const documents = check(
  await client.from("documents").select("title,storage_path").like("storage_path", "demo/%"),
);
for (const document of documents) {
  const content = `${document.title}\n\nCentralHub fictional development document.\n\nWe create a respectful, inclusive workplace. Keep your information current, follow your assigned schedule, and speak with People & Culture when you need support.\n\nReplace this example with an approved company document before launch.\n`;
  check(
    await client.storage
      .from("hris-private")
      .upload(document.storage_path, content, { contentType: "text/plain", upsert: true }),
  );
}
console.log(
  `Prepared ${employees.length} fictional local accounts and ${documents.length} private document fixtures. No password or token was printed.`,
);
console.log(
  "Sign in using a seeded employee's example.test work email and the password you supplied. Privileged accounts must enroll MFA.",
);
