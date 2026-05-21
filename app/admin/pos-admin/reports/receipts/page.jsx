"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function Page() {
  const supabase = getSupabaseClient();
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data } = await supabase.from("orders").select("*").limit(100);
    setOrders(data || []);
  }

  return (
    <div className="p-6">
      <h1 className="font-bold mb-4">Receipts</h1>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b">
              <td>{o.id}</td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>{peso(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}