"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function POSAdminDashboard() {
  const [salesData, setSalesData] = useState({ total: 0, count: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    setLoading(true);
    try {
      // Get the timestamp for the start of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetching from open_tickets based on your latest process
      const { data, error } = await supabase
        .from("open_tickets")
        .select(`
          id, 
          created_at, 
          total_amount, 
          order_type, 
          ticket_name
        `)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false }); // FIX: Used underscore to prevent 400 error

      if (error) throw error;

      if (data) {
        const total = data.reduce((sum, order) => sum + Number(order.total_amount), 0);
        setSalesData({ total, count: data.length });
        setRecentOrders(data);
      }
    } catch (err) {
      console.error("Admin Fetch Error:", err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-8 font-sans">
      {/* HEADER */}
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">POS Management</h1>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mt-2">Global Operations • Terminal 01</p>
        </div>
        <button 
          onClick={fetchAdminData}
          className="px-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-white transition-all shadow-sm active:scale-95"
        >
          Refresh Data
        </button>
      </header>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FC687D] mb-2">Today's Revenue</p>
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter">₱{salesData.total.toLocaleString()}</h2>
        </div>
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Transactions</p>
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter">{salesData.count} <span className="text-sm font-bold text-slate-300">orders</span></h2>
        </div>
        <div className="bg-[#FC687D] p-8 rounded-[32px] shadow-xl shadow-rose-100">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-2">Active Register</p>
          <h2 className="text-xl font-bold text-white tracking-tight">Shift: Wilfred Fernando</h2>
          <p className="text-[10px] font-bold text-white/80 mt-1 uppercase tracking-tighter">Open since 08:30 AM</p>
        </div>
      </div>

      {/* RECENT TRANSACTIONS TABLE */}
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm">Recent Transactions</h3>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest underline cursor-pointer hover:text-[#FC687D] transition-colors">View All Report</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Order ID</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Time</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Customer Label</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-24 text-center text-slate-300 font-bold uppercase tracking-[0.3em] text-[10px]">
                    No transactions found for today
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                    <td className="px-8 py-6 font-bold text-slate-400 text-xs tracking-tighter">
                      #{order.id.toString().slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-500 font-medium">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-8 py-6 text-sm font-black text-slate-800">
                      {order.ticket_name || "Guest Order"}
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {order.order_type}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right font-black text-slate-800 text-sm">
                      ₱{Number(order.total_amount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}