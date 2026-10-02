import { requireAdminApi } from "@/lib/server/admin-api";
import { loadReceiptArchive, loadCorrectionShifts } from "@/lib/server/receipt-corrections";
import { buildReceiptCorrection, receiptMoney, receiptPaymentSplits } from "@/lib/reports/receiptCorrections";
import { enrichReceiptItemRows } from "@/lib/reports/receiptDetails";
import { loyaltyEligibleLineTotal } from "@/lib/menuPromos";
import { buildShiftDiscountBreakdown } from "@/lib/posDiscountBreakdown";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store" };
function failure(error) {
  const migrationMissing = ["PGRST202", "PGRST205", "42P01"].includes(error.code);
  return Response.json({ error: migrationMissing ? "Receipt editing requires the receipt corrections database migration." : error.message || "Unable to correct receipt." },
    { status: migrationMissing ? 503 : error.code === "40001" ? 409 : 400, headers: noStore });
}

async function contextFor(admin, source, id, date) {
  if (!["order", "web_order"].includes(source) || !uuid.test(id || "")) throw new Error("Invalid receipt.");
  const { data: live, error: liveError } = await admin.from(source === "order" ? "orders" : "web_orders").select("id").eq("id", id).maybeSingle();
  if (liveError) throw liveError;
  const archive = live ? {} : await loadReceiptArchive(source, id, date, admin);
  const { data: context, error } = await admin.rpc("admin_receipt_edit_context", { p_source: source, p_id: id, p_archive: archive });
  if (error) throw error;
  const memberId = context.receipt.loyalty_member_id || context.receipt.customer_id;
  let member = null;
  if (uuid.test(memberId || "")) {
    const result = await admin.from("loyalty_members").select('id,customer_name,customer_code,"Phone","Available points","Points balance"').eq("id", memberId).maybeSingle();
    if (result.error) throw result.error;
    member = result.data;
  }
  return { context, archive, member };
}

export async function GET(request) {
  const { admin, response } = await requireAdminApi();
  if (response) return response;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("action") === "members") {
      const query = String(params.get("q") || "").trim().replace(/[^\p{L}\p{N} @+.-]/gu, "").slice(0, 80);
      let search = admin.from("loyalty_members").select('id,customer_name,customer_code,"Phone","Available points","Points balance"').order("customer_name").limit(30);
      if (query) search = search.or(`customer_name.ilike.%${query}%,customer_code.ilike.%${query}%,Phone.ilike.%${query}%`);
      const { data, error } = await search;
      if (error) throw error;
      return Response.json({ members: data || [] }, { headers: noStore });
    }
    const { context, member } = await contextFor(admin, params.get("source"), params.get("id"), params.get("date"));
    const { data: history, error } = await admin.from("admin_receipt_edit_audit").select("request_id,reason,created_at,actor_id")
      .eq("source_type", params.get("source")).eq("source_id", params.get("id")).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return Response.json({ context, member, history: history || [] }, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  const { admin, user, response } = await requireAdminApi();
  if (response) return response;
  try {
    const body = await request.json();
    if (!uuid.test(body.requestId || "") || (body.memberId && !uuid.test(body.memberId))) throw new Error("Invalid correction request.");
    // An interrupted response may be retried without reapplying points or shift deltas.
    const { data: replay, error: replayError } = await admin.from("admin_receipt_edit_audit").select("source_type,source_id,actor_id,after_state").eq("request_id", body.requestId).maybeSingle();
    if (replayError) throw replayError;
    if (replay) {
      if (replay.source_type !== body.source || replay.source_id !== body.id || replay.actor_id !== user.id) throw new Error("Correction request ID is already in use.");
      return Response.json({ context: replay.after_state, replayed: true }, { headers: noStore });
    }
    const { context, archive } = await contextFor(admin, body.source, body.id, body.date);
    if (context.version !== body.version) return Response.json({ error: "Receipt changed. Reopen the editor and try again." }, { status: 409 });
    const patch = buildReceiptCorrection(context, body);
    const items = enrichReceiptItemRows(patch.items, context.receipt.items);
    const pointsBase = items.length ? items.reduce((sum, line) => sum + loyaltyEligibleLineTotal({ ...line, category: line.category_name || line.category }, line.net_amount), 0)
      : Math.max(0, patch.net - Number(context.receipt.delivery_fee || 0));
    const points = body.memberId ? Number((pointsBase * 0.04).toFixed(2)) : 0;
    const oldTotals = { ...receiptMoney(context.receipt), payments: receiptPaymentSplits(context.receipt),
      discountBreakdown: buildShiftDiscountBreakdown([context.receipt], context.items) };
    const newTotals = { ...receiptMoney(patch.receipt), payments: patch.payments,
      discountBreakdown: buildShiftDiscountBreakdown([patch.receipt], patch.items) };
    const shifts = await loadCorrectionShifts(admin, context.receipt, archive.shifts || []);
    const { data, error } = await admin.rpc("correct_admin_receipt", {
      p_source: body.source, p_id: body.id, p_archive: archive, p_version: body.version, p_request_id: body.requestId,
      p_actor: user.id, p_reason: String(body.reason || "").trim().slice(0, 500), p_patch: patch,
      p_member_id: body.memberId || null, p_points: points, p_sale_total: patch.net,
      p_before_totals: oldTotals, p_after_totals: newTotals, p_shifts: shifts,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) { return failure(error); }
}
