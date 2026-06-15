export const KDS_ACTIVE_STATUSES = ["pending", "accepted", "preparing", "ready"];
export const KDS_VISIBLE_STATUSES = [...KDS_ACTIVE_STATUSES, "voided", "rejected"];

export function normalizeKdsItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.cartItemId || item.id || item.menu_item_id || `item-${index}`,
    menuItemId: item.menuItemId || item.menu_item_id || item.id || null,
    name: item.name || item.item_name || item.item || "Item",
    category: item.category || item.categoryName || item.category_name || null,
    categoryId: item.categoryId || item.category_id || item.menu_category_id || null,
    quantity: Number(item.quantity || item.qty || 1),
    unitPrice: Number(item.unitPrice || item.price || item.unit_price || 0),
    variantDetails: item.variantDetails || item.variant_details || item.variant || "",
    instructions: item.instructions || item.note || item.comment || item.specialInstructions || "",
    selectedOptions: item.selectedOptions || item.options || [],
    kitchenReady: Boolean(item.kitchenReady || item.kitchen_ready || item.ready),
    kitchenReadyAt: item.kitchenReadyAt || item.kitchen_ready_at || item.ready_at || null,
  }));
}

export function buildKdsTicketPayload({ sourceType, order, status = "pending" }) {
  const isWeb = sourceType === "web";
  const sourceId = String(order?.id || "");
  const items = normalizeKdsItems(order?.items);
  const total = Number(order?.total || order?.net_amount || order?.total_amount || order?.subtotal || 0);
  const isChargedPosOrder =
    !isWeb &&
    (order?.source_table === "orders" ||
      order?.order_id ||
      order?.paid_at ||
      order?.receipt_number ||
      order?.status === "paid");

  return {
    source_type: sourceType,
    source_id: sourceId,
    order_id: isChargedPosOrder ? order?.order_id || order?.id || null : null,
    web_order_id: isWeb ? order?.id || null : order?.source_web_order_id || null,
    store_id: String(order?.store_id || order?.branch_id || ""),
    receipt_number: order?.receipt_number || order?.order_number || "",
    ticket_number: order?.receipt_number || order?.order_number || (sourceId ? sourceId.slice(0, 8).toUpperCase() : ""),
    customer_name: order?.customer_name || (isWeb ? "Web Customer" : "Walk-in"),
    dining_option: order?.dining_option || order?.order_type || order?.fulfillment_type || (isWeb ? "Web Order" : "POS Order"),
    items,
    total,
    status,
    payment_status: order?.payment_status || (order?.paid_at || order?.status === "paid" ? "paid" : null),
    source_created_at: order?.created_at || order?.accepted_at || order?.paid_at || new Date().toISOString(),
    accepted_at: status === "accepted" ? (order?.accepted_at || new Date().toISOString()) : order?.accepted_at || null,
    started_at: status === "preparing" ? new Date().toISOString() : order?.started_at || null,
    ready_at: status === "ready" ? (order?.ready_at || new Date().toISOString()) : order?.ready_at || null,
    completed_at: status === "completed" ? (order?.completed_at || new Date().toISOString()) : order?.completed_at || null,
    voided_at: status === "voided" || status === "rejected" ? (order?.voided_at || order?.rejected_at || new Date().toISOString()) : null,
  };
}

export async function upsertKdsTicket(supabase, { sourceType, order, status = "pending" }) {
  if (!supabase || !sourceType || !order?.id) return { data: null, error: null };

  const payload = buildKdsTicketPayload({ sourceType, order, status });
  return supabase
    .from("kds_tickets")
    .upsert(payload, { onConflict: "source_type,source_id" })
    .select("*")
    .single();
}

export async function markKdsTicketStatus(supabase, { sourceType, sourceId, status }) {
  if (!supabase || !sourceType || !sourceId || !status) return { data: null, error: null };
  const timestampFields = {
    preparing: { started_at: new Date().toISOString() },
    ready: { ready_at: new Date().toISOString() },
    completed: { completed_at: new Date().toISOString() },
    voided: { voided_at: new Date().toISOString() },
    rejected: { voided_at: new Date().toISOString() },
  };

  return supabase
    .from("kds_tickets")
    .update({ status, ...(timestampFields[status] || {}) })
    .eq("source_type", sourceType)
    .eq("source_id", String(sourceId))
    .select("*")
    .maybeSingle();
}
