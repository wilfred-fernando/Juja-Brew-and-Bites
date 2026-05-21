"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function Page() {
  const supabase = getSupabaseClient();
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: orders } = await supabase.from("orders").select("*");

    const map = {};

    orders.forEach((o) => {
      const key = o.payment_method || "Other";

      if (!map[key]) map[key] = 0;
      map[key] += Number(o.total || 0);
    });

    setData(Object.entries(map).map(([name, total]) => ({ name, total })));
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Sales by Payment</h1>

      {data.map((p) => (
        <div key={p.name} className="flex justify-between border-b py-2">
          <span>{p.name}</span>
          <span>{peso(p.total)}</span>
        </div>
      ))}
    </div>
  );
}