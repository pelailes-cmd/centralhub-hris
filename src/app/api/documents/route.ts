import { apiContext, assertOrigin, databaseError, HttpError } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const { client } = await apiContext();
    if (Number(request.headers.get("content-length") || 0) > 11000000)
      throw new HttpError(413, "Use a file smaller than 10 MB.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10485760)
      throw new HttpError(400, "Choose a file between 1 byte and 10 MB.");
    const extensions: Record<string, string> = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "text/plain": "txt",
    };
    const extension = extensions[file.type];
    if (!extension) throw new HttpError(400, "Choose a PDF, PNG, JPG, or plain text file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = Array.from(bytes.slice(0, 8))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    if (
      (extension === "pdf" && !signature.startsWith("25504446")) ||
      (extension === "png" && signature !== "89504e470d0a1a0a") ||
      (extension === "jpg" && !signature.startsWith("ffd8ff")) ||
      (extension === "txt" && bytes.includes(0))
    )
      throw new HttpError(400, "The file contents do not match its file type.");
    const metadata = {
      title: z.string().trim().min(2).max(200).parse(form.get("title")),
      category: z
        .enum(["company", "personnel", "bank", "government", "medical", "disciplinary", "identity"])
        .parse(form.get("category")),
      employee_id: form.get("employee_id") ? z.uuid().parse(form.get("employee_id")) : null,
      department_id: form.get("department_id") ? z.uuid().parse(form.get("department_id")) : null,
      requires_ack: form.get("requires_ack") === "true",
      file_size: file.size,
      extension,
    };
    const { data: documentId, error } = await client.rpc("register_document", { p_data: metadata });
    if (error) databaseError(error);
    const path = `${documentId}/${documentId}.${extension}`;
    const admin = createSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from("hris-private")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      await admin.from("documents").delete().eq("id", documentId);
      throw new HttpError(500, "The file upload failed. Please try again.");
    }
    return NextResponse.json({ ok: true, message: "Document uploaded to private storage." });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message:
          e instanceof HttpError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues[0]?.message
              : "Upload failed. Please retry.",
      },
      { status: e instanceof HttpError ? e.status : 400 },
    );
  }
}
