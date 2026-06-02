"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const ACTIVE_STATUSES = ["pending", "accepted", "ready", "Pending", "Accepted", "Ready"];
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function AdminLiveOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const totals = useMemo(() => ({
    count: orders.length,
    value: orders.reduce((sum, order) => sum + Number(order.total || order.subtotal || 0), 0),
  }), [orders]);

  async function fetchOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from("web_orders")
      .select("*")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true });
    if (!error) setOrders(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel("admin-live-web-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "web_orders" }, fetchOrders)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">Operations</p>
        <h1 className="text-2xl font-black text-slate-800">Live Orders</h1>
        <p className="text-xs font-semibold text-slate-500 mt-1">Preparing orders only. Completed orders are hidden.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-rose-100 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Orders</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totals.count}</p>
        </div>
        <div className="rounded-2xl bg-white border border-rose-100 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Value</p>
          <p className="text-2xl font-black text-[#FC687D] mt-1">{peso(totals.value)}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-rose-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">No preparing orders.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <div key={order.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-black text-slate-900">#{String(order.id).slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">{order.customer_name || "Web Customer"} · {order.dining_option || "Web Order"}</p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1">{order.created_at ? new Date(order.created_at).toLocaleString() : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-rose-50 border border-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-[#FC687D]">{order.status}</span>
                  <span className="text-sm font-black text-slate-800">{peso(order.total || order.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
