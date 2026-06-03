"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";

const supabase = getSupabaseClient();
const KDS_STATUSES = ["pending", "accepted", "ready", "Pending", "Accepted", "Ready"];
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const visibleOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((order) => String(order.status || "").toLowerCase() === statusFilter);
  }, [orders, statusFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("web_orders")
      .select("*")
      .in("status", KDS_STATUSES)
      .order("created_at", { ascending: true });

    if (!error) setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kds-web-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "web_orders" },
        (payload) => {
          fetchOrders();
          if (payload.eventType === "INSERT") {
            const audio = new Audio("/sound/notification.mp3");
            audio.volume = 0.9;
            audio.play().catch(() => {});
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const updateStatus = async (id, status) => {
    const { error } = await supabase.from("web_orders").update({ status }).eq("id", id);
    if (!error) fetchOrders();
  };

  const getTimeAgo = (date) => {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)} hr ago`;
  };

  const printKitchenTicket = (order) => {
    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>KDS Ticket</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            h2 { text-align:center; }
            .item { padding: 5px 0; border-bottom: 1px dashed #ddd; }
          </style>
        </head>
        <body>
          <h2>KITCHEN ORDER</h2>
          <p><b>Order:</b> ${String(order.id).slice(0, 8).toUpperCase()}</p>
          <p><b>Customer:</b> ${order.customer_name || "Web Customer"}</p>
          <p><b>Time:</b> ${order.created_at ? formatDateTime(order.created_at) : ""}</p>
          <hr/>
          ${(order.items || []).map((item) => `
            <div class="item">
              <b>${item.quantity || item.qty || 1} x ${item.name}</b>
              ${item.variantDetails ? `<br/>${item.variantDetails}` : ""}
              ${item.instructions ? `<br/>Note: ${item.instructions}` : ""}
            </div>
          `).join("")}
          <hr/>
          <p><b>Total:</b> ${peso(order.total || order.subtotal)}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-[#FFF5F7] p-4 sm:p-6 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">Kitchen Display System</p>
            <h1 className="text-2xl font-black tracking-tight">KDS Orders</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {["all", "pending", "accepted", "ready"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`h-9 px-3 rounded-xl text-xs font-black uppercase tracking-wider ${
                  statusFilter === key ? "bg-[#FC687D] text-white" : "bg-white border border-rose-100 text-rose-600"
                }`}
              >
                {key}
              </button>
            ))}
            <button onClick={() => document.documentElement.requestFullscreen?.()} className="h-9 px-3 rounded-xl bg-rose-950 text-white text-xs font-black uppercase tracking-wider">
              Full Screen
            </button>
          </div>
        </header>

        {loading ? (
          <div className="py-24 text-center"><div className="w-9 h-9 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto" /></div>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-white p-12 text-center text-sm font-semibold text-slate-400">
            No active kitchen orders.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleOrders.map((order) => {
              const status = String(order.status || "pending").toLowerCase();
              const minutes = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) : 0;
              return (
                <article key={order.id} className={`rounded-2xl bg-white border p-4 shadow-sm ${minutes > 15 ? "border-red-300" : "border-rose-100"}`}>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-mono text-sm font-black text-slate-900">#{String(order.id).slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs font-semibold text-slate-500">{order.customer_name || "Web Customer"} · {getTimeAgo(order.created_at)}</p>
                    </div>
                    <span className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-1 text-[10px] font-black uppercase text-[#FC687D]">{status}</span>
                  </div>

                  <div className="py-3 space-y-2">
                    {(order.items || []).map((item, idx) => (
                      <div key={item.cartItemId || idx} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <p className="text-sm font-black text-slate-800">{item.quantity || item.qty || 1} x {item.name}</p>
                        {item.variantDetails && <p className="text-xs font-semibold text-slate-500 mt-1">{item.variantDetails}</p>}
                        {item.instructions && <p className="text-xs font-bold text-[#FC687D] mt-1">Note: {item.instructions}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-sm font-black border-t border-slate-100 pt-3">
                    <span>{order.dining_option || "Web Order"}</span>
                    <span>{peso(order.total || order.subtotal)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button onClick={() => printKitchenTicket(order)} className="h-10 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase">Print</button>
                    <button onClick={() => updateStatus(order.id, "accepted")} disabled={status === "accepted" || status === "ready"} className="h-10 rounded-xl bg-amber-50 text-amber-700 text-xs font-black uppercase disabled:opacity-40">Start</button>
                    <button onClick={() => updateStatus(order.id, "ready")} disabled={status === "ready"} className="h-10 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black uppercase disabled:opacity-40">Ready</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
