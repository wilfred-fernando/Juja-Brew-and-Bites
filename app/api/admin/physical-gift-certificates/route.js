import { requireAdminApi } from "@/lib/server/admin-api";
import { validateGcPurchase } from "@/lib/giftCertificatePurchase";

export async function GET() {
  const { admin, response } = await requireAdminApi();
  if (response) return response;
  const { data, error } = await admin.from("booking_gc_batches")
    .select("*,booking_gc_certificates(*)").not("stock_request_key", "is", null)
    .is("purchase_id", null).order("stock_created_at", { ascending: false }).limit(500);
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ batches: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req) {
  const { admin, user, response } = await requireAdminApi();
  if (response) return response;
  try {
    const input = await req.json();
    if (input.action === "generate") {
      if (!/^[0-9a-f-]{36}$/i.test(input.request_key || "") || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) throw new Error("Choose 1–100 certificates and a valid request reference.");
      const { error } = await admin.rpc("generate_physical_gc_stock", { p_request_key: input.request_key, p_quantity: input.quantity, p_actor: user.id });
      if (error) return Response.json({ error: error.message }, { status: 409 });
      return Response.json({ success: true });
    }
    if (!/^[0-9a-f-]{36}$/i.test(input.stock_batch_id || "") || input.payment_verified !== true || input.source !== "pos" || input.certificate_format !== "physical" || Number(input.quantity) !== 1) throw new Error("Select unsold stock and verify the full payment.");
    const data = validateGcPurchase(input, user.id, process.env.CLOUDFLARE_R2_PUBLIC_URL);
    const { data: purchase, error } = await admin.rpc("create_gc_purchase", { p_data: { ...data, stock_batch_id: input.stock_batch_id, payment_verified: true }, p_actor: user.id });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ purchase });
  } catch (error) {
    return Response.json({ error: error.message || "Unable to process physical certificates." }, { status: 400 });
  }
}
