function populated(value) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function receiptItemDetails(line = {}) {
  const beneficiary = line.discountBeneficiary || line.discount_beneficiary || {};
  return {
    variantDetails: line.variantDetails || line.variant_details || line.variant_name || line.variant || "",
    selectedOptions: [line.selectedOptions, line.selected_options, line.options, line.modifiers].find(populated) || [],
    instructions: line.instructions || line.special_instructions || line.note || "",
    appliedVoucher: line.appliedVoucher || line.applied_voucher || null,
    discountName: line.discountName || line.discount_name || "",
    discountBeneficiaryName: line.discountBeneficiaryName || beneficiary.full_name || "",
    discountBeneficiaryType: line.discountBeneficiaryType || beneficiary.beneficiary_type || "",
    discountBeneficiaryIdNumber: line.discountBeneficiaryIdNumber || beneficiary.id_number || "",
  };
}

export function receiptLineMetadata(line) {
  return { pos_cart_item_id: line.cartItemId == null ? null : String(line.cartItemId), pos_line_details: receiptItemDetails(line) };
}

function snapshotsFrom(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

const money = (value) => Math.round(Number(value || 0) * 100);

export function enrichReceiptItemRows(rows = [], orderItems = []) {
  const snapshots = snapshotsFrom(orderItems);
  const used = new Set();
  return rows.map((row) => {
    const cartId = row.source_metadata?.pos_cart_item_id ?? row.cartItemId;
    let index = cartId == null ? -1 : snapshots.findIndex((line, i) => !used.has(i) && String(line.cartItemId) === String(cartId));
    if (index < 0 && cartId == null) {
      // Older item rows have no ticket-line ID. Match quantities and money as
      // well as the product, consuming each saved line only once for groups.
      index = snapshots.findIndex((line, i) => {
        if (used.has(i)) return false;
        const product = row.menu_item_id || row.itemId;
        const sameProduct = product
          ? String(product) === String(line.menu_item_id || line.menuItemId || line.id)
          : String(row.name || row.itemName || row.item_name) === String(line.name || line.item_name);
        return sameProduct && Number(row.quantity ?? row.qty) === Number(line.quantity ?? line.qty) &&
          money(row.unit_price ?? row.unitPrice ?? row.price) === money(line.unitPrice ?? line.unit_price ?? line.price) &&
          money(row.discount_amount ?? row.discountAmount ?? row.discount) === money(line.discountAmount ?? line.discount_amount);
      });
    }
    if (index >= 0) used.add(index);
    const saved = receiptItemDetails(snapshots[index] || {});
    const direct = receiptItemDetails(row);
    const persisted = row.source_metadata?.pos_line_details || {};
    const details = Object.fromEntries(Object.keys(saved).map((key) => [key,
      [persisted[key], direct[key], saved[key]].find(populated) ?? saved[key],
    ]));
    // Receipt metadata never replaces authoritative totals/refund fields.
    return { ...row, ...details };
  });
}
