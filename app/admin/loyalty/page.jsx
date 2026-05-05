"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function LoyaltyAdminPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  
  const [form, setForm] = useState({ 
    customer_name: "", phone: "", points_balance: 0, total_visits: 0, note: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

async function fetchMembers() {
    setLoading(true);
    const { data, error } = await supabase.from("loyalty_members").select("*");

    if (error) {
      alert("Error: " + error.message);
    } else if (data) {
      
      // 🔴 ADD THIS LINE RIGHT HERE:
      console.log("SUPABASE DATA:", data[0]); 

      const sortedData = data.sort((a, b) => 
        (parseFloat(b.points_balance) || 0) - (parseFloat(a.points_balance) || 0)
      );
      setMembers(sortedData);
    }
    setLoading(false);
  }

  const openModal = (member) => {
    setEditingMember(member);
    setForm({
      customer_name: member.customer_name || "",
      phone: member.phone || "",
      points_balance: member.points_balance || 0,
      total_visits: member.total_visits || 0,
      note: member.note || ""
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supabase.from("loyalty_members").update(form).eq("id", editingMember.id);
      await fetchMembers(); 
      setIsModalOpen(false);
    } catch (error) { 
      alert("Error saving member: " + error.message); 
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this member? This cannot be undone.")) return;
    await supabase.from("loyalty_members").delete().eq("id", id);
    fetchMembers();
  };

  // Filter by name, code, or phone
  const filteredMembers = members.filter(m => 
    (m.customer_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (m.customer_code?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (m.phone || "").includes(search)
  );

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div 
      className="max-w-5xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8"
      style={{ fontFamily: "'Abadi', sans-serif" }}
    >
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 mb-6 md:mb-8 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-800 tracking-tight leading-none">Juja Rewards</h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium mt-1 md:mt-2">
            Managing {members.length} loyal customers
          </p>
        </div>
      </header>

      {/* SEARCH BAR (Full Width) */}
      <div className="relative mb-6 md:mb-8">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input 
          type="text" placeholder="Search by name, ID, or phone..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 md:py-3.5 bg-white border border-slate-100 rounded-xl md:rounded-2xl text-xs md:text-sm font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm"
        />
      </div>

      {/* LUXURY LIST AREA */}
      <div className="flex flex-col gap-3 md:gap-4">
        {filteredMembers.map(member => (
          <div key={member.id} className="bg-white rounded-xl md:rounded-[20px] border border-rose-50 shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all duration-300 group cursor-default">
            
            {/* Customer Info */}
            <div className="flex items-center gap-4 md:gap-5 flex-1">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-rose-50 to-[#FFF9FA] flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-rose-100/50">
                <span className="text-xl md:text-2xl text-[#FC687D] opacity-80">👤</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black text-slate-800 text-sm md:text-base leading-tight truncate">{member.customer_name || "Unknown Member"}</h3>
                  {member.points_balance >= 500 && (
                     <span className="bg-[#FFF9FA] text-[#FC687D] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-rose-100">VIP</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-slate-500 text-[10px] md:text-xs bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{member.customer_code}</span>
                  <span className="text-slate-300 text-[10px]">•</span>
                  <span className="text-[10px] md:text-xs font-semibold text-slate-500">{member.phone || "No phone"}</span>
                </div>
              </div>
            </div>
            
            {/* Stats & Actions */}
            <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 md:gap-8 pt-3 md:pt-0 border-t md:border-none border-slate-50">
              
              <div className="flex gap-4 md:gap-6">
                <div className="text-center md:text-right">
                  <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Points</p>
                  <p className="text-[#FC687D] font-black text-base md:text-lg leading-none">{parseFloat(member.points_balance).toFixed(0)}</p>
                </div>
                <div className="w-px bg-slate-100 hidden md:block"></div>
                <div className="text-center md:text-right">
                  <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Visits</p>
                  <p className="text-slate-700 font-black text-base md:text-lg leading-none">{member.total_visits}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 md:gap-2">
                <button onClick={() => openModal(member)} className="px-3 md:px-4 py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-black text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 hover:border-rose-100 rounded-lg md:rounded-xl transition-all active:scale-95">
                  Adjust
                </button>
                <button onClick={() => handleDelete(member.id)} className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-slate-50 border border-slate-100 text-[10px] md:text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-lg md:rounded-xl transition-all active:scale-90 md:opacity-0 md:group-hover:opacity-100">
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {filteredMembers.length === 0 && (
          <div className="text-center py-12 md:py-20 text-slate-400 font-black uppercase tracking-[0.15em] text-[10px] md:text-xs border border-dashed border-slate-200/60 rounded-xl md:rounded-2xl bg-white/50">
            No members found
          </div>
        )}
      </div>

      {/* LUXURY EDIT MODAL */}
      {isModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-t-[24px] md:rounded-[28px] p-5 md:p-8 shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto hide-scrollbar" onClick={e => e.stopPropagation()}>
            
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />

            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Adjust Member</h3>
                <p className="font-mono text-[10px] font-bold text-slate-400 mt-1">{editingMember.customer_code}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 md:space-y-5">
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Full Name</label>
                <input type="text" required value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Phone Number</label>
                <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
              </div>
              
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-[#FFF9FA] p-3 md:p-4 rounded-xl border border-rose-100">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#FC687D] mb-2">Points Balance</label>
                  <input type="number" step="0.1" required value={form.points_balance} onChange={e => setForm({...form, points_balance: e.target.value})} className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm font-black text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all text-center" />
                </div>
                <div className="bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Visits</label>
                  <input type="number" required value={form.total_visits} onChange={e => setForm({...form, total_visits: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-black text-slate-800 focus:outline-none focus:border-slate-400 transition-all text-center" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Admin Notes / Birthday</label>
                <textarea rows="2" value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all resize-none" placeholder="e.g. Birthday: 1995-12-25" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 md:pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3.5 rounded-xl bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-50 transition-all active:scale-95">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-rose-500 transition-all shadow-sm disabled:opacity-70 active:scale-95">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}