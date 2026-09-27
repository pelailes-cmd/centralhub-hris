import { apiContext, databaseError, HttpError } from "@/lib/auth";
import { toCsv } from "@/lib/downloads";
import { NextResponse, type NextRequest } from "next/server";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { client } = await apiContext();
    const { kind } = await params;
    if (!["employees", "audit"].includes(kind)) throw new HttpError(404, "Export unavailable.");
    const { data, error } = await client.rpc(
      kind === "employees" ? "export_directory" : "export_audit",
    );
    if (error) databaseError(error);
    const rows = (data || []) as Record<string, unknown>[];
    const headers = rows[0] ? Object.keys(rows[0]) : ["No records"];
    return new NextResponse(toCsv([headers, ...rows.map((r) => headers.map((h) => r[h]))]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="centralhub-${kind}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof HttpError ? e.message : "Export unavailable." },
      { status: e instanceof HttpError ? e.status : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
