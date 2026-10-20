"use client";
import { useMemo } from "react";
import { buildNonCashMonitoring } from "@/lib/reports/nonCashMonitoring";
import { exportReportToCSV } from "@/lib/reports/exportCsv";

const money = (value) => Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (value) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const amounts = ["amount", "refund", "net"];
const columns = [["date", "Business date"], ["time", "Transaction time"], ["receiptNumber", "Receipt number"], ["paymentMethod", "Payment type"], ["reference", "Reference number"], ["amount", "Amount"], ["refund", "Refunds / voids"], ["net", "Net amount"], ["branch", "Branch"], ["cashier", "Cashier"], ["status", "Status"]];

export default function NonCashMonitoring({ sales, paymentMethod = "All", startDate, endDate, onDateChange }) {
  const rows = useMemo(() => buildNonCashMonitoring(sales).filter((row) => paymentMethod === "All" || row.paymentMethod === paymentMethod), [sales, paymentMethod]);
  const totals = Object.fromEntries(amounts.map((field) => [field, rows.reduce((sum, row) => sum + Math.round(row[field] * 100), 0) / 100]));
  function exportCsv() {
    const output = rows.map((row) => ({ ...row, time: time(row.time), ...Object.fromEntries(amounts.map((field) => [field, row[field].toFixed(2)])) }));
    output.push({ receiptNumber: "TOTAL", ...Object.fromEntries(amounts.map((field) => [field, totals[field].toFixed(2)])) });
    exportReportToCSV(output, `juja-daily-non-cash-${startDate}-to-${endDate}.csv`, columns.map(([key, label]) => ({ key, label })));
  }
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Daily non-cash monitoring</h2><p className="mt-1 text-sm text-slate-500">{startDate === endDate ? startDate : `${startDate} to ${endDate}`} · {rows.length} payment entries</p></div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Monitoring date<input type="date" value={startDate} onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><button type="button" onClick={exportCsv} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Export CSV</button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{[["Non-cash amount", totals.amount], ["Refunds / voids", totals.refund], ["Net non-cash", totals.net]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">₱{money(value)}</p></div>)}</div>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr>{columns.map(([key, label]) => <th key={key} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100">{columns.map(([key]) => <td key={key} className={`whitespace-nowrap p-3 ${amounts.includes(key) ? "text-right tabular-nums" : ""}`}>{amounts.includes(key) ? money(row[key]) : key === "time" ? time(row[key]) : row[key] || "—"}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length} className="p-6 text-center text-slate-500">No non-cash transactions found for these filters.</td></tr>}</tbody><tfoot><tr className="bg-slate-100 font-bold">{columns.map(([key], index) => <td key={key} className="p-3">{index === 0 ? "Total" : amounts.includes(key) ? money(totals[key]) : ""}</td>)}</tr></tfoot></table></div>
    <div className="flex flex-wrap gap-3">{[...new Set(rows.map((row) => row.paymentMethod))].sort().map((method) => <p key={method} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><strong>{method}</strong>: ₱{money(rows.filter((row) => row.paymentMethod === method).reduce((sum, row) => sum + row.net, 0))} net</p>)}</div>
    <p className="text-xs text-slate-500">Split receipts show each non-cash portion separately. Cash and no-payment entries are excluded. Refunds follow recorded payment proportions; references appear when saved. Amounts are PHP.</p>
  </section>;
}
