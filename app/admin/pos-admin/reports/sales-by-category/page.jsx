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
    const { data: items } = await supabase.from("order_items").select("*");
    const { data: menu } = await supabase.from("menu_items").select("*");

    const map = {};
    const menuMap = {};

    menu.forEach((m) => (menuMap[m.id] = m.category));

    items.forEach((i) => {
      const cat = menuMap[i.menu_item_id] || "Unknown";

      if (!map[cat]) map[cat] = 0;
      map[cat] += Number(i.line_total || 0);
    });

    setData(
      Object.entries(map).map(([name, total]) => ({ name, total }))
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Sales by Category</h1>

      {data.map((c) => (
        <div key={c.name} className="flex justify-between border-b py-2">
          <span>{c.name}</span>
          <span>{peso(c.total)}</span>
        </div>
      ))}
    </div>
  );
}
