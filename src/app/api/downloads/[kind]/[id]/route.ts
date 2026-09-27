import { apiContext, databaseError, HttpError } from "@/lib/auth";
import { safeFilename, toCsv } from "@/lib/downloads";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { Document, Payslip } from "@/lib/types";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await params;
    const { client } = await apiContext();
    const recordId = z.uuid().parse(id);
    if (kind === "avatar") {
      const { data: employee } = await client
        .from("employees")
        .select("photo_path")
        .eq("id", recordId)
        .maybeSingle();
      if (!employee?.photo_path) throw new HttpError(404, "Photo unavailable.");
      const { data: file, error } = await createSupabaseAdmin()
        .storage.from("hris-private")
        .download(employee.photo_path);
      if (error || !file) throw new HttpError(404, "Photo unavailable.");
      return new NextResponse(file, {
        headers: {
          "Content-Type": file.type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (kind === "payslip") {
      const { data, error } = await client.rpc("get_payslip", { p_id: recordId });
      if (error) databaseError(error);
      const p = data as Payslip;
      const csv = toCsv([
        ["CentralHub payslip", p.period],
        ["Employee ID", p.employee_id],
        ["Currency", p.currency],
        ["Basic pay", p.basic_pay],
        ["Allowances", p.allowances],
        ["Deductions", p.deductions],
        ["Net pay", Number(p.basic_pay) + Number(p.allowances) - Number(p.deductions)],
        ["Published", p.published_at],
        ["Note", "Recorded payroll values. No statutory calculations are performed by CentralHub."],
      ]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="payslip-${safeFilename(p.period)}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (kind === "document") {
      const { data, error } = await client.rpc("download_document", { p_id: recordId });
      if (error) databaseError(error);
      const d = data as Document;
      const { data: file, error: fileError } = await createSupabaseAdmin()
        .storage.from("hris-private")
        .download(d.storage_path);
      if (fileError || !file)
        throw new HttpError(404, "The document file is unavailable. Please contact HR.");
      return new NextResponse(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeFilename(d.title)}.${safeFilename(d.storage_path.split(".").pop() || "bin")}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new HttpError(404, "Download not found.");
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof HttpError ? e.message : "Download not available." },
      { status: e instanceof HttpError ? e.status : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
