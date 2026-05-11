"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function OpenTicketsAdmin() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTickets(); }, []);

  async function fetchTickets() {
    setLoading(true);
    const { data } = await supabase.from("open_tickets").select("*, loyalty_members(name)").order("created_at");
    if (data) setTickets(data);
    setLoading(false);
  }

  async function deleteTicket(id) {
    if(confirm("Discard this ticket permanently?")) {
      await supabase.from("open_tickets").delete().eq("id", id);
      fetchTickets();
    }
  }

  if (loading) return <div className="p-20 text-center font-black uppercase text-slate-200 tracking-widest">Retrieving Tickets...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto bg-[#FDFDFD] min-h-screen">
      <header className="mb-12">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Open Tickets</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FC687D] mt-2">Active Parked Orders</p>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-50 shadow-[0_20px_50px_rgba(0,0,0,0.02)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Ticket / Customer</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Time</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/50 transition-all">
                <td className="px-8 py-6">
                  <span className="font-bold text-slate-700 text-sm">{t.ticket_name || t.loyalty_members?.name || "Unnamed Ticket"}</span>
                  <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">{t.order_type}</p>
                </td>
                <td className="px-8 py-6 text-xs text-slate-400 font-medium">
                  {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-8 py-6 font-black text-slate-800 text-sm">₱{t.total_amount.toFixed(0)}</td>
                <td className="px-8 py-6 text-right">
                  <button onClick={() => deleteTicket(t.id)} className="text-[10px] font-black text-red-300 hover:text-red-500 uppercase tracking-widest">Discard</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}