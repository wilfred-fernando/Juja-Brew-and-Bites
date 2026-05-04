"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export default function AdminPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ code: "", discount: "", type: "percent", min_order: "", active: true });

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    if (!error && data) setPromos(data);
    else setPromos([{ id: 1, code: "JUJA10", discount: 10, type: "percent", min_order: 0, active: true }]);
    setLoading(false);
  }

  const handleAddPromo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const newPromo = { code: form.code.toUpperCase(), discount: parseFloat(form.discount), type: form.type, min_order: parseFloat(form.min_order) || 0, active: true };
    const { data, error } = await supabase.from("promo_codes").insert([newPromo]).select();
    if (!error && data) setPromos([data[0], ...promos]);
    else setPromos([{ ...newPromo, id: Date.now() }, ...promos]);
    setForm({ code: "", discount: "", type: "percent", min_order: "", active: true });
    setAdding(false);
    setSubmitting(false);
  };

  const togglePromo = async (id, currentStatus) => {
    setPromos(promos.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
    await supabase.from("promo_codes").update({ active: !currentStatus }).eq("id", id);
  };

  const deletePromo = async (id) => {
    if (!confirm("Delete this promo code permanently?")) return;
    setPromos(promos.filter(p => p.id !== id));
    await supabase.from("promo_codes").delete().eq("id", id);
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-in fade-in duration-300">
      
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-rose-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            Promo <span className="text-[#FC687D]">Codes</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Manage Discounts & Offers</p>
        </div>
        <button onClick={() => setAdding(true)} className="px-6 py-3 bg-[#FC687D] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-colors rounded-full shadow-sm">
          + Create Promo
        </button>
      </header>

      <div className="space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>
        ) : promos.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-rose-200">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No promo codes active.</p>
          </div>
        ) : (
          promos.map((promo) => (
            <div key={promo.id} className={`bg-white border border-rose-50 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm hover:shadow-md transition-all ${!promo.active ? "opacity-60 bg-gray-50" : ""}`}>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-extrabold text-slate-800 text-2xl uppercase tracking-tight">{promo.code}</span>
                  <span className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${promo.active ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {promo.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-[#FC687D]">{promo.type === "percent" ? `${promo.discount}% OFF` : `₱${promo.discount} OFF`}</span>
                  {promo.min_order > 0 && <><span className="w-1.5 h-1.5 bg-rose-200 rounded-full"></span><span>Min. ₱{promo.min_order}</span></>}
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto pt-4 md:pt-0">
                <button onClick={() => togglePromo(promo.id, promo.active)} className="flex-1 md:flex-none px-5 py-2.5 bg-slate-50 border border-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-colors rounded-full">
                  {promo.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => deletePromo(promo.id)} className="px-5 py-2.5 border border-rose-100 bg-white text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-50 transition-colors rounded-full">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-lg rounded-3xl animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-rose-50 flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-800">New <span className="text-[#FC687D]">Promo</span></h2>
              <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
            </div>
            <form onSubmit={handleAddPromo} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Discount Code *</label>
                <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all" placeholder="E.G. SUMMER20" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (₱)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Amount *</label>
                  <input required type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all" placeholder={form.type === 'percent' ? "10" : "150"} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Min. Order Requirement (₱)</label>
                <input type="number" min="0" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all" placeholder="0 = No Minimum" />
              </div>
              <div className="pt-6 mt-6 border-t border-rose-50 flex gap-4">
                <button type="button" onClick={() => setAdding(false)} className="flex-1 py-4 border border-slate-200 bg-white text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-colors rounded-full">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-4 bg-[#FC687D] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-colors rounded-full shadow-sm disabled:opacity-50">
                  {submitting ? "Saving..." : "Create Promo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}