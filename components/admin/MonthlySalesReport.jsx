"use client";

import { useMemo } from "react";
import { buildMonthlySales, monthRange } from "@/lib/reports/monthlySales";
import { exportReportToCSV } from "@/lib/reports/exportCsv";

const amount = (value) => Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MonthlySalesReport({ sales = [], lineItems = [], startDate, endDate, branch, loading, onMonthChange, minimumDate = "", reportData = null, showMonthPicker = true, showPaymentTypes = false }) {
  const month = startDate.slice(0, 7);
  const range = monthRange(month);
  const report = useMemo(() => reportData || buildMonthlySales(sales, lineItems, month, minimumDate), [reportData, sales, lineItems, month, minimumDate]);
  const paymentTypes = showPaymentTypes ? report.paymentTypes || [] : [];
  const completeRange = range && startDate === (minimumDate && range.startDate < minimumDate ? minimumDate : range.startDate) && endDate === range.endDate;
  const title = range ? new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.startDate}T00:00:00Z`)) : month;
  function exportCsv() {
    const columns = ["Period", "Branch", "Day", "Date", "Gross sales", ...report.labels.map((label) => `Discount: ${label}`), "Total discounts", ...paymentTypes.map(method => `Payment: ${method}`), "Refunds", "Net sales"];
    const rows = [...report.rows, report.totals].map((row) => {
      const values = [month, branch, row.day, row.date || "", row.gross.toFixed(2), ...report.labels.map((label) => (row.breakdown[label] || 0).toFixed(2)), row.discount.toFixed(2), ...paymentTypes.map(method => (row.payments?.[method] || 0).toFixed(2)), row.refund.toFixed(2), row.net.toFixed(2)];
      return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    });
    exportReportToCSV(rows, `juja-monthly-sales-${month}.csv`, columns);
  }
  const cell = "border border-slate-300 px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const renderRow = (row) => <tr key={row.date || "total"} className={row.day === "Total" ? "bg-slate-100 font-bold" : "even:bg-slate-50"}>
    <th scope="row" className={`${cell} text-center`}>{row.day}</th>
    <td className={cell}>{amount(row.gross)}</td>
    {report.labels.map((label) => <td key={label} className={cell}>{amount(row.breakdown[label])}</td>)}
    <td className={cell}>{amount(row.discount)}</td>
    {paymentTypes.map(method => <td key={method} className={cell}>{amount(row.payments?.[method])}</td>)}
    <td className={cell}>{amount(row.refund)}</td>
    <td className={`${cell} font-semibold`}>{amount(row.net)}</td>
  </tr>;
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      {showMonthPicker&&<label className="text-sm font-semibold">Report month<input type="month" min={minimumDate?minimumDate.slice(0,7):undefined} value={month} disabled={loading} onChange={(event) => { const next = monthRange(event.target.value); if (next && (!minimumDate || next.endDate >= minimumDate)) onMonthChange(minimumDate && next.startDate < minimumDate ? minimumDate : next.startDate, next.endDate); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>}
      <div className="flex gap-2">{!completeRange && <button type="button" disabled={loading} onClick={() => onMonthChange(minimumDate && range.startDate < minimumDate ? minimumDate : range.startDate, range.endDate)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Load full month</button>}<button type="button" disabled={loading || !completeRange} onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button></div>
    </div>
    <div className="mb-5 text-center"><p className="font-bold uppercase">JUJA BREW &amp; BITES — {branch}</p><h2 className="font-bold uppercase">Monthly Sales Report</h2><p className="text-sm">For the month of {title}</p>{minimumDate && range?.startDate < minimumDate && <p className="text-sm">Reporting starts {minimumDate}; earlier days are excluded.</p>}</div>
    {!completeRange && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The current date range covers only part of this month. Load the full month before exporting.</p>}
    {loading ? <p role="status">Loading monthly sales…</p> : <>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs"><thead className="bg-slate-100 text-center">
        <tr><th rowSpan={2} className={cell}>Day</th><th rowSpan={2} className={`${cell} text-center`}>Gross Sales</th><th colSpan={report.labels.length + 1} className={`${cell} text-center`}>Sales Discounts</th>{paymentTypes.length > 0 && <th colSpan={paymentTypes.length} className={`${cell} text-center`}>Payment Types</th>}<th rowSpan={2} className={cell}>Refunds</th><th rowSpan={2} className={cell}>Net Sales</th></tr>
        <tr>{[...report.labels, "Total discounts"].map((label) => <th key={label} className={`${cell} min-w-28 whitespace-normal text-center`}>{label}</th>)}{paymentTypes.map(method => <th key={method} className={`${cell} min-w-28 whitespace-normal text-center`}>{method}</th>)}</tr>
      </thead><tbody>{report.rows.map(renderRow)}</tbody><tfoot>{renderRow(report.totals)}</tfoot></table></div>
      <div className="ml-auto mt-5 max-w-md space-y-2 text-sm">{[["Gross sales", report.totals.gross], ["Less: discounts", report.totals.discount], ["Less: refunds", report.totals.refund], ["Net sales", report.totals.net]].map(([label, value]) => <p key={label} className={`flex justify-between border-b border-slate-200 py-1 ${label === "Net sales" ? "border-double border-slate-800 font-bold" : ""}`}><span>{label}</span><span>₱{amount(value)}</span></p>)}</div>
    </>}
  </section>;
}
