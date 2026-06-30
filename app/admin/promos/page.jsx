"use client";

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

function mapPromo(row) {
  return {
    ...row,
    discount: Number(row.discount_value ?? row.discount ?? 0),
    type: row.discount_type || row.type || "fixed",
    min_order: Number(row.min_order || 0),
    active: row.is_active ?? row.active ?? true,
  };
}

function promoValueLabel(promo) {
  const discount = Number(promo.discount || 0);
  if (discount <= 0) return "Public promo";
  return promo.type === "percent" ? `${discount}% OFF` : `PHP ${discount.toLocaleString("en-PH")} OFF`;
}

export default function AdminPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", description: "", discount: "", type: "percent", min_order: "", active: true });

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    const { data, error } = await supabase.from("promotions").select("*").order("created_at", { ascending: false });
    if (!error && data) setPromos(data.map(mapPromo));
    else setPromos([]);
    setLoading(false);
  }

  const handleAddPromo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const newPromo = {
      code: form.code.toUpperCase(),
      title: form.title.trim() || form.code.toUpperCase(),
      description: form.description.trim(),
      discount_type: form.type,
      discount_value: parseFloat(form.discount) || 0,
      min_order: parseFloat(form.min_order) || 0,
      is_active: true,
    };
    const { data, error } = await supabase.from("promotions").insert([newPromo]).select();
    if (!error && data) setPromos([mapPromo(data[0]), ...promos]);
    setForm({ code: "", title: "", description: "", discount: "", type: "percent", min_order: "", active: true });
    setAdding(false);
    setSubmitting(false);
  };

  const togglePromo = async (id, currentStatus) => {
    setPromos(promos.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
    await supabase.from("promotions").update({ is_active: !currentStatus }).eq("id", id);
  };

  const deletePromo = async (id) => {
    if (!confirm("Delete this promo code permanently?")) return;
    setPromos(promos.filter(p => p.id !== id));
    await supabase.from("promotions").delete().eq("id", id);
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-in fade-in duration-300">
      
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            Promo <span className="text-slate-700">Codes</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Manage Discounts & Offers</p>
        </div>
        <button onClick={() => setAdding(true)} className="px-6 py-3 bg-slate-400/78 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-slate-300 transition-colors rounded-full shadow-sm">
          + Create Promo
        </button>
      </header>

      <div className="space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full"></div></div>
        ) : promos.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-sky-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">No promo codes active.</p>
          </div>
        ) : (
          promos.map((promo) => (
            <div key={promo.id} className={`bg-white border border-sky-50 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm hover:shadow-md transition-all ${!promo.active ? "opacity-60 bg-gray-50" : ""}`}>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-extrabold text-slate-800 text-2xl uppercase tracking-tight">{promo.title || promo.code}</span>
                  <span className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${promo.active ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {promo.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mb-3 text-xs font-semibold leading-5 text-slate-500">{promo.description || promo.code}</p>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-slate-700">{promoValueLabel(promo)}</span>
                  {promo.min_order > 0 && <><span className="w-1.5 h-1.5 bg-sky-200 rounded-full"></span><span>Min. PHP {promo.min_order}</span></>}
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto pt-4 md:pt-0">
                <button onClick={() => togglePromo(promo.id, promo.active)} className="flex-1 md:flex-none px-5 py-2.5 bg-slate-50 border border-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:border-sky-500 hover:text-slate-700 hover:bg-sky-50 transition-colors rounded-full">
                  {promo.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => deletePromo(promo.id)} className="px-5 py-2.5 border border-slate-200 bg-white text-sky-500 text-[10px] font-bold uppercase tracking-widest hover:bg-sky-50 transition-colors rounded-full">
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
            <div className="p-8 border-b border-sky-50 flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-800">New <span className="text-slate-700">Promo</span></h2>
              <button onClick={() => setAdding(false)} className="text-slate-500 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
            </div>
            <form onSubmit={handleAddPromo} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Discount Code *</label>
                <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="E.G. SUMMER20" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Promo Title</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="Welcome Voucher" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Public Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="min-h-24 w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-semibold leading-6 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="Describe the promo shown on the public promo page." />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (₱)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Amount *</label>
                  <input required type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder={form.type === 'percent' ? "10" : "150"} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Min. Order Requirement (₱)</label>
                <input type="number" min="0" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="0 = No Minimum" />
              </div>
              <div className="pt-6 mt-6 border-t border-sky-50 flex gap-4">
                <button type="button" onClick={() => setAdding(false)} className="flex-1 py-4 border border-slate-200 bg-white text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:border-sky-500 hover:text-slate-700 hover:bg-sky-50 transition-colors rounded-full">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-4 bg-slate-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-sky-500 transition-colors rounded-full shadow-sm disabled:opacity-50">
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
