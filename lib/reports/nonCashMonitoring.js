const key = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
const excluded = new Set(["cash", "nopaymentrequired", "none", "unknown", "other", ""]);

export function buildNonCashMonitoring(sales = []) {
  const rows = [];
  for (const sale of sales) {
    if (!["Paid", "Refunded", "Partial Refund", "Voided"].includes(sale.status)) continue;
    const splits = sale.paymentSplits?.length ? sale.paymentSplits : [{ method: sale.paymentMethod, amount: sale.net + sale.refund }];
    const weights = splits.map((split) => Math.max(0, Number(split.amount || 0)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const allocate = (value) => {
      let remaining = Math.round(Number(value || 0) * 100);
      const original = remaining;
      return splits.map((_, index) => {
        const cents = index === splits.length - 1 ? remaining : Math.round(original * (total ? weights[index] / total : 1 / splits.length));
        remaining -= cents;
        return cents / 100;
      });
    };
    const net = allocate(sale.net), refunds = allocate(sale.refund);
    splits.forEach((split, index) => {
      if (excluded.has(key(split.method))) return;
      const raw = sale.raw || {};
      const rawSplit = (Array.isArray(raw.source_metadata?.payment_splits) ? raw.source_metadata.payment_splits : []).find((entry) => key(entry.method || entry.payment_method || entry.type || entry.name) === key(split.method));
      rows.push({ id: `${sale.source}:${sale.id}:${index}`, date: sale.date, time: sale.salesAt || sale.createdAt,
        receiptNumber: raw.receipt_number || raw.order_number || sale.orderNumber || "Not recorded", paymentMethod: split.method,
        reference: rawSplit?.reference_number || rawSplit?.reference || raw.payment_reference || raw.reference_number || "",
        amount: Math.round((net[index] + refunds[index]) * 100) / 100, refund: refunds[index], net: net[index],
        branch: sale.storeName || "", cashier: sale.cashierName || "", status: sale.status });
    });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Date.parse(a.time) - Date.parse(b.time));
}
