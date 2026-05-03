"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({ 
    code: "", 
    discount: "", 
    type: "percent", 
    min_order: "", 
    active: true 
  });

  // Fetch promos on load
  useEffect(() => {
    fetchPromos();
  }, []);

  async function fetchPromos() {
    setLoading(true);
    // Assuming you have a 'promo_codes' table. If not, this acts as a placeholder!
    const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    if (!error && data) {
      setPromos(data);
    } else {
      // Fallback dummy data if table doesn't exist yet
      setPromos([
        { id: 1, code: "JUJA10", discount: 10, type: "percent", min_order: 0, active: true },
        { id: 2, code: "WELCOME50", discount: 50, type: "fixed", min_order: 200, active: true },
      ]);
    }
    setLoading(false);
  }

  const handleAddPromo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    const newPromo = {
      code: form.code.toUpperCase(),
      discount: parseFloat(form.discount),
      type: form.type,
      min_order: parseFloat(form.min_order) || 0,
      active: true
    };

    // Try to insert into Supabase
    const { data, error } = await supabase.from("promo_codes").insert([newPromo]).select();
    
    if (!error && data) {
      setPromos([data[0], ...promos]);
    } else {
      // If table missing, just update UI state for now
      setPromos([{ ...newPromo, id: Date.now() }, ...promos]);
    }

    setForm({ code: "", discount: "", type: "percent", min_order: "", active: true });
    setAdding(false);
    setSubmitting(false);
  };

  const togglePromo = async (id, currentStatus) => {
    // Optimistic UI update
    setPromos(promos.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
    await supabase.from("promo_codes").update({ active: !currentStatus }).eq("id", id);
  };

  const deletePromo = async (id) => {
    if (!confirm("Delete this promo code permanently?")) return;
    setPromos(promos.filter(p => p.id !== id));
    await supabase.from("promo_codes").delete().eq("id", id);
  };

  return (
    <div className="max-w-6xl mx-auto font-mono pb-20">
      
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
            Promo <span className="text-[#1EBBA3] font-light tracking-widest">Codes</span>
          </h1>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mt-2">
            Manage Discounts & Offers
          </p>
        </div>
        <button 
          onClick={() => setAdding(true)} 
          className="px-6 py-3 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#1EBBA3] hover:shadow-[8px_8px_0px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-none"
        >
          + Create Promo
        </button>
      </header>

      {/* Promos List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-none"></div>
          </div>
        ) : promos.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-gray-300 bg-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No promo codes active.</p>
          </div>
        ) : (
          promos.map((promo) => (
            <div key={promo.id} className={`bg-white border border-gray-200 p-6 flex flex-col md:flex-row items-start md:items-center gap-6 transition-all duration-300 rounded-none hover:border-[#1A1A1A] ${!promo.active ? "opacity-60 bg-gray-50" : ""}`}>
              
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-bold text-[#1A1A1A] text-2xl uppercase tracking-tighter">{promo.code}</span>
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-none border ${promo.active ? "bg-[#1EBBA3]/10 text-[#159a85] border-[#1EBBA3]/20" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                    {promo.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                  <span className="text-[#1A1A1A]">
                    {promo.type === "percent" ? `${promo.discount}% OFF` : `₱${promo.discount} OFF`}
                  </span>
                  {promo.min_order > 0 && (
                    <>
                      <span className="w-1 h-1 bg-gray-300 rounded-none"></span>
                      <span>Min. ₱{promo.min_order}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto border-t md:border-t-0 border-gray-100 pt-4 md:pt-0">
                <button 
                  onClick={() => togglePromo(promo.id, promo.active)} 
                  className="flex-1 md:flex-none px-4 py-2 border border-gray-200 text-[#1A1A1A] text-[10px] font-bold uppercase tracking-widest hover:border-[#1EBBA3] hover:text-[#1EBBA3] transition-colors rounded-none bg-white"
                >
                  {promo.active ? "Disable" : "Enable"}
                </button>
                <button 
                  onClick={() => deletePromo(promo.id)} 
                  className="px-4 py-2 border border-red-100 bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors rounded-none"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Promo Modal */}
      {adding && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-lg rounded-none border-t-4 border-[#1EBBA3] animate-in zoom-in-95 duration-200">
            
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold uppercase tracking-tighter text-[#1A1A1A]">New <span className="text-[#1EBBA3]">Promo</span></h2>
              <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-[#1A1A1A] transition-colors text-2xl font-light">×</button>
            </div>

            <form onSubmit={handleAddPromo} className="p-8 space-y-6">
              
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Discount Code *</label>
                <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-none px-4 py-3 text-[#1A1A1A] text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#1EBBA3] focus:bg-white transition-all" 
                  placeholder="E.G. SUMMER20" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Type</label>
                  <div className="relative">
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                      className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-none px-4 py-3 text-[#1A1A1A] text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-[#1EBBA3] focus:bg-white transition-all cursor-pointer">
                      <option value="percent">Percent (%)</option>
                      <option value="fixed">Fixed (₱)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#1EBBA3]">▼</div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Amount *</label>
                  <input required type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-none px-4 py-3 text-[#1A1A1A] text-sm font-bold focus:outline-none focus:border-[#1EBBA3] focus:bg-white transition-all" 
                    placeholder={form.type === 'percent' ? "10" : "150"} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Min. Order Requirement (₱)</label>
                <input type="number" min="0" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-none px-4 py-3 text-[#1A1A1A] text-sm font-bold focus:outline-none focus:border-[#1EBBA3] focus:bg-white transition-all" 
                  placeholder="0 = No Minimum" />
              </div>

              <div className="pt-6 mt-6 border-t border-gray-100 flex gap-4">
                <button type="button" onClick={() => setAdding(false)} 
                  className="flex-1 py-4 border border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors rounded-none bg-white">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} 
                  className="flex-1 py-4 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors rounded-none disabled:opacity-50">
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