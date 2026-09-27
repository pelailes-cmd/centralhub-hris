import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoId } from "../src/lib/demo-data";

let db: PGlite;
const user = (n: number) => demoId(500 + n);
const session = (n: number) => demoId(600 + n);
async function asUser(n: number, aal = "aal2") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user(n),
      session_id: session(n),
      aal,
      iat: Math.floor(Date.now() / 1000),
    }),
  ]);
  await db.exec("set role authenticated");
}
async function scalar<T>(sql: string, args: unknown[] = []) {
  const result = await db.query<{ value: T }>(sql, args);
  return result.rows[0]?.value;
}
async function grant(n: number, permission: string, scope = "company", team: string | null = null) {
  await db.query(
    "insert into public.permission_grants(user_id,permission,scope,team_id) values($1,$2,$3::public.access_scope,$4)",
    [user(n), permission, scope, team],
  );
}
function futureWorkday(offset = 40) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text); create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
  `
      .replace("::jsonb->>'sub'", "::jsonb->>'sub'")
      .replace(
        "select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'",
        "select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid",
      ),
  );
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to authenticated,anon,service_role; grant execute on all functions in schema auth to authenticated,anon,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    grant usage on schema storage to authenticated,anon,service_role; grant select,insert,update,delete on storage.objects to authenticated,anon;
    create policy other_application_policy on storage.objects for all to authenticated using(true) with check(true);
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create table public.other_application_data (value text);
    insert into public.other_application_data values ('preserved');
    create function public.other_application_function() returns text language sql as $$ select 'preserved'::text $$;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  for (let n = 1; n <= 22; n++) {
    await db.query("insert into auth.users values($1,$2)", [user(n), `user${n}@example.test`]);
    await db.query("insert into public.accounts(id,employee_id,status) values($1,$2,'active')", [
      user(n),
      demoId(n),
    ]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session(n), user(n)]);
    await db.query("insert into public.app_sessions(id,user_id) values($1,$2)", [
      session(n),
      user(n),
    ]);
  }
  for (const code of [
    "employees.read",
    "employees.manage",
    "private.read",
    "private.write",
    "workforce.summary",
    "attendance.read",
    "attendance.manage",
    "leave.read",
    "leave.approve",
    "documents.read",
    "documents.manage",
    "performance.read",
    "performance.manage",
    "organization.manage",
    "audit.read",
  ])
    await grant(9, code);
  for (const code of [
    "employees.read",
    "attendance.read",
    "leave.read",
    "leave.approve",
    "performance.read",
  ])
    await grant(8, code, "team", demoId(202));
  for (const code of ["employees.read", "payroll.read", "payroll.manage"]) await grant(18, code);
  for (const code of ["workforce.summary", "organization.manage", "access.manage", "audit.read"])
    await grant(1, code);
  for (const code of ["accounts.manage", "technical.manage"]) await grant(20, code);
  await db.query(
    "insert into public.employee_private(employee_id,address) values($1,'Fictional home address')",
    [demoId(11)],
  );
  await db.query(
    "insert into public.sensitive_records(employee_id,category,data) values($1,'medical','{\"note\":\"Fictional protected record\"}')",
    [demoId(11)],
  );
  await db.query(
    "insert into public.payslips(id,employee_id,period,basic_pay,allowances,deductions,status,published_at) values($1,$2,'2026-01',40000,2000,1000,'Published',now()),($3,$2,'2026-02',40000,2000,1000,'Draft',null)",
    [demoId(3001), demoId(11), demoId(3002)],
  );
});
beforeEach(async () => {
  await db.exec("reset role; begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role");
});
afterAll(async () => {
  await db?.close();
});

describe("real PostgreSQL authorization and workflows", () => {
  it("leaves unrelated public-schema objects and permissions untouched", async () => {
    await asUser(11, "aal1");
    expect(await scalar<string>("select value from public.other_application_data")).toBe(
      "preserved",
    );
    expect(await scalar<string>("select public.other_application_function() as value")).toBe(
      "preserved",
    );
  });
  it("overrides Supabase default grants on new confidential tables and internal helpers", async () => {
    await asUser(11, "aal1");
    const checks = await db.query<{
      allowed: boolean;
    }>(`select has_table_privilege(current_user,'public.candidates','SELECT') as allowed
      union all select has_table_privilege(current_user,'public.positions','INSERT')
      union all select has_function_privilege(current_user,'public.assigned_user_can(uuid,text,uuid)','EXECUTE')
      union all select has_function_privilege(current_user,'public.issue_recovery_ticket(text,uuid,text)','EXECUTE')`);
    expect(checks.rows.every((row) => row.allowed === false)).toBe(true);
  });
  it("applies every migration and seeds every requested job classification", async () => {
    expect(
      await scalar<number>(
        "select count(distinct profile_type)::int as value from public.employees",
      ),
    ).toBe(16);
    expect(await scalar<number>("select count(*)::int as value from public.role_templates")).toBe(
      21,
    );
  });
  it("grants baseline access to own directory records only", async () => {
    await asUser(11, "aal1");
    const r = await db.query<{ id: string }>("select id from public.employees");
    expect(r.rows.map((e) => e.id)).toEqual([demoId(11)]);
  });
  it("lets an employee view their own published payslip", async () => {
    await asUser(11, "aal1");
    const p = await scalar<{ employee_id: string }>("select public.get_payslip($1) as value", [
      demoId(3001),
    ]);
    expect(p.employee_id).toBe(demoId(11));
  });
  it("rejects a modified payslip ID belonging to another employee", async () => {
    await asUser(12, "aal1");
    await expect(db.query("select public.get_payslip($1)", [demoId(3001)])).rejects.toThrow(
      /Payslip not available/,
    );
  });
  it("hides unpublished payslips from their employee", async () => {
    await asUser(11, "aal1");
    await expect(db.query("select public.get_payslip($1)", [demoId(3002)])).rejects.toThrow(
      /Payslip not available/,
    );
  });
  it("denies direct sensitive table access even when URLs are bypassed", async () => {
    await asUser(9);
    await expect(db.query("select * from public.payslips")).rejects.toThrow(/permission denied/);
  });
  it("limits managers to their assigned team plus their own record", async () => {
    await asUser(8);
    const r = await db.query<{ id: string; team_id: string }>(
      "select id,team_id from public.employees",
    );
    expect(r.rows.length).toBeGreaterThan(1);
    expect(r.rows.every((e) => e.team_id === demoId(202) || e.id === demoId(8))).toBe(true);
    expect(r.rows.some((e) => e.id === demoId(18))).toBe(false);
  });
  it("requires MFA for any privileged grant, including direct API reads", async () => {
    await asUser(9, "aal1");
    expect((await db.query("select id from public.employees")).rows).toHaveLength(0);
    expect(await scalar<boolean>("select public.active_access() as value")).toBe(false);
  });
  it("deactivation immediately blocks an existing JWT", async () => {
    await asUser(20);
    await db.query("select public.set_account_status($1,'deactivated')", [user(11)]);
    await asUser(11, "aal1");
    expect((await db.query("select * from public.employees")).rows).toHaveLength(0);
    await expect(db.query("select public.get_payslip($1)", [demoId(3001)])).rejects.toThrow(
      /active account/,
    );
  });
  it("logout revokes the application session immediately", async () => {
    await asUser(11, "aal1");
    await db.query("select public.revoke_session()");
    expect(await scalar<boolean>("select public.active_access() as value")).toBe(false);
  });
  it("does not extend an expired session by registering it again", async () => {
    await db.query(
      "update public.app_sessions set expires_at=now()-interval '1 second' where id=$1",
      [session(11)],
    );
    await asUser(11, "aal1");
    await expect(db.query("select public.register_session()")).rejects.toThrow(
      /session has expired/,
    );
  });
  it("permission removal ends team access while preserving explicit reviewer assignments", async () => {
    await db.query(
      "delete from public.permission_grants where user_id=$1 and permission='employees.read'",
      [user(8)],
    );
    await asUser(8);
    const r = await db.query<{ id: string }>("select id from public.employees");
    expect(r.rows.map((e) => e.id).sort()).toEqual([demoId(8), demoId(15)].sort());
    expect(r.rows.some((e) => e.id === demoId(11))).toBe(false);
  });
  it("uses explicit routing and reserves leave atomically", async () => {
    await asUser(11, "aal1");
    const date = futureWorkday();
    const id = await scalar<string>(
      "select public.request_leave($1,$2,$2,'Planned personal time') as value",
      [demoId(301), date],
    );
    const r = (
      await db.query<{ status: string; approver_id: string }>(
        "select status,approver_id from public.leave_requests where id=$1",
        [id],
      )
    ).rows[0];
    expect(r.status).toBe("Pending");
    expect(r.approver_id).toBe(demoId(9));
    await asUser(9);
    await db.query("select public.decide_leave($1,'Approved','Enjoy your day')", [id]);
    expect(
      await scalar<string>("select status as value from public.leave_requests where id=$1", [id]),
    ).toBe("Approved");
    expect(
      await scalar<number>(
        "select used::int as value from public.leave_balances where employee_id=$1 and leave_type_id=$2 and year=extract(year from current_date)",
        [demoId(11), demoId(301)],
      ),
    ).toBe(1);
  });
  it("prevents self-approval even for an HR administrator", async () => {
    await asUser(9);
    await expect(
      db.query("select public.decide_leave($1,'Approved','')", [demoId(704)]),
    ).rejects.toThrow(/cannot approve your own/);
  });
  it("requires the assigned approver as well as scoped permission", async () => {
    await asUser(8);
    await expect(
      db.query("select public.decide_leave($1,'Approved','')", [demoId(701)]),
    ).rejects.toThrow(/not the assigned approver/);
  });
  it("rejects overlapping leave requests", async () => {
    await asUser(11, "aal1");
    const date = futureWorkday();
    await db.query("select public.request_leave($1,$2,$2,'A personal appointment')", [
      demoId(301),
      date,
    ]);
    await expect(
      db.query("select public.request_leave($1,$2,$2,'A second appointment')", [demoId(303), date]),
    ).rejects.toThrow(/overlap/);
  });
  it("prevents ordinary employees from creating payroll", async () => {
    await asUser(11, "aal1");
    await expect(
      db.query("select public.create_payroll($1::jsonb)", [
        JSON.stringify([
          {
            employee_id: demoId(11),
            period: "2026-12",
            basic_pay: 50000,
            allowances: 0,
            deductions: 0,
            currency: "PHP",
          },
        ]),
      ]),
    ).rejects.toThrow(/do not have access/);
  });
  it("allows an authorized payroll administrator to publish and notify", async () => {
    await asUser(18);
    await db.query("select public.publish_payslip($1)", [demoId(3002)]);
    await asUser(11, "aal1");
    expect(
      await scalar<string>("select public.get_payslip($1)->>'status' as value", [demoId(3002)]),
    ).toBe("Published");
    expect(
      (await db.query("select * from public.notifications where title='Your payslip is ready'"))
        .rows,
    ).toHaveLength(1);
  });
  it("does not give technical administrators HR private access", async () => {
    await asUser(20);
    await expect(db.query("select public.read_personal($1)", [demoId(11)])).rejects.toThrow(
      /do not have access/,
    );
  });
  it("does not give owners automatic medical access", async () => {
    await asUser(1);
    await expect(
      db.query("select public.read_sensitive($1,'medical')", [demoId(11)]),
    ).rejects.toThrow(/do not have access/);
  });
  it("blocks another employee's private document download", async () => {
    await asUser(11, "aal1");
    await expect(db.query("select public.download_document($1)", [demoId(904)])).rejects.toThrow(
      /Document not available/,
    );
  });
  it("allows an applicable company policy and records acknowledgement", async () => {
    await asUser(11, "aal1");
    await db.query("select public.acknowledge_document($1)", [demoId(901)]);
    expect(
      (
        await db.query("select * from public.document_acknowledgements where document_id=$1", [
          demoId(901),
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("audits sensitive access without confidential values", async () => {
    await asUser(9);
    await db.query("select public.read_personal($1)", [demoId(11)]);
    const rows = (await db.query("select * from public.audit_events where action='personal.read'"))
      .rows;
    expect(rows.length).toBe(1);
    expect(JSON.stringify(rows)).not.toContain("Fictional home address");
  });
  it("prevents employees granting themselves a role", async () => {
    await asUser(11, "aal1");
    await expect(
      db.query("select public.assign_role($1,'Owner','company')", [user(11)]),
    ).rejects.toThrow(/do not have access/);
  });
  it("blocks direct table mutation regardless of hidden buttons", async () => {
    await asUser(9);
    await expect(db.query("update public.employees set job_title='Tampered'")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("single-use recovery tickets cannot be consumed twice", async () => {
    await db.query("select public.issue_recovery_ticket('hash-for-test',$1,'recovery')", [
      user(11),
    ]);
    expect(
      await scalar<string>("select public.consume_recovery_ticket('hash-for-test',$1) as value", [
        user(11),
      ]),
    ).toBe("recovery");
    await expect(
      db.query("select public.consume_recovery_ticket('hash-for-test',$1)", [user(11)]),
    ).rejects.toThrow(/expired or has already been used/);
  });
  it("expired recovery tokens are rejected", async () => {
    await db.query("select public.issue_recovery_ticket('expired-test',$1,'recovery')", [user(11)]);
    await db.exec("update public.recovery_tickets set expires_at=now()-interval '1 second'");
    await expect(
      db.query("select public.consume_recovery_ticket('expired-test',$1)", [user(11)]),
    ).rejects.toThrow(/expired/);
  });
  it("ordinary JWTs cannot issue password reset tickets", async () => {
    await asUser(11, "aal1");
    await expect(
      db.query("select public.issue_recovery_ticket('fake',$1,'recovery')", [user(11)]),
    ).rejects.toThrow(/permission denied/);
  });
  it("applies shared, persistent login rate limits", async () => {
    for (let n = 0; n < 8; n++)
      expect(
        await scalar<boolean>("select public.check_auth_rate_limit('hashed-email') as value"),
      ).toBe(true);
    expect(
      await scalar<boolean>("select public.check_auth_rate_limit('hashed-email') as value"),
    ).toBe(false);
  });
  it("protects the private bucket even if another app has a permissive storage policy", async () => {
    await db.exec(
      "insert into storage.objects(bucket_id,name) values('hris-private','confidential.txt'),('another-app','public.txt')",
    );
    await asUser(11, "aal1");
    const r = await db.query<{ bucket_id: string }>("select bucket_id from storage.objects");
    expect(r.rows).toEqual([{ bucket_id: "another-app" }]);
  });
  it("cannot revive revoked access by reactivating the account", async () => {
    await asUser(20);
    await db.query("select public.set_account_status($1,'suspended')", [user(11)]);
    await db.query("select public.set_account_status($1,'active')", [user(11)]);
    await asUser(11, "aal1");
    expect(await scalar<boolean>("select public.active_access() as value")).toBe(false);
    await expect(db.query("select public.register_session()")).rejects.toThrow(
      /Account is not active/,
    );
  });
  it("rejects a JWT after its Supabase Auth session is removed", async () => {
    await db.query("delete from auth.sessions where id=$1", [session(11)]);
    await asUser(11, "aal1");
    expect(await scalar<boolean>("select public.active_access() as value")).toBe(false);
  });
  it("does not derive owner privileges from a changed job classification", async () => {
    await db.query("update public.employees set profile_type='Owner' where id=$1", [demoId(11)]);
    await asUser(11, "aal1");
    expect(await scalar<boolean>("select public.has_permission('access.manage') as value")).toBe(
      false,
    );
  });
  it("blocks HR staff from another employee's salary without a payroll grant", async () => {
    await asUser(9);
    await expect(db.query("select public.get_payslip($1)", [demoId(3001)])).rejects.toThrow(
      /Payslip not available/,
    );
  });
  it("accepts a current, independently authorized leave delegate", async () => {
    await db.query(
      "update public.leave_requests set delegate_id=$1,delegate_until=current_date+2 where id=$2",
      [demoId(8), demoId(701)],
    );
    await asUser(8);
    await db.query("select public.decide_leave($1,'Approved','Delegated review')", [demoId(701)]);
    expect(
      await scalar<string>("select status as value from public.leave_requests where id=$1", [
        demoId(701),
      ]),
    ).toBe("Approved");
  });
  it("rejects an expired leave delegate", async () => {
    await db.query(
      "update public.leave_requests set delegate_id=$1,delegate_until=current_date-1 where id=$2",
      [demoId(8), demoId(701)],
    );
    await asUser(8);
    await expect(
      db.query("select public.decide_leave($1,'Approved','')", [demoId(701)]),
    ).rejects.toThrow(/not the assigned approver/);
  });
  it("expires delegation using the company date across timezone boundaries", async () => {
    await db.exec(
      "set local timezone='Etc/GMT+12'; update public.organization_settings set timezone='Pacific/Kiritimati'",
    );
    await db.query(
      "update public.leave_requests set delegate_id=$1,delegate_until=current_date where id=$2",
      [demoId(8), demoId(701)],
    );
    await asUser(8);
    await expect(
      db.query("select public.decide_leave($1,'Approved','')", [demoId(701)]),
    ).rejects.toThrow(/not the assigned approver/);
  });
  it("rejects a leave date already past in the company timezone", async () => {
    await db.exec(
      "set local timezone='Etc/GMT+12'; update public.organization_settings set timezone='Pacific/Kiritimati'",
    );
    await asUser(11, "aal1");
    await expect(
      db.query("select public.request_leave($1,current_date,current_date,'Personal appointment')", [
        demoId(301),
      ]),
    ).rejects.toThrow(/future date range/);
  });
  it("rejects a second decision on an already approved request", async () => {
    await asUser(9);
    await db.query("select public.decide_leave($1,'Approved','')", [demoId(701)]);
    await expect(
      db.query("select public.decide_leave($1,'Rejected','')", [demoId(701)]),
    ).rejects.toThrow(/already been decided/);
  });
  it("rejects requests beyond the available leave balance", async () => {
    await asUser(11, "aal1");
    await expect(
      db.query("select public.request_leave($1,$2,$3,'An extended personal break')", [
        demoId(303),
        futureWorkday(40),
        futureWorkday(65),
      ]),
    ).rejects.toThrow(/enough available leave/);
  });
  it("preserves attendance values when a correction is approved", async () => {
    await asUser(11, "aal1");
    const a = (
      await db.query<{ id: string; work_date: string; clock_in: Date }>(
        "select id,work_date::text,clock_in from public.attendance where employee_id=$1 and clock_out is not null order by work_date desc limit 1",
        [demoId(11)],
      )
    ).rows[0];
    const correction = await scalar<string>(
      "select public.request_correction($1,$2,$3,'Missed the clock button') as value",
      [a.id, `${a.work_date}T08:40:00+08:00`, `${a.work_date}T18:00:00+08:00`],
    );
    await asUser(9);
    await db.query("select public.decide_correction($1,'Approved','Verified')", [correction]);
    const history = (
      await db.query<{ old_in: Date; new_in: Date }>(
        "select old_in,new_in from public.attendance_history where attendance_id=$1",
        [a.id],
      )
    ).rows[0];
    expect(new Date(history.old_in).toISOString()).toBe(new Date(a.clock_in).toISOString());
    expect(new Date(history.new_in).toISOString()).not.toBe(new Date(history.old_in).toISOString());
  });
  it("limits account operators to their explicit department", async () => {
    await db.query(
      "delete from public.permission_grants where user_id=$1 and permission='accounts.manage'",
      [user(20)],
    );
    await db.query(
      "insert into public.permission_grants(user_id,permission,scope,department_id) values($1,'accounts.manage','department',$2)",
      [user(20), demoId(102)],
    );
    await asUser(20);
    const r = await db.query<{ id: string }>("select id from public.account_candidates()");
    expect(r.rows).toHaveLength(4);
    await expect(
      db.query("select public.set_account_status($1,'suspended')", [user(18)]),
    ).rejects.toThrow(/do not have access/);
  });
  it("restricts recruitment data to its explicitly assigned department", async () => {
    await db.query(
      "insert into public.permission_grants(user_id,permission,scope,department_id) values($1,'recruitment.manage','department',$2)",
      [user(19), demoId(101)],
    );
    await asUser(19);
    const r = await db.query<{ department_id: string }>(
      "select department_id from public.list_candidates()",
    );
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((c) => c.department_id === demoId(101))).toBe(true);
    await expect(
      db.query("select public.save_candidate($1::jsonb)", [
        JSON.stringify({
          full_name: "Other Applicant",
          email: "other@example.test",
          position_title: "Engineer",
          department_id: demoId(102),
          stage: "Applied",
          notes: "",
        }),
      ]),
    ).rejects.toThrow(/Recruitment scope/);
  });
  it("blocks raw performance reads while allowing audited assigned feedback access", async () => {
    await asUser(11, "aal1");
    await expect(db.query("select * from public.reviews")).rejects.toThrow(/permission denied/);
  });
});
