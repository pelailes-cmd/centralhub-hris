import { apiContext, assertOrigin, databaseError, HttpError } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const { client, viewer } = await apiContext();
    if (Number(request.headers.get("content-length") || 0) > 3500000)
      throw new HttpError(413, "Use a photo smaller than 3 MB.");
    const form = await request.formData();
    const employeeId = z.uuid().parse(form.get("employee_id"));
    if (employeeId !== viewer.employee_id) {
      const { data: allowed } = await client.rpc("has_permission", {
        p_permission: "employees.manage",
        p_employee: employeeId,
      });
      if (!allowed) throw new HttpError(403, "You cannot change this profile photo.");
    }
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 3145728 ||
      !["image/png", "image/jpeg"].includes(file.type)
    )
      throw new HttpError(400, "Choose a JPG or PNG image smaller than 3 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = Array.from(bytes.slice(0, 8))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    if (
      file.type === "image/png" ? signature !== "89504e470d0a1a0a" : !signature.startsWith("ffd8ff")
    )
      throw new HttpError(400, "The file is not a valid JPG or PNG image.");
    const path = `avatars/${employeeId}/${randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const admin = createSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from("hris-private")
      .upload(path, bytes, { contentType: file.type });
    if (uploadError) throw new HttpError(500, "Photo upload failed.");
    const { error } = await client.rpc("save_employee_photo", {
      p_employee: employeeId,
      p_path: path,
    });
    if (error) {
      await admin.storage.from("hris-private").remove([path]);
      databaseError(error);
    }
    return NextResponse.json({ ok: true, message: "Photo updated." });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof HttpError ? e.message : "Photo upload failed." },
      { status: e instanceof HttpError ? e.status : 400 },
    );
  }
}
