export function individualPaymentOptions(sales = []) {
  const methods = new Set();
  for (const sale of sales) {
    const splits = sale.paymentSplits?.length ? sale.paymentSplits : [{ method: sale.paymentMethod }];
    for (const split of splits) if (split.method && !split.method.includes(" + ")) methods.add(split.method);
  }
  return [...methods].sort((a, b) => a.localeCompare(b)).map((method) => ({ value: method, label: method }));
}

export function paymentPortionData(data, method) {
  if (!method || method === "All") return data;
  const ratios = new Map();
  const sales = [];
  const scale = (value, ratio) => Math.round(Number(value || 0) * ratio * 100) / 100;
  for (const sale of data.sales || []) {
    const splits = sale.paymentSplits?.length ? sale.paymentSplits : [{ method: sale.paymentMethod, amount: 1 }];
    const matches = splits.filter((split) => split.method === method);
    if (!matches.length) continue;
    const total = splits.reduce((sum, split) => sum + Math.max(0, Number(split.amount || 0)), 0);
    const selected = matches.reduce((sum, split) => sum + Math.max(0, Number(split.amount || 0)), 0);
    const ratio = total ? selected / total : matches.length / splits.length;
    ratios.set(String(sale.orderKey || sale.id), ratio);
    ratios.set(String(sale.id), ratio);
    const gross = scale(sale.gross, ratio), discount = scale(sale.discount, ratio), refund = scale(sale.refund, ratio);
    sales.push({ ...sale, paymentMethod: method, gross, discount, refund, net: Math.max(0, Math.round((gross - discount - refund) * 100) / 100) });
  }
  const lineItems = (data.lineItems || []).filter((item) => ratios.has(String(item.orderId || item.order_id))).map((item) => {
    const ratio = ratios.get(String(item.orderId || item.order_id));
    return { ...item, gross: scale(item.gross, ratio), discount: scale(item.discount, ratio), net: scale(item.net, ratio) };
  });
  return { ...data, sales, lineItems };
}
