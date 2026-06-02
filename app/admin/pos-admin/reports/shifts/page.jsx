"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dateLabel, loadReportData, peso } from "../reportData";

function label(row) {
  const type = String(row.shift_type || row.type || row.action || "").toLowerCase();
  if (type.includes("close")) return "Close Shift";
  if (type.includes("open")) return "Open Shift";
  return "Shift";
}

export default function Page() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchData() {
      const data = await loadReportData(supabase);
      if (!active) return;
      if (data.error) {
        setError(data.error.message);
        setRows([]);
        return;
      }
      setError("");
      setRows(data.shifts);
    }
    fetchData();
    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="font-bold text-lg">Shifts</h1>
      {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">Reports Failed: {error}</div> : null}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-rose-50 text-left text-rose-700">
            <tr>
              <th className="p-3">Date</th>
              <th>Type</th>
              <th>Cashier</th>
              <th>Starting Cash</th>
              <th>Cash Total</th>
              <th>Expected Cash</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="7" className="p-6 text-center text-slate-400">No shift records found.</td></tr>
            ) : rows.map((row) => {
              const starting = Number(row.starting_cash || row.initial_cash || 0);
              const cashTotal = Number(row.cash_total || row.cash_amount || row.total_cash || 0);
              const expected = Number(row.expected_cash || row.expected_cash_amount || cashTotal || 0);
              const variance = Number(row.variance || row.difference || cashTotal - expected || 0);
              return (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{dateLabel(row.created_at)}</td>
                  <td className="font-semibold">{label(row)}</td>
                  <td>{row.cashier_name || row.cashier || row.user_name || "Cashier"}</td>
                  <td>{peso(starting)}</td>
                  <td>{peso(cashTotal)}</td>
                  <td>{peso(expected)}</td>
                  <td className={variance === 0 ? "font-bold" : "font-bold text-rose-600"}>{peso(variance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
