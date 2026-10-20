// Finance-only derived reference. Never used to price or persist a sale.
const cents = value => Math.max(0, Math.round((Number(value) || 0) * 100));
export const VAT_REFERENCE_COLUMNS = [
  ['invoiceFrom', 'Service Invoice From'], ['invoiceTo', 'Service Invoice To'], ['invoiceCount', 'TOTAL SI'],
  ['grossSales', 'Gross Sales'], ['vatableSales', 'VATable Transactions'],
  ['exemptSales', 'VAT-exempt Transactions'], ['outputVat', 'Output VAT'],
  ['seniorPwdDiscount', 'SC | PWD'], ['employeeMeal', 'Employees Meal'],
  ['employeeDiscount', 'Employees Discount'], ['promos', 'Promos'], ['loyalty', 'Loyalty'],
  ['totalDiscounts', 'Total Discounts'], ['refunds', 'Refunds'], ['referenceNet', 'Net Sales'],
];
const referenceKeys = ['vatRemoved', 'recordedNet', 'difference', 'reviewCount'];
const amountKeys = [...VAT_REFERENCE_COLUMNS.map(([key]) => key).filter(key => !key.startsWith('invoice')), ...referenceKeys.filter(key => key !== 'reviewCount')];
const number = value => String(value).padStart(3, '0');

function discountGroup(item) {
  if (item.appliedVoucher || /\bloyalty\b|\bpoints?\b|\bwelcome\b|\bbirthday\b/.test(String(item.discountName || '').toLowerCase())) return 'loyalty';
  const name = String(item.discountName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (name === 'free') return 'employeeMeal';
  if (/^(special discount(?: %)?|whole item discount)$/.test(name)) return 'employeeDiscount';
  return 'promos';
}

export function buildFinanceVatReference(sales, lineItems, dates, invoiceOffset = 0) {
  let sequence = invoiceOffset;
  const rows = dates.map(date => {
    const row = { date, ...Object.fromEntries([...VAT_REFERENCE_COLUMNS.map(([key]) => key), ...referenceKeys].map(key => [key, 0])) };
    const count = sales.filter(sale => sale.date === date).length;
    row.invoiceCount = count;
    row.invoiceFrom = count ? number(sequence + 1) : '';
    row.invoiceTo = count ? number(sequence + count) : '';
    sequence += count;
    for (const sale of sales.filter(sale => sale.date === date)) {
      const items = lineItems.filter(item => String(item.orderId) === String(sale.id) && item.source === sale.source);
      const gross = cents(sale.gross);
      // Do not infer a beneficiary's share from a receipt-level discount.
      if (!items.length || Math.abs(items.reduce((sum, item) => sum + cents(item.gross), 0) - gross) > 1 ||
          Math.abs(items.reduce((sum, item) => sum + cents(item.discount), 0) - cents(sale.discount)) > 1) {
        row.reviewCount++;
        continue;
      }
      const values = Object.fromEntries(amountKeys.map(key => [key, 0]));
      values.grossSales = gross;
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
          values[discountGroup(item)] += discount;
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
    row.totalDiscounts = row.seniorPwdDiscount + row.employeeMeal + row.employeeDiscount + row.promos + row.loyalty;
    for (const key of amountKeys) row[key] /= 100;
    return row;
  });
  const totals = { date: 'Total' };
  totals.invoiceFrom = rows.find(row => row.invoiceCount)?.invoiceFrom || '';
  totals.invoiceTo = rows.findLast(row => row.invoiceCount)?.invoiceTo || '';
  for (const key of [...amountKeys, 'reviewCount', 'invoiceCount']) totals[key] = ['reviewCount', 'invoiceCount'].includes(key)
    ? rows.reduce((sum, row) => sum + row[key], 0)
    : rows.reduce((sum, row) => sum + Math.round(row[key] * 100), 0) / 100;
  return { rows, totals };
}
