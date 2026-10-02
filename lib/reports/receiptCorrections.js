// Work in cents so receipt, product and payment totals agree exactly.
export const RECEIPT_PAYMENT_METHODS = ["Cash", "GCash", "QRPH", "Card", "GrabFood", "Foodpanda", "ShopeeFood", "Grab Dine Out", "Bank Transfer", "Maya", "No Payment Required"];
export const cents = (value) => Math.round(Number(value ?? 0) * 100);
export const money = (value) => cents(value) / 100;
const firstAmount = (row, keys, fallback = 0) => {
  const key = keys.find((name) => row?.[name] !== undefined && row[name] !== null && row[name] !== "");
  return key ? Number(row[key]) : fallback;
};
const array = (value) => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

export function receiptMoney(receipt) {
  const discount = Math.max(0, ...["discount_amount", "discount", "discounts"].map((key) => Number(receipt[key] || 0)));
  const net = firstAmount(receipt, ["net_amount", "total", "net_sales"], 0);
  const gross = firstAmount(receipt, ["gross_amount", "gross_sales"], Math.max(firstAmount(receipt, ["subtotal"], 0), net + discount));
  return { gross: money(gross), discount: money(discount), net: money(net) };
}

export function receiptPaymentSplits(receipt) {
  const splits = array(receipt.source_metadata?.payment_splits);
  if (splits.length) return splits.map((entry) => ({ method: entry.method, amount: money(entry.amount) }));
  const method = receipt.payment_method || receipt.payment_type || "Cash";
  if (/\s+\+\s+/.test(method)) {
    const parsed = method.split(/\s+\+\s+/).map((part) => {
      const match = part.match(/^(.+?)\s+[₱P]?\s*([\d,]+(?:\.\d{1,2})?)$/);
      return match ? { method: match[1], amount: Number(match[2].replaceAll(",", "")) } : null;
    });
    if (parsed.every(Boolean)) return parsed;
    throw new Error("This receipt's split payment amounts are missing. Restore its payment details before editing.");
  }
  return [{ method, amount: receiptMoney(receipt).net }];
}

export const isGiftCertificatePayment = (method) => /gift\s*certificate|\be-?gc\b|^gc$/i.test(String(method));

function allocateCents(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  let previous = 0;
  let cumulative = 0;
  return weights.map((weight) => {
    cumulative += weight;
    const next = Math.round(total * cumulative / sum);
    const result = next - previous;
    previous = next;
    return result;
  });
}

export function buildReceiptCorrection(context, draft) {
  const receipt = context.receipt;
  const current = receiptMoney(receipt);
  const previousAdmin = receipt.source_metadata?.admin_receipt_discount || {};
  const baseline = receipt.source_metadata?.receipt_correction_base || current;
  if (![baseline.gross, baseline.discount, baseline.net].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
    || cents(baseline.gross) - cents(baseline.discount) !== cents(baseline.net)) throw new Error("The original receipt totals do not balance. Review them before correcting this receipt.");
  const value = Number(draft.discountValue || 0);
  if (!Number.isFinite(value) || value < 0 || !["amount", "percent"].includes(draft.discountType)) throw new Error("Enter a valid discount.");
  if (draft.discountType === "percent" && value > 100) throw new Error("Discount percentage cannot exceed 100%.");
  const additional = draft.discountType === "percent" ? Math.round(cents(baseline.net) * value / 100) : cents(value);
  if (additional > cents(baseline.net)) throw new Error("Discount cannot exceed the remaining receipt total.");
  const name = String(draft.discountName || "").trim();
  if (additional > 0 && !name) throw new Error("Enter a discount label.");
  const net = cents(baseline.net) - additional;
  const discount = cents(baseline.discount) + additional;
  const originalPayments = receiptPaymentSplits(receipt);
  const payments = (draft.payments || []).map((entry) => ({ method: String(entry.method || "").trim(), amount: cents(entry.amount) }));
  if (payments.length === 1 && !isGiftCertificatePayment(payments[0].method)) payments[0].amount = net;
  if (!payments.length || payments.some((entry) => !entry.method || !Number.isFinite(entry.amount) || entry.amount < 0)) throw new Error("Enter valid payment types and amounts.");
  if (payments.some((entry) => !RECEIPT_PAYMENT_METHODS.includes(entry.method) && !originalPayments.some((old) => old.method === entry.method))) throw new Error("Select a supported payment type.");
  if (payments.some((entry) => entry.method === "No Payment Required") && net !== 0) throw new Error("No Payment Required can only be used for a zero-total receipt.");
  if (payments.reduce((sum, entry) => sum + entry.amount, 0) !== net) throw new Error("Payment amounts must equal the corrected receipt total.");
  const giftPayments = (rows) => rows.filter((entry) => isGiftCertificatePayment(entry.method)).map((entry) => `${entry.method}:${cents(entry.amount)}`).sort().join("|");
  if (giftPayments(originalPayments) !== giftPayments(payments.map((entry) => ({ ...entry, amount: entry.amount / 100 })))) throw new Error("Gift certificate redemptions must retain their recorded amount.");
  if (new Set(payments.map((entry) => entry.method.toLowerCase())).size !== payments.length) throw new Error("Use each payment type once.");

  const rows = context.items?.length ? context.items : array(receipt.items);
  const bases = rows.map((row) => {
    if (row.source_metadata?.receipt_correction_base) return row.source_metadata.receipt_correction_base;
    const quantity = firstAmount(row, ["quantity", "qty"], 1);
    const gross = firstAmount(row, ["gross_amount", "gross_sales"], firstAmount(row, ["unit_price", "unitPrice", "price"], 0) * quantity);
    const discount = firstAmount(row, ["discount_amount", "discountAmount", "discount"], 0);
    const net = firstAmount(row, ["net_amount", "line_total", "net_sales", "net"], gross - discount);
    return { gross: money(gross || net + discount), discount: money(discount), net: money(net) };
  });
  // Delivery fees remain outside product sales and loyalty earnings.
  const fee = Math.max(0, cents(receipt.delivery_fee || 0));
  const discountable = cents(baseline.net) - fee;
  if (additional > Math.max(0, discountable)) throw new Error("Discount cannot reduce the recorded delivery fee.");
  const weights = bases.map((row) => Math.max(0, cents(row.net)));
  const correctedNets = allocateCents(Math.max(0, discountable - additional), weights);
  const items = rows.map((row, index) => {
    const base = bases[index];
    const lineNet = correctedNets[index] / 100;
    const lineDiscount = Math.max(0, cents(base.gross) - correctedNets[index]) / 100;
    return { ...row, gross_amount: base.gross, discount_amount: lineDiscount, net_amount: lineNet, line_total: lineNet,
      // JSON cart snapshots and normalized item rows use different money keys.
      discountAmount: lineDiscount, lineTotal: lineNet,
      source_metadata: { ...row.source_metadata, receipt_correction_base: base } };
  });
  if (items.length && correctedNets.reduce((sum, amount) => sum + amount, 0) + fee !== net) throw new Error("Receipt items do not match the corrected total.");
  const adminDiscount = { amount: additional / 100, name: name || previousAdmin.name || "Receipt discount", type: draft.discountType, value };
  const splits = payments.map((entry) => ({ method: entry.method, amount: entry.amount / 100 }));
  const method = splits.length === 1 ? splits[0].method : splits.map((entry) => `${entry.method} ₱${entry.amount.toFixed(2)}`).join(" + ");
  const snapshots = array(receipt.items).map((line, index) => {
    const item = items.find((row) => row.source_metadata?.pos_cart_item_id != null && String(row.source_metadata.pos_cart_item_id) === String(line.cartItemId))
      || items.find((row) => String(row.menu_item_id || row.id) === String(line.menu_item_id || line.menuItemId || line.id)
        && Number(row.quantity || row.qty) === Number(line.quantity || line.qty)) || items[index];
    if (!item) return line;
    return { ...line, gross_amount: item.gross_amount, net_amount: item.net_amount, discountAmount: item.discount_amount,
      discount_amount: item.discount_amount, line_total: item.net_amount, lineTotal: item.net_amount,
      source_metadata: { ...line.source_metadata, receipt_correction_base: item.source_metadata.receipt_correction_base } };
  });
  const patched = { ...receipt, items: snapshots, gross_amount: baseline.gross, subtotal: baseline.gross, discount_amount: discount / 100,
    discount: discount / 100, net_amount: net / 100, total: net / 100, payment_method: method,
    source_metadata: { ...receipt.source_metadata, receipt_correction_base: baseline, admin_receipt_discount: adminDiscount,
      payment_splits: splits, payment_label: method, cash_tendered: splits.find((entry) => entry.method === "Cash")?.amount || 0, cash_change: 0 } };
  return { receipt: patched, items, adminDiscount, net: net / 100, discount: discount / 100, payments: splits };
}

export function applyReceiptCorrections(data, corrections = [], shifts = []) {
  const orderOverrides = new Map();
  const webOverrides = new Map();
  const itemOverrides = new Map();
  const sourceOrders = new Map((data.orders || []).map((row) => [String(row.id), row]));
  const sourceWebOrders = new Map((data.webOrders || []).map((row) => [String(row.id), row]));
  const needsOverride = (original, corrected) => !original || !original.updated_at || !corrected.updated_at
    || Date.parse(original.updated_at) < Date.parse(corrected.updated_at);
  for (const entry of corrections) {
    const originals = entry.source_type === "order" ? sourceOrders : sourceWebOrders;
    if (needsOverride(originals.get(String(entry.source_id)), entry.receipt)) {
      (entry.source_type === "order" ? orderOverrides : webOverrides).set(String(entry.source_id), entry.receipt);
      if (entry.source_type === "order") itemOverrides.set(String(entry.source_id), entry.items || []);
    }
    if (entry.linked_web_receipt?.id && needsOverride(sourceWebOrders.get(String(entry.linked_web_receipt.id)), entry.linked_web_receipt)) webOverrides.set(String(entry.linked_web_receipt.id), entry.linked_web_receipt);
  }
  const replace = (rows, overrides) => (rows || []).map((row) => overrides.has(String(row.id)) ? { ...row, ...overrides.get(String(row.id)) } : row);
  const shiftOverrides = new Map(shifts.map((entry) => [String(entry.shift_id), entry.shift]));
  return { ...data, orders: replace(data.orders, orderOverrides), webOrders: replace(data.webOrders, webOverrides),
    orderItems: [...(data.orderItems || []).filter((row) => !itemOverrides.has(String(row.order_id))), ...[...itemOverrides.values()].flat()],
    shiftRecords: (data.shiftRecords || []).map((row) => shiftOverrides.has(String(row.id)) ? { ...row, sales_summary: shiftOverrides.get(String(row.id)).sales_summary } : row) };
}
