import { buildShiftDiscountBreakdown } from "../posDiscountBreakdown.js";

export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(days).padStart(2, "0")}`, days };
}

export function buildMonthlySales(sales, lineItems, month, minimumDate = "") {
  const range = monthRange(month);
  if (!range) return { rows: [], labels: [], totals: {} };
  const labels = new Set(), paymentTypes = new Set();
  const rows = Array.from({ length: range.days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    if(minimumDate && date < minimumDate)return null;
    const receipts = sales.filter((sale) => sale.date === date);
    const ids = new Set(receipts.flatMap((sale) => [String(sale.id), String(sale.orderKey || sale.id)]));
    const items = lineItems.filter((item) => ids.has(String(item.orderId || item.order_id)));
    const row = { date, day: index + 1, gross: 0, discount: 0, refund: 0, net: 0, breakdown: {}, payments: {} };
    for (const receipt of receipts) {
      for (const key of ["gross", "discount", "refund", "net"]) row[key] += Math.round(Number(receipt[key] || 0) * 100);
    }
    for (const receipt of receipts) {
      const splits = receipt.paymentSplits?.length ? receipt.paymentSplits : [{ method: receipt.paymentMethod || 'Unspecified', amount: receipt.net }];
      const weights = splits.map(split => Math.max(0, Number(split.amount) || 0));
      const total = weights.reduce((sum, value) => sum + value, 0);
      const net = Math.round(Number(receipt.net || 0) * 100);
      let remaining = net;
      splits.forEach((split, index) => {
        const label = String(split.method || 'Unspecified').trim() || 'Unspecified';
        const allocated = index === splits.length - 1 ? remaining : Math.round(net * (total ? weights[index] / total : 1 / splits.length));
        remaining -= allocated;
        if (/^no\s+payment\s+required$/i.test(label)) return;
        paymentTypes.add(label);
        row.payments[label] = (row.payments[label] || 0) + allocated;
      });
    }
    for (const method of Object.keys(row.payments)) row.payments[method] /= 100;
    for (const entry of buildShiftDiscountBreakdown(receipts, items)) {
      const label = /^(special discount(?:\s*%)?|whole item discount)$/i.test(entry.label.trim()) ? "Special Discount" : entry.label;
      labels.add(label);
      row.breakdown[label] = (Math.round((row.breakdown[label] || 0) * 100) + Math.round(entry.amount * 100)) / 100;
    }
    for (const key of ["gross", "discount", "refund", "net"]) row[key] /= 100;
    return row;
  }).filter(Boolean);
  const orderedLabels = [...labels].sort();
  const orderedPayments = [...paymentTypes].sort((a,b) => a.localeCompare(b));
  const totals = { day: "Total", gross: 0, discount: 0, refund: 0, net: 0, breakdown: {}, payments: {} };
  for (const row of rows) {
    for (const key of ["gross", "discount", "refund", "net"]) totals[key] += Math.round(row[key] * 100);
    for (const method of orderedPayments) totals.payments[method] = (totals.payments[method] || 0) + Math.round((row.payments[method] || 0) * 100);
    for (const label of orderedLabels) totals.breakdown[label] = (totals.breakdown[label] || 0) + Math.round((row.breakdown[label] || 0) * 100);
  }
  for (const key of ["gross", "discount", "refund", "net"]) totals[key] /= 100;
  for (const label of orderedLabels) totals.breakdown[label] /= 100;
  for (const method of orderedPayments) totals.payments[method] /= 100;
  return { rows, labels: orderedLabels, paymentTypes: orderedPayments, totals };
}
