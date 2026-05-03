"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATUS_COLORS = {
  Pending: "bg-amber-50 text-amber-600 border-amber-100",
  Confirmed: "bg-blue-50 text-blue-600 border-blue-100",
  Preparing: "bg-purple-50 text-purple-600 border-purple-100",
  Ready: "bg-emerald-50 text-emerald-600 border-emerald-100",
  Delivered: "bg-slate-50 text-slate-500 border-slate-200",
  Cancelled: "bg-rose-50 text-rose-500 border-rose-100",
};

const STATUS_FLOW = ["Pending", "Confirmed", "Preparing", "Ready", "Delivered"];

export default function LiveOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("All");

  const loadOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (!error && data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    const iv = setInterval(loadOrders, 30000);
    return () => clearInterval(iv);
  }, []);

  const updateStatus = async (id, status) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    if (selected?.id === id) setSelected(o => ({ ...o, status }));
  };

  const filtered = filter === "All" ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-10">
      <header className="flex justify-between items-end border-b border-rose-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">Live <span className="text-[#FC687D]">Orders</span></h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-[#FC687D] rounded-full animate-pulse"></span> Auto-refreshes every 30s
          </p>
        </div>
        <button onClick={loadOrders} className="px-5 py-2.5 bg-white border border-rose-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:text-[#FC687D] hover:border-[#FC687D] rounded-full transition shadow-sm flex items-center gap-2">
          <span>↻</span> Refresh
        </button>
      </header>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {["All", "Pending", "Confirmed", "Preparing", "Ready", "Delivered", "Cancelled"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-5 py-2 text-[11px] font-bold uppercase tracking-widest transition-all rounded-full whitespace-nowrap shadow-sm border ${
              filter === s ? "bg-[#FC687D] text-white border-transparent" : "bg-white border-rose-100 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D]"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {filtered.map(order => (
            <div key={order.id} onClick={() => setSelected(order)}
              className="bg-white rounded-3xl border border-rose-50 p-6 shadow-sm hover:shadow-md hover:-translate-y-1 cursor-pointer transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-extrabold text-slate-800 text-lg group-hover:text-[#FC687D] transition-colors">{order.customer_name || "Guest"}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border ${STATUS_COLORS[order.status] || "bg-slate-100 text-slate-500"} rounded-full`}>
                  {order.status}
                </span>
              </div>
              
              <div className="flex justify-between items-center border-t border-rose-50 pt-4 bg-gray-50/50 rounded-2xl px-4 pb-4 mt-2">
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                  {(order.items||[]).length} Item(s) · {order.order_type}
                </p>
                <p className="font-black text-[#FC687D] text-lg">₱{(order.total_amount||0).toLocaleString()}</p>
              </div>

              <div className="mt-4 flex gap-2">
                {STATUS_FLOW.filter((_, i) => i < STATUS_FLOW.indexOf(order.status) + 2 && STATUS_FLOW.indexOf(order.status) >= 0).map(s => (
                  s !== order.status && STATUS_FLOW.indexOf(s) === STATUS_FLOW.indexOf(order.status) + 1 ? (
                    <button key={s} onClick={e => { e.stopPropagation(); updateStatus(order.id, s); }}
                      className="px-5 py-2.5 bg-[#FC687D] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-colors rounded-full shadow-sm">
                      Mark {s}
                    </button>
                  ) : null
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="lg:col-span-2 text-center py-24 bg-white rounded-3xl border border-dashed border-rose-200">
              <div className="text-4xl mb-3 opacity-50">📋</div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No orders {filter !== "All" ? `with status "${filter}"` : "found"}.</p>
            </div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex justify-between items-center mb-6 border-b border-rose-50 pb-4">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Order <span className="text-[#FC687D]">Details</span></h2>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
              </div>
              
              <div className="space-y-4 mb-8 text-sm">
                <div className="flex justify-between"><span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Customer</span><span className="font-extrabold text-slate-800">{selected.customer_name || "Guest"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Phone</span><span className="font-bold text-slate-800">{selected.customer_phone || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Type</span><span className="font-extrabold text-[#FC687D]">{selected.order_type}</span></div>
                {selected.delivery_address && <div><span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Address:</span><p className="text-slate-800 mt-1 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{selected.delivery_address}</p></div>}
                {selected.notes && <div className="bg-amber-50 p-4 mt-2 rounded-xl border border-amber-100"><span className="text-amber-600 text-[10px] font-bold uppercase tracking-widest">Notes:</span><p className="text-amber-800 text-sm mt-1 font-medium">{selected.notes}</p></div>}
              </div>
              
              <div className="border-t border-rose-50 pt-6 mb-8">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Items Ordered</p>
                <div className="space-y-4">
                  {(selected.items || []).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="font-extrabold text-slate-800"><span className="text-[#FC687D]">{item.quantity}×</span> {item.name}</span>
                      <span className="font-bold text-slate-600">₱{((item.price || 0) * (item.quantity || 1)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-xl text-slate-800 mt-6 pt-4 border-t border-rose-50">
                  <span>Total</span>
                  <span className="text-[#FC687D]">₱{(selected.total_amount || 0).toLocaleString()}</span>
                </div>
              </div>
              
              <div className="flex gap-3 flex-wrap">
                {STATUS_FLOW.map((s, i) => (
                  s !== selected.status && i === STATUS_FLOW.indexOf(selected.status) + 1 ? (
                    <button key={s} onClick={() => updateStatus(selected.id, s)}
                      className="flex-1 py-3.5 bg-[#FC687D] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-colors rounded-full shadow-sm">
                      Mark as {s}
                    </button>
                  ) : null
                ))}
                {selected.status !== "Cancelled" && selected.status !== "Delivered" && (
                  <button onClick={() => updateStatus(selected.id, "Cancelled")}
                    className="px-6 py-3.5 bg-white border border-rose-200 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-50 transition-colors rounded-full shadow-sm">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}