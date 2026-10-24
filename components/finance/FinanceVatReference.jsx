"use client";

import { VAT_REFERENCE_COLUMNS, AGGREGATOR_REFERENCE_GROUPS, AGGREGATOR_REFERENCE_FIELDS } from '@/lib/reports/financeVatReference';
import { exportReportToCSV } from '@/lib/reports/exportCsv';

export default function FinanceVatReference({ report, month, branch }) {
  const columns = [['date', 'Date'], ...VAT_REFERENCE_COLUMNS];
  const rows = [...report.rows, report.totals];
  const isText = key => key === 'date' || key.startsWith('invoice');
  const format = (key, value) => isText(key) ? value : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function exportCsv() {
    const headers = ['Period', 'Branch', ...columns.map(([, label]) => label)];
    exportReportToCSV(rows.map(row => Object.fromEntries([
      ['Period', month], ['Branch', branch], ...columns.map(([key, label]) => [label, isText(key) ? row[key] : row[key].toFixed(2)]),
    ])), `juja-finance-vat-reference-${month}.csv`, headers);
  }
  return <section className="mt-6 rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Internal VAT accounting reference</h2><button type="button" onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white">Export VAT reference CSV</button></div>
    <p className="my-3 text-sm">Existing prices are treated as 12% VAT-inclusive. Discounted SC/PWD items: price ÷ 1.12, then 20% discount. Other items retain recorded discounts. Calculated per item, rounded to centavos. Available from August 11, 2026. POS, receipts and recorded collections retain their existing amounts.</p>
    <p className="mb-4 text-sm">VAT-exempt base is before the 20% discount. Recorded and reference totals below cover only included receipts. Refunds, voids and receipts with incomplete or unreconciled item details are excluded and counted for review.</p>
    <p className="mb-4 text-sm">Service Invoice From / To are internal continuous transaction positions, starting at 001 on August 11, 2026 within the selected store scope and continuing across months without resetting, including transactions requiring review. TOTAL SI counts transactions. These are not official invoice numbers and do not replace existing receipt numbers. Free → Employees Meal; Special Discount, Special Discount % and Whole Item Discount → Employees Discount; vouchers and loyalty discounts → Loyalty; remaining discounts → Promos.</p>
    <p className="mb-4 text-sm">GrabFood and ShopeeFood gross sales are included receipts’ recorded channel payments before platform fees. Commission: GrabFood 25% ÷ 1.12; ShopeeFood 27% ÷ 1.12. Tax on commission is 12%; EWT is 0.5% of gross × 0.89 (GrabFood) or × 0.622855 (ShopeeFood). Net sales deduct commission, commission tax and EWT. Calculated on daily channel totals; monthly totals sum the daily values. Manual Others adjustments and actual remittances remain in Cash Flow.</p>
    {report.totals.reviewCount > 0 && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-950">{report.totals.reviewCount} receipt(s) require review; these reference totals are incomplete. The recorded sales report above includes them.</p>}
    <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><caption className="mb-2 text-left">{month} · {branch} · Accounting reference only</caption><thead className="bg-slate-100"><tr>
      <th rowSpan={2} scope="col" className="border border-slate-300 px-3 py-2">Date</th>
      <th colSpan={3} scope="colgroup" className="border border-slate-300 px-3 py-2">Service Invoice (internal)</th>
      {VAT_REFERENCE_COLUMNS.slice(3, 7).map(([key, label]) => <th key={key} rowSpan={2} scope="col" className="border border-slate-300 px-3 py-2">{label}</th>)}
      <th colSpan={6} scope="colgroup" className="border border-slate-300 px-3 py-2">Sales Discount</th>
      {VAT_REFERENCE_COLUMNS.slice(13, 15).map(([key, label]) => <th key={key} rowSpan={2} scope="col" className="border border-slate-300 px-3 py-2">{label}</th>)}
      {AGGREGATOR_REFERENCE_GROUPS.map(([key, label]) => <th key={key} colSpan={5} scope="colgroup" className="border border-slate-300 px-3 py-2">{label}</th>)}
    </tr><tr>{[['invoiceFrom', 'From'], ['invoiceTo', 'To'], ['invoiceCount', 'TOTAL SI'], ...VAT_REFERENCE_COLUMNS.slice(7, 13)].map(([key, label]) => <th key={key} scope="col" className="border border-slate-300 px-3 py-2">{label}</th>)}{AGGREGATOR_REFERENCE_GROUPS.flatMap(([prefix]) => AGGREGATOR_REFERENCE_FIELDS.map(([key, label]) => <th key={prefix + key} scope="col" className="border border-slate-300 px-3 py-2">{label}</th>))}</tr></thead><tbody>{rows.map(row => <tr key={row.date} className={row.date === 'Total' ? 'bg-slate-100 font-bold' : 'even:bg-slate-50'}>{columns.map(([key]) => <td key={key} className="whitespace-nowrap border border-slate-300 px-3 py-2 text-right tabular-nums">{format(key, row[key])}</td>)}</tr>)}</tbody></table></div>
    <p className="mt-4 text-sm">Included receipts: recorded net ₱{format('recordedNet', report.totals.recordedNet)}; internal net ₱{format('referenceNet', report.totals.referenceNet)}; difference ₱{format('difference', report.totals.difference)}. SC/PWD VAT removed: ₱{format('vatRemoved', report.totals.vatRemoved)}. Gross Sales − VAT removed − Total Discounts − Refunds = Net Sales. Output VAT is already included in Net Sales.</p>
  </section>;
}
