export const INVENTORY_UNITS = ["pc", "pack", "box", "gram", "kg", "ml", "liter", "bottle", "can", "bag"];

export function normalizeUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  const aliases = {
    grams: "gram",
    g: "gram",
    kilo: "kg",
    kilos: "kg",
    kilogram: "kg",
    kilograms: "kg",
    l: "liter",
    liters: "liter",
    litre: "liter",
    litres: "liter",
    pcs: "pc",
    piece: "pc",
    pieces: "pc",
  };
  return aliases[value] || value;
}

export function canConvertUnit(fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return false;
  if (from === to) return true;
  return (
    (from === "kg" && to === "gram") ||
    (from === "gram" && to === "kg") ||
    (from === "liter" && to === "ml") ||
    (from === "ml" && to === "liter")
  );
}

export function convertQuantity(quantity, fromUnit, toUnit) {
  const amount = Number(quantity || 0);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return amount;
  if (from === "kg" && to === "gram") return amount * 1000;
  if (from === "gram" && to === "kg") return amount / 1000;
  if (from === "liter" && to === "ml") return amount * 1000;
  if (from === "ml" && to === "liter") return amount / 1000;
  throw new Error("Unit conversion needed. Please check inventory unit.");
}

export async function syncExpensePurchaseToInventory(supabase, payload) {
  const { data, error } = await supabase.rpc("sync_expense_to_inventory", {
    p_expense_id: String(payload.expenseId),
    p_inventory_item_id: payload.inventoryItemId || null,
    p_common_name_id: payload.commonNameId || null,
    p_quantity: Number(payload.quantity || 0),
    p_unit: normalizeUnit(payload.unit),
    p_unit_cost: payload.unitCost == null ? null : Number(payload.unitCost || 0),
    p_total_cost: payload.totalCost == null ? null : Number(payload.totalCost || 0),
    p_created_by: payload.createdBy || null,
  });
  if (error) throw error;
  return data;
}

export async function deductInventoryForOrder(supabase, orderId, cart, createdBy = null) {
  const items = (cart || []).map((line) => ({
    menu_item_id: line.id,
    quantity: Number(line.quantity || 0),
    name: line.name || "",
    variant_key: line.variantKey || line.variant_key || null,
    variant_name: line.variantName || line.variant_name || null,
  }));
  const { data, error } = await supabase.rpc("deduct_inventory_for_pos_order", {
    p_order_id: String(orderId),
    p_items: items,
    p_created_by: createdBy || null,
  });
  if (error) throw error;
  return data;
}

export async function restoreInventoryForOrder(supabase, orderId, createdBy = null) {
  const { data, error } = await supabase.rpc("restore_inventory_for_void_order", {
    p_order_id: String(orderId),
    p_created_by: createdBy || null,
  });
  if (error) throw error;
  return data;
}
