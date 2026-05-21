"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/* ================= UTILS ================= */
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

/* ================= COMPONENT ================= */
export default function SalesReport() {
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState({
    daily: [],
    payments: [],
    topItems: [],
    shifts: [],
  });

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    setLoading(true);

    const { data: orders } = await supabase.from("orders").select("*");
    const { data: items } = await supabase.from("order_items").select("*");
    const { data: shifts } = await supabase.from("shifts").select("*");

    if (!orders || !items) {
      setLoading(false);
      return;
    }

    /* ================= DAILY SUMMARY ================= */
    const dailyMap = {};

    orders.forEach((o) => {
      const date = formatDate(o.created_at);

      if (!dailyMap[date]) {
        dailyMap[date] = {
          gross: 0,
          discounts: 0,
          net: 0,
        };
      }

      const total = Number(o.total || 0);
      const discount = Number(o.discount || 0);

      dailyMap[date].gross += total;
      dailyMap[date].discounts += discount;
      dailyMap[date].net += total - discount;
    });

    const daily = Object.entries(dailyMap).map(([date, v]) => ({
      date,
      ...v,
    }));

    /* ================= PAYMENTS ================= */
    const payMap = {};

    orders.forEach((o) => {
      const key = o.payment_method || "Other";
      if (!payMap[key]) payMap[key] = 0;
      payMap[key] += Number(o.total || 0);
    });

    const payments = Object.entries(payMap).map(([name, value]) => ({
      name,
      value,
    }));

    /* ================= TOP ITEMS ================= */
    const itemMap = {};

    items.forEach((i) => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, sales: 0 };

      itemMap[i.name].qty += Number(i.quantity || 0);
      itemMap[i.name].sales += Number(i.line_total || 0);
    });

    const topItems = Object.entries(itemMap)
      .map(([name, v]) => ({
        name,
        ...v,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    /* ================= SET DATA ================= */
    setReport({
      daily,
      payments,
      topItems,
      shifts: shifts || [],
    });

    setLoading(false);
  }

  if (loading) return <p className="p-6">Loading report...</p>;

  return (
    <div className="p-6 space-y-8">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Sales Report</h1>
        <p className="text-sm text-gray-500">Summary of sales performance</p>
      </div>

      {/* ================= DAILY SALES TABLE ================= */}
      <Section title="Daily Sales Summary">
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th>Date</th>
              <th>Gross</th>
              <th>Discounts</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {report.daily.map((d, i) => (
              <tr key={i} className="border-b">
                <td>{d.date}</td>
                <td>{peso(d.gross)}</td>
                <td>{peso(d.discounts)}</td>
                <td className="font-semibold">{peso(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ================= PAYMENTS ================= */}
      <Section title="Payment Breakdown">
        {report.payments.map((p, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{p.name}</span>
            <span>{peso(p.value)}</span>
          </div>
        ))}
      </Section>

      {/* ================= TOP ITEMS ================= */}
      <Section title="Top Selling Items">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Sales</th>
            </tr>
          </thead>
          <tbody>
            {report.topItems.map((item, i) => (
              <tr key={i} className="border-b">
                <td>{item.name}</td>
                <td>{item.qty}</td>
                <td>{peso(item.sales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ================= SHIFT REPORT ================= */}
      <Section title="Shift Report (Cash Tracking)">
        {report.shifts.map((s) => (
          <div key={s.id} className="flex justify-between text-sm">
            <span>Shift {s.shift_number}</span>
            <span>Variance: {peso(s.difference)}</span>
          </div>
        ))}
      </Section>

    </div>
  );
}

/* ================= UI ================= */
function Section({ title, children }) {
  return (
    <div className="bg-white p-4 rounded-xl">
      <h2 className="font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}