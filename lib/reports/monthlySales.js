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
  const labels = new Set();
  const rows = Array.from({ length: range.days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    if(minimumDate && date < minimumDate)return null;
    const receipts = sales.filter((sale) => sale.date === date);
    const ids = new Set(receipts.flatMap((sale) => [String(sale.id), String(sale.orderKey || sale.id)]));
    const items = lineItems.filter((item) => ids.has(String(item.orderId || item.order_id)));
    const row = { date, day: index + 1, gross: 0, discount: 0, refund: 0, net: 0, breakdown: {} };
    for (const receipt of receipts) {
      for (const key of ["gross", "discount", "refund", "net"]) row[key] += Math.round(Number(receipt[key] || 0) * 100);
    }
    for (const entry of buildShiftDiscountBreakdown(receipts, items)) {
      labels.add(entry.label);
      row.breakdown[entry.label] = Math.round(entry.amount * 100) / 100;
    }
    for (const key of ["gross", "discount", "refund", "net"]) row[key] /= 100;
    return row;
  }).filter(Boolean);
  const orderedLabels = [...labels].sort();
  const totals = { day: "Total", gross: 0, discount: 0, refund: 0, net: 0, breakdown: {} };
  for (const row of rows) {
    for (const key of ["gross", "discount", "refund", "net"]) totals[key] += Math.round(row[key] * 100);
    for (const label of orderedLabels) totals.breakdown[label] = (totals.breakdown[label] || 0) + Math.round((row.breakdown[label] || 0) * 100);
  }
  for (const key of ["gross", "discount", "refund", "net"]) totals[key] /= 100;
  for (const label of orderedLabels) totals.breakdown[label] /= 100;
  return { rows, labels: orderedLabels, totals };
}
