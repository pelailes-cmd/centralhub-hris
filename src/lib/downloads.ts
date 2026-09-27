export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  // Prevent formulas when an exported value is opened in Excel or Sheets.
  const safe = /^(?:\s*[=+\-@]|[\t\r])/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function toCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}
