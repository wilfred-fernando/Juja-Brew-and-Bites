"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/* ================= UTILS ================= */
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

function toISO(date) {
  return new Date(date).toISOString();
}

/* ================= PAGE ================= */
export default function Page() {
  const supabase = getSupabaseClient();

  const today = new Date().toISOString().split("T")[0];

  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData();
  }, [start, end]);

  async function fetchData() {
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", toISO(start))
      .lte("created_at", toISO(end + "T23:59:59"));

    const map = {};

    (orders || []).forEach((o) => {
      const d = new Date(o.created_at).toLocaleDateString();

      if (!map[d]) map[d] = { gross: 0, discount: 0, net: 0 };

      map[d].gross += Number(o.total || 0);
      map[d].discount += Number(o.discount || 0);
      map[d].net += Number(o.total) - Number(o.discount || 0);
    });

    setData(Object.entries(map).map(([date, v]) => ({ date, ...v })));
  }

  /* ================= EXPORT ================= */
  function exportCSV() {
    const header = ["Date", "Gross", "Discount", "Net"];

    const rows = data.map((d) => [
      d.date,
      d.gross,
      d.discount,
      d.net,
    ]);

    const csv =
      [header, ...rows].map((r) => r.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-summary.csv";
    a.click();
  }

  return (
    <div className="p-6 space-y-4">

      {/* HEADER */}
      <h1 className="font-bold text-lg">Sales Summary</h1>

      {/* FILTER */}
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="border px-2 py-1 rounded"
        />

        <span>-</span>

        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="border px-2 py-1 rounded"
        />

        <button
          onClick={exportCSV}
          className="ml-3 px-3 py-1 bg-black text-white rounded"
        >
          Export CSV
        </button>
      </div>

      {/* TABLE */}
      <table className="w-full text-sm mt-3">
        <thead className="border-b">
          <tr>
            <th>Date</th>
            <th>Gross</th>
            <th>Discount</th>
            <th>Net</th>
          </tr>
        </thead>

        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b">
              <td>{d.date}</td>
              <td>{peso(d.gross)}</td>
              <td>{peso(d.discount)}</td>
              <td className="font-bold">{peso(d.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}