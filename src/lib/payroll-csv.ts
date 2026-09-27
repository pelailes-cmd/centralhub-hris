import { payrollSchema } from "./validation";
export function parsePayrollCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines.length < 2 || lines.length > 201)
    throw new Error("Include a header and between 1 and 200 payroll records.");
  const expected = ["employee_id", "period", "basic_pay", "allowances", "deductions", "currency"];
  if (lines[0].trim() !== expected.join(","))
    throw new Error(`Use this exact header: ${expected.join(",")}`);
  return lines.slice(1).map((line, i) => {
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length !== 6)
      throw new Error(
        `Row ${i + 2}: expected six values. Quoted CSV fields are not needed for this template.`,
      );
    const result = payrollSchema.safeParse(
      Object.fromEntries(expected.map((k, j) => [k, parts[j]])),
    );
    if (!result.success) throw new Error(`Row ${i + 2}: ${result.error.issues[0].message}`);
    return result.data;
  });
}
