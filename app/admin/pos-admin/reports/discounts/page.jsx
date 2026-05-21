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

    const filtered = orders.filter((o) => Number(o.discount) > 0);

    setData(filtered);
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Discounts</h1>

      {data.map((o) => (
        <div key={o.id} className="flex justify-between border-b py-2">
          <span>{new Date(o.created_at).toLocaleDateString()}</span>
          <span>{peso(o.discount)}</span>
        </div>
      ))}
    </div>
  );
}