"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dateLabel, loadReportData, peso } from "../reportData";

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
      const posRows = data.orders.map((order) => ({
        id: order.id,
        source: "POS",
        date: order.created_at,
        discount: Number(order.discount || 0),
        total: Number(order.total || 0),
      }));
      const webRows = data.webOrders.map((order) => ({
        id: order.id,
        source: "Web",
        date: order.created_at,
        discount: Number(order.discount || 0),
        total: Number(order.total || order.subtotal || 0),
      }));
      setError("");
      setRows([...posRows, ...webRows].filter((row) => row.discount > 0));
    }
    fetchData();
    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="font-bold text-lg">Discounts</h1>
      {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">Reports Failed: {error}</div> : null}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-sky-50 text-left text-slate-700">
            <tr>
              <th className="p-3">Date</th>
              <th>Source</th>
              <th>Receipt</th>
              <th>Discount</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="5" className="p-6 text-center text-slate-500">No discounts found.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.source}-${row.id}`} className="border-t">
                <td className="p-3">{dateLabel(row.date)}</td>
                <td>{row.source}</td>
                <td>{String(row.id).slice(0, 12)}</td>
                <td className="font-bold text-slate-600">{peso(row.discount)}</td>
                <td>{peso(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
