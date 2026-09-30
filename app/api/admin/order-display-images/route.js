import { requireAdminApi } from "@/lib/server/admin-api";
import { uploadR2Object } from "@/lib/storage/r2";
import sharp from "sharp";

export const runtime = "nodejs";
const fields = "id,url,created_at";
const failure = (error) => Response.json({ error: error?.message || "Unable to update display images." }, { status: 500 });

export async function GET() {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const { data, error } = await admin.from("order_display_images").select(fields).order("sort_order").order("created_at").order("id");
    if (error) throw error;
    return Response.json({ images: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return Response.json({ error: "Choose a JPG, PNG or WebP image up to 4 MB." }, { status: 400 });
    }
    // Check the table exists before uploading an asset.
    const check = await admin.from("order_display_images").select("id").limit(1);
    if (check.error) throw check.error;
    let body;
    try {
      body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50000000 }).rotate().resize({ width: 3840, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    } catch {
      return Response.json({ error: "This image could not be read. Choose a valid JPG, PNG or WebP." }, { status: 400 });
    }
    const asset = await uploadR2Object({ key: `order-display/${crypto.randomUUID()}.webp`, body, contentType: "image/webp" });
    const { data, error } = await admin.from("order_display_images").insert({ url: asset.url }).select(fields).single();
    if (error) throw error;
    return Response.json({ image: data }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const { id } = await request.json();
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid image ID." }, { status: 400 });
    const { error } = await admin.from("order_display_images").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) { return failure(error); }
}

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(ids).size !== ids.length) {
      return Response.json({ error: "Invalid image order." }, { status: 400 });
    }
    const { error } = await admin.rpc("reorder_order_display_images", { image_ids: ids });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ success: true });
  } catch (error) { return failure(error); }
}
