"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { pettyCashMonthlyCsv, pettyCashMonthlySummary } from "@/lib/pettyCashMonthlySummary";

export default function PettyCashMonthlySummary({ storeId, storeName }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    if (!storeId || !/^\d{4}-\d{2}$/.test(month)) return;
    async function load() {
      try {
        const supabase = getSupabaseClient();
        const [year, number] = month.split("-").map(Number);
        const next = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`;
        const entries = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await supabase.from("finance_petty_cash_entries").select("*").eq("store_id", storeId).gte("expense_date", `${month}-01`).lt("expense_date", next).order("expense_date").order("id").range(offset, offset + 499);
          if (queryError) throw queryError;
          if (cancelled) return;
          entries.push(...data);
          if (data.length < 500) break;
        }
        const references = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await supabase.from("finance_references").select("*").in("ref_type", ["item", "item_category", "supplier"]).order("id").range(offset, offset + 499);
          if (queryError) throw queryError;
          if (cancelled) return;
          references.push(...data);
          if (data.length < 500) break;
        }
        if (!cancelled) setResult({ entries, references, month, storeId });
      } catch (err) {
        if (!cancelled) setError(err.message || "Unable to load monthly summary.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [month, storeId, revision]);
  const current = result?.month === month && result?.storeId === storeId ? result : null;
  const summary = useMemo(() => current ? pettyCashMonthlySummary(current.entries, current.references) : null, [current]);
  function download() {
    if (!summary) return;
    const url = URL.createObjectURL(new Blob([pettyCashMonthlyCsv(summary)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `petty-cash-monthly-${String(storeName || storeId).replace(/[^a-z0-9-]/gi, "-")}-${month}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="mr-auto"><h2 className="font-semibold">Petty Cash Monthly Summary — {storeName}</h2><p className="text-xs text-slate-500">Grouped by receipt number, type, supplier and receipt date. The month uses expense dates.</p></div>
      <label className="text-xs">Month<input aria-label="Summary month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-lg border p-2" /></label>
      <button type="button" onClick={() => setRevision((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
      <button type="button" disabled={!summary} onClick={download} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm text-white disabled:opacity-40">Export Monthly CSV</button>
    </div>
    <p className="text-xs text-slate-500">PCV No. is blank. Non-VAT appears under VAT Exempt; AR appears in its own column. Category amounts include VAT. Unclassified items appear under Uncategorized; receipts without numbers remain separate.</p>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : !month ? <p>Select a month.</p> : !summary ? <p role="status">Loading monthly summary…</p> : <>
      <p className="text-sm">{summary.rows.length} receipt totals</p>
      <div className="max-h-[65vh] overflow-auto rounded-lg border">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="sticky top-0 bg-slate-900 text-white"><tr>{summary.headers.map((header, index) => <th key={index} scope="col" className="px-3 py-3 text-left">{header}</th>)}</tr></thead>
          <tbody>{summary.rows.map((row, index) => <tr key={index} className="border-b even:bg-slate-50">{row.map((value, column) => <td key={column} className={`px-3 py-2 ${typeof value === "number" ? "text-right tabular-nums" : ""}`}>{typeof value === "number" && column !== 5 ? value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</td>)}</tr>)}</tbody>
          <tfoot className="sticky bottom-0 bg-slate-100 font-semibold"><tr>{summary.totals.map((value, column) => <td key={column} className="px-3 py-3">{typeof value === "number" && column !== 5 ? value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</td>)}</tr></tfoot>
        </table>
      </div>
      {!summary.rows.length && <p className="text-sm text-slate-500">No petty cash expenses for this month.</p>}
    </>}
  </section>;
}
