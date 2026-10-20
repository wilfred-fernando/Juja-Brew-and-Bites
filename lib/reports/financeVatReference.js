// Finance-only derived reference. Never used to price or persist a sale.
const cents = value => Math.max(0, Math.round((Number(value) || 0) * 100));
export const VAT_REFERENCE_COLUMNS = [
  ['vatableSales', 'VATable sales (ex VAT)'], ['outputVat', 'Output VAT'],
  ['exemptSales', 'SC/PWD VAT-exempt base'], ['vatRemoved', 'SC/PWD VAT removed'],
  ['seniorPwdDiscount', 'SC/PWD 20% discount'], ['referenceNet', 'Reference net (VAT included where applicable)'],
  ['recordedNet', 'Recorded net'], ['difference', 'Recorded less reference'],
  ['reviewCount', 'Receipts requiring review'],
];

export function buildFinanceVatReference(sales, lineItems, dates) {
  const rows = dates.map(date => {
    const row = { date, ...Object.fromEntries(VAT_REFERENCE_COLUMNS.map(([key]) => [key, 0])) };
    for (const sale of sales.filter(sale => sale.date === date)) {
      const items = lineItems.filter(item => String(item.orderId) === String(sale.id) && item.source === sale.source);
      const gross = cents(sale.gross);
      // Do not infer a beneficiary's share from a receipt-level discount.
      if (!items.length || Math.abs(items.reduce((sum, item) => sum + cents(item.gross), 0) - gross) > 1 ||
          Math.abs(items.reduce((sum, item) => sum + cents(item.discount), 0) - cents(sale.discount)) > 1) {
        row.reviewCount++;
        continue;
      }
      const values = { vatableSales: 0, outputVat: 0, exemptSales: 0, vatRemoved: 0, seniorPwdDiscount: 0, referenceNet: 0 };
      for (const item of items) {
        const itemGross = cents(item.gross), discount = cents(item.discount);
        const eligible = discount > 0 && !item.appliedVoucher && /\b(sc|senior|pwd)\b/i.test(`${item.discountName || ''} ${item.discountBeneficiaryType || ''}`);
        if (eligible) {
          const base = Math.round(itemGross * 100 / 112), reduction = Math.round(base * 20 / 100);
          values.exemptSales += base;
          values.vatRemoved += itemGross - base;
          values.seniorPwdDiscount += reduction;
          values.referenceNet += base - reduction;
        } else {
          const net = Math.max(0, itemGross - discount), base = Math.round(net * 100 / 112);
          values.vatableSales += base;
          values.outputVat += net - base;
          values.referenceNet += net;
        }
      }
      // Refunds without an item-level allocation are not a reliable tax reference.
      if (cents(sale.refund) > 0 || ['Refunded', 'Voided'].includes(sale.status)) {
        row.reviewCount++;
        continue;
      }
      for (const [key, value] of Object.entries(values)) row[key] += value;
      row.recordedNet += cents(sale.net);
      row.difference += cents(sale.net) - values.referenceNet;
    }
    for (const [key] of VAT_REFERENCE_COLUMNS) if (key !== 'reviewCount') row[key] /= 100;
    return row;
  });
  const totals = { date: 'Total' };
  for (const [key] of VAT_REFERENCE_COLUMNS) totals[key] = key === 'reviewCount'
    ? rows.reduce((sum, row) => sum + row[key], 0)
    : rows.reduce((sum, row) => sum + Math.round(row[key] * 100), 0) / 100;
  return { rows, totals };
}
