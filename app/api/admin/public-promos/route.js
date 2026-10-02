import { requireAdminApi } from "@/lib/server/admin-api";
import { uploadR2Object } from "@/lib/storage/r2";
import sharp from "sharp";

export const runtime = "nodejs";
const failure = (error) => Response.json({ error: error.message || "Unable to save promo." }, { status: 500 });
function normalize(body) {
  const content = {};
  for (const key of ["title", "label", "image", "schedule", "offer", "details"]) {
    content[key] = String(body.content?.[key] || "").trim();
    if (!content[key] || content[key].length > (key === "details" ? 5000 : 1000)) throw new Error(`Please enter a valid ${key}.`);
  }
  if (!/^\/promos\/[a-zA-Z0-9_.-]+$/.test(content.image)) {
    const url = new URL(content.image);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a HTTPS image URL or upload artwork.");
  }
  content.width = Number(body.content?.width);
  content.height = Number(body.content?.height);
  if (![content.width,content.height].every(n => Number.isInteger(n) && n > 0 && n <= 20000)) throw new Error("Image dimensions must be between 1 and 20000.");
  content.requiresId = Boolean(body.content?.requiresId);
  content.tone = "bg-cyan-50 text-cyan-900";
  const dates = {};
  for (const key of ["starts_on", "ends_on"]) {
    const value = body[key] || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error("Invalid promo date.");
    dates[key] = value;
  }
  if (dates.starts_on && dates.ends_on && dates.starts_on > dates.ends_on) throw new Error("End date must be on or after the start date.");
  const sort = Number(body.sort_order);
  if (!Number.isInteger(sort) || sort < 0 || sort > 10000 || typeof body.is_active !== "boolean") throw new Error("Invalid display order or active status.");
  return { content, ...dates, sort_order: sort, is_active: body.is_active };
}
export async function GET() {
  try {
    const { admin,response } = await requireAdminApi(); if (response) return response;
    const { data,error } = await admin.from("public_promo_cards").select("*").order("sort_order").order("id");
    if (error) throw error;
    return Response.json({ rows:data }, { headers:{ "Cache-Control":"no-store" } });
  } catch (error) { return failure(error); }
}
async function save(request, editing) {
  try {
    const { admin,response } = await requireAdminApi(); if (response) return response;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(); const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 8*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) return Response.json({error:"Choose a PNG, JPG or WebP image up to 8 MB."},{status:400});
      const image = sharp(Buffer.from(await file.arrayBuffer()), {limitInputPixels:50000000}).rotate();
      const { data,info } = await image.webp({quality:95}).toBuffer({resolveWithObject:true});
      const asset = await uploadR2Object({key:`promos/${crypto.randomUUID()}.webp`,body:data,contentType:"image/webp"});
      return Response.json({image:asset.url,width:info.width,height:info.height});
    }
    const body = await request.json(); let payload;
    try { payload=normalize(body); } catch (error) { return Response.json({error:error.message},{status:400}); }
    if (editing && (typeof body.id !== "string" || !body.id)) return Response.json({error:"Promo ID is required."},{status:400});
    const query = editing ? admin.from("public_promo_cards").update(payload).eq("id",body.id) : admin.from("public_promo_cards").insert({...payload,id:crypto.randomUUID()});
    const {data,error}=await query.select("*").single(); if(error) throw error;
    return Response.json({row:data});
  } catch(error) {return failure(error);}
}
export async function POST(request) {return save(request,false);}
export async function PATCH(request) {return save(request,true);}
export async function DELETE(request) {
  try {
    const {admin,response}=await requireAdminApi(); if(response) return response;
    const {id}=await request.json(); if(typeof id!=="string" || !id) return Response.json({error:"Promo ID is required."},{status:400});
    const {data,error}=await admin.from("public_promo_cards").delete().eq("id",id).select("id").single(); if(error) throw error;
    return Response.json({deleted:data.id});
  } catch(error) {return failure(error);}
}
