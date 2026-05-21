"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function Page() {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data } = await supabase.from("order_items").select("*");

    const map = {};

    data.forEach((i) => {
      if (!map[i.name]) map[i.name] = { qty: 0, sales: 0 };

      map[i.name].qty += Number(i.quantity);
      map[i.name].sales += Number(i.line_total || 0);
    });

    setItems(
      Object.entries(map)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.sales - a.sales)
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Sales by Item</h1>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Sales</th>
          </tr>
        </thead>

        <tbody>
          {items.map((i) => (
            <tr key={i.name} className="border-b">
              <td>{i.name}</td>
              <td>{i.qty}</td>
              <td>{peso(i.sales)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}