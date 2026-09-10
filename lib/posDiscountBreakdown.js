const DEFAULT_DISCOUNT_LABEL = "Other / Unspecified";

function cents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lineDetails(line = {}) {
  return line?.source_metadata?.pos_line_details || line?.raw?.source_metadata?.pos_line_details || line?.pos_line_details || {};
}

function lineVoucher(line = {}) {
  const details = lineDetails(line);
  return line.appliedVoucher || line.applied_voucher || details.appliedVoucher || details.applied_voucher || null;
}

function lineDiscountName(line = {}) {
  const details = lineDetails(line);
  return line.discountName || line.discount_name || details.discountName || details.discount_name || "";
}

export function discountBreakdownLabel({ name, voucher } = {}) {
  const rewardType = String(voucher?.reward_type || voucher?.rewardType || "").trim().toLowerCase();
  const voucherText = `${voucher?.code || ""} ${voucher?.reward_text || voucher?.title || ""}`.toLowerCase();
  if (rewardType === "birthday" || /\bbirthday\b|\bbday/.test(voucherText)) return "Birthday Voucher";
  if (rewardType === "points" || /\bpoints?\b|\bpts\d*/.test(voucherText)) return "Points Voucher";
  if (rewardType === "welcome" || /\bwelcome\b/.test(voucherText)) return "Welcome Voucher";
  if (voucher) return "Other Voucher";

  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalized = cleanName.toLowerCase();
  const hasSc = /\bsc\b|\bsenior\b/.test(normalized);
  const hasPwd = /\bpwd\b/.test(normalized);
  if (hasSc || hasPwd) return "SC / PWD";
  if (/\bqcid\b|\bqc\s+id\b/.test(normalized)) return "QCID Promo";
  if (/\bfree\b/.test(normalized)) return "Free";
  return cleanName || DEFAULT_DISCOUNT_LABEL;
}

function receiptKey(row = {}) {
  return String(row.receipt_number || row.orderNumber || row.order_number || row.order_id || row.id || "");
}

function itemReceiptKey(row = {}) {
  return String(row.receipt_number || row.orderNumber || row.order_number || row.orderId || row.order_id || "");
}

function lineDiscountCents(line = {}) {
  const explicit = line.discountAmount ?? line.discount_amount ?? line.discount;
  if (explicit != null) return cents(explicit);
  const gross = Number(line.gross_sales ?? line.gross_amount ?? line.line_gross);
  const net = Number(line.net_sales ?? line.net_amount ?? line.line_total);
  return Number.isFinite(gross) && Number.isFinite(net) ? cents(Math.max(0, gross - net)) : 0;
}

function orderDiscountDescriptor(row = {}) {
  const raw = row?.raw || {};
  const source = row?.source_metadata?.order_discount || raw?.source_metadata?.order_discount || row?.order_discount || row?.appliedDiscount || row?.applied_discount || {};
  return {
    name: source.name || source.discount_name || source.manual_label || row.discount_type || raw.discount_type || "",
    voucher: source.voucher || null,
  };
}

export function buildShiftDiscountBreakdown(receiptRows = [], receiptItemRows = []) {
  const totals = new Map();
  const itemRowsByReceipt = new Map();
  (receiptItemRows || []).forEach((item) => {
    const key = itemReceiptKey(item);
    if (!key) return;
    const current = itemRowsByReceipt.get(key) || [];
    current.push(item);
    itemRowsByReceipt.set(key, current);
  });

  const add = (label, amountCents) => {
    if (!amountCents) return;
    totals.set(label, (totals.get(label) || 0) + amountCents);
  };

  (receiptRows || []).forEach((row) => {
    const totalDiscount = cents(row.discounts ?? row.discount_amount ?? row.discount ?? row.raw?.discount_amount ?? row.raw?.discount);
    if (!totalDiscount) return;
    let remaining = totalDiscount;
    const key = receiptKey(row);
    const linkedItems = itemRowsByReceipt.get(key) || itemRowsByReceipt.get(String(row.order_id || row.id || "")) || [];
    const items = linkedItems.length ? linkedItems : parseItems(row.items || row.web_items || row.raw?.items);

    items.forEach((line) => {
      if (!remaining) return;
      const amount = Math.min(remaining, lineDiscountCents(line));
      if (!amount) return;
      add(discountBreakdownLabel({ name: lineDiscountName(line), voucher: lineVoucher(line) }), amount);
      remaining -= amount;
    });

    if (remaining > 0) add(discountBreakdownLabel(orderDiscountDescriptor(row)), remaining);
  });

  return Array.from(totals, ([label, amount]) => ({ label, amount: amount / 100 }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function discountBreakdownTotal(rows = []) {
  return Number((rows || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0).toFixed(2));
}
