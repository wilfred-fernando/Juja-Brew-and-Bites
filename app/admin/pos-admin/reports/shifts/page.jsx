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
    const { data } = await supabase.from("shifts").select("*");
    setData(data || []);
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Shift Report</h1>

      {data.map((s) => (
        <div key={s.id} className="flex justify-between border-b py-2">
          <span>Shift {s.shift_number}</span>
          <span>Variance: {peso(s.difference)}</span>
        </div>
      ))}
    </div>
  );
}
