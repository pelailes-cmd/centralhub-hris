import { describe, expect, it } from "vitest";
import { demoId, makeDemoData } from "../src/lib/demo-data";
import { csvCell } from "../src/lib/downloads";
import { parsePayrollCsv } from "../src/lib/payroll-csv";
import { can, roleTemplates } from "../src/lib/permissions";
import { leaveSchema, passwordSchema, payrollSchema } from "../src/lib/validation";
describe("input boundaries and permission templates", () => {
  it("requires a long password", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a long unique passphrase").success).toBe(true);
  });
  it("rejects backwards leave dates", () => {
    expect(
      leaveSchema.safeParse({
        leave_type_id: demoId(301),
        start_date: "2026-11-20",
        end_date: "2026-11-19",
        reason: "Annual leave",
      }).success,
    ).toBe(false);
  });
  it("rejects deductions above gross pay", () => {
    expect(
      payrollSchema.safeParse({
        employee_id: demoId(11),
        period: "2026-09",
        basic_pay: 100,
        allowances: 0,
        deductions: 101,
        currency: "PHP",
      }).success,
    ).toBe(false);
  });
  it("neutralizes spreadsheet formulas in exports", () => {
    expect(csvCell('=WEBSERVICE("url")')).toBe('"\'=WEBSERVICE(""url"")"');
    expect(csvCell("+SUM(A1)")).toBe('"\'+SUM(A1)"');
  });
  it("parses and validates payroll imports", () => {
    const rows = parsePayrollCsv(
      `employee_id,period,basic_pay,allowances,deductions,currency\n${demoId(11)},2026-09,40000,1000,2000,PHP`,
    );
    expect(rows[0].basic_pay).toBe(40000);
    expect(() => parsePayrollCsv("name,salary\nSam,123")).toThrow(/exact header/);
  });
  it("provides all 16 job templates and 5 independent functional roles", () => {
    expect(Object.keys(roleTemplates)).toHaveLength(21);
    expect(roleTemplates.Owner.permissions).not.toContain("payroll.read");
    expect(roleTemplates.Supervisor.permissions).not.toContain("leave.approve");
    expect(roleTemplates["Technical Administrator"].permissions).not.toContain("private.read");
  });
  it("does not give the demo HR administrator payroll privileges", () => {
    const d = makeDemoData();
    expect(can(d.viewer, "payroll.manage")).toBe(false);
    expect(can(d.viewer, "employees.manage")).toBe(true);
  });
});
