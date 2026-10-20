"use client";

import { VAT_REFERENCE_COLUMNS } from '@/lib/reports/financeVatReference';
import { exportReportToCSV } from '@/lib/reports/exportCsv';

export default function FinanceVatReference({ report, month, branch }) {
  const columns = [['date', 'Date'], ...VAT_REFERENCE_COLUMNS];
  const rows = [...report.rows, report.totals];
  const format = (key, value) => key === 'date' ? value : key === 'reviewCount' ? value : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function exportCsv() {
    const headers = ['Period', 'Branch', ...columns.map(([, label]) => label)];
    exportReportToCSV(rows.map(row => Object.fromEntries([
      ['Period', month], ['Branch', branch], ...columns.map(([key, label]) => [label, key === 'date' || key === 'reviewCount' ? row[key] : row[key].toFixed(2)]),
    ])), `juja-finance-vat-reference-${month}.csv`, headers);
  }
  return <section className="mt-6 rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Internal VAT accounting reference</h2><button type="button" onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white">Export VAT reference CSV</button></div>
    <p className="my-3 text-sm">Existing prices are treated as 12% VAT-inclusive. Discounted SC/PWD items: price ÷ 1.12, then 20% discount. Other items retain recorded discounts. Calculated per item, rounded to centavos. Available from August 11, 2026. POS, receipts and recorded collections retain their existing amounts.</p>
    <p className="mb-4 text-sm">VAT-exempt base is before the 20% discount. Recorded and reference totals below cover only included receipts. Refunds, voids and receipts with incomplete or unreconciled item details are excluded and counted for review.</p>
    {report.totals.reviewCount > 0 && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-950">{report.totals.reviewCount} receipt(s) require review; these reference totals are incomplete. The recorded sales report above includes them.</p>}
    <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><caption className="mb-2 text-left">{month} · {branch} · Accounting reference only</caption><thead><tr>{columns.map(([key, label]) => <th key={key} scope="col" className="border border-slate-300 bg-slate-100 px-3 py-2">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.date} className={row.date === 'Total' ? 'bg-slate-100 font-bold' : 'even:bg-slate-50'}>{columns.map(([key]) => <td key={key} className="whitespace-nowrap border border-slate-300 px-3 py-2 text-right tabular-nums">{format(key, row[key])}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
