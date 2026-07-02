export const KDS_ACTIVE_STATUSES = ["pending", "scheduled", "accepted", "preparing", "ready"];
export const KDS_VISIBLE_STATUSES = [...KDS_ACTIVE_STATUSES, "voided", "rejected"];

export function webDiningOptionLabel(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ONLINE: DINE-IN" || normalized === "ONLINE: TAKEOUT") return normalized;
  if (normalized === "DINEIN" || normalized === "DINE-IN" || normalized === "DINE IN") return "ONLINE: DINE-IN";
  return "ONLINE: TAKEOUT";
}

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
    kdsCompleted: Boolean(item.kdsCompleted || item.kds_completed || item.kitchenCompleted || item.kitchen_completed),
    kdsCompletedAt: item.kdsCompletedAt || item.kds_completed_at || item.kitchen_completed_at || null,
    voided: Boolean(item.voided || item.isVoided || item.is_voided || String(item.status || "").toLowerCase().includes("void") || String(item.status || "").toLowerCase().includes("refund")),
    voidedAt: item.voidedAt || item.voided_at || item.refunded_at || null,
  }));
}

export function buildKdsTicketPayload({ sourceType, order, status = "pending" }) {
  const isWeb = sourceType === "web";
  const sourceId = String(order?.id || "");
  const items = normalizeKdsItems(order?.items);
  const total = Number(order?.total || order?.net_amount || order?.total_amount || order?.subtotal || 0);
  const resolvedStoreId = order?.store_id || order?.branch_id || null;
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
    store_id: resolvedStoreId ? String(resolvedStoreId) : null,
    receipt_number: order?.receipt_number || order?.order_number || "",
    ticket_number: order?.receipt_number || order?.order_number || (sourceId ? sourceId.slice(0, 8).toUpperCase() : ""),
    customer_name: order?.customer_name || (isWeb ? "Web Customer" : "Walk-in"),
    dining_option: isWeb ? webDiningOptionLabel(order?.fulfillment_type || order?.dining_option || order?.order_type) : (order?.dining_option || order?.order_type || order?.fulfillment_type || "POS Order"),
    fulfillment_type: order?.fulfillment_type || order?.dining_option || order?.order_type || null,
    fulfillment_time: order?.fulfillment_time || order?.target_time || "",
    scheduled_for: order?.scheduled_for || order?.scheduled_at || null,
    schedule_label: order?.schedule_label || order?.fulfillment_time || "",
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

export async function appendKdsTicketItems(supabase, { sourceType, order, items = [], status = "preparing" }) {
  if (!supabase || !sourceType || !order?.id || !Array.isArray(items) || items.length === 0) {
    return { data: null, error: null };
  }

  const { data: existing, error: loadError } = await supabase
    .from("kds_tickets")
    .select("*")
    .eq("source_type", sourceType)
    .eq("source_id", String(order.id))
    .maybeSingle();

  if (loadError) return { data: existing, error: loadError };
  if (!existing) return upsertKdsTicket(supabase, { sourceType, order: { ...order, items }, status });

  const timestamp = new Date().toISOString();
  const existingItems = normalizeKdsItems(existing.items);
  const appendedItems = normalizeKdsItems(items);
  const currentStatus = String(existing.status || "").toLowerCase();
  const blockedStatuses = ["voided", "rejected"];
  const nextStatus = blockedStatuses.includes(currentStatus) ? currentStatus : status;
  const retiredExistingItems =
    currentStatus === "completed"
      ? existingItems.map((item) => ({
          ...item,
          kdsCompleted: true,
          kds_completed: true,
          kitchenCompleted: true,
          kitchen_completed: true,
          kdsCompletedAt: item.kdsCompletedAt || timestamp,
          kds_completed_at: item.kds_completed_at || timestamp,
          kitchen_completed_at: item.kitchen_completed_at || timestamp,
        }))
      : existingItems;

  return supabase
    .from("kds_tickets")
    .update({
      items: [...retiredExistingItems, ...appendedItems],
      total: Number(order?.total || order?.net_amount || order?.total_amount || order?.subtotal || existing.total || 0),
      status: nextStatus,
      started_at: existing.started_at || timestamp,
      ready_at: null,
      completed_at: null,
    })
    .eq("id", existing.id)
    .select("*")
    .maybeSingle();
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

export async function markKdsTicketItemVoided(supabase, { sourceType, sourceId, itemId, itemName }) {
  if (!supabase || !sourceType || !sourceId || (!itemId && !itemName)) return { data: null, error: null };

  const { data: ticket, error } = await supabase
    .from("kds_tickets")
    .select("id, items, status")
    .eq("source_type", sourceType)
    .eq("source_id", String(sourceId))
    .maybeSingle();

  if (error || !ticket) return { data: ticket, error };

  const normalizedItemId = String(itemId || "").toLowerCase();
  const normalizedItemName = String(itemName || "").trim().toLowerCase();
  let matched = false;
  const timestamp = new Date().toISOString();
  const nextItems = (Array.isArray(ticket.items) ? ticket.items : []).map((item) => {
    const currentIds = [
      item.id,
      item.cartItemId,
      item.menuItemId,
      item.menu_item_id,
      item.order_item_id,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    const currentName = String(item.name || item.item_name || item.item || "").trim().toLowerCase();
    const isMatch =
      (normalizedItemId && currentIds.includes(normalizedItemId)) ||
      (normalizedItemName && currentName === normalizedItemName);

    if (!isMatch) return item;
    matched = true;
    return {
      ...item,
      voided: true,
      isVoided: true,
      status: "voided",
      voidedAt: item.voidedAt || timestamp,
      voided_at: item.voided_at || timestamp,
    };
  });

  if (!matched) return { data: ticket, error: null };

  return supabase
    .from("kds_tickets")
    .update({ items: nextItems })
    .eq("id", ticket.id)
    .select("*")
    .maybeSingle();
}
