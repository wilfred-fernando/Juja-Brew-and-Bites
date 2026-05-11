"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function MenuBuilderPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    fetchMenuData();
  }, []);

  async function fetchMenuData() {
    setLoading(true);
    const [itemRes, catRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("sort_order"),
    ]);

    if (itemRes.data) setItems(itemRes.data);
    if (catRes.data) setCategories(catRes.data);
    setLoading(false);
  }

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-rose-100 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Menu Builder</h1>
          <p className="text-sm text-slate-400 font-medium">Manage your products and pricing</p>
        </div>
        <button className="bg-[#FC687D] text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-rose-100 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
          <span>+</span> Add New Item
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-2 rounded-[28px] border border-rose-50 shadow-sm flex flex-col md:flex-row gap-2">
        <div className="flex-1 flex gap-2 overflow-x-auto p-1 hide-scrollbar">
          {["All", ...categories.map(c => c.name)].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-slate-900 text-white shadow-md"
                  : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="md:w-64 relative px-1">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-100 outline-none transition-all"
          />
        </div>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="group bg-white p-6 rounded-[32px] border border-rose-50 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-500/5 transition-all duration-300 relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${item.is_available ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-300'}`}>
                {item.is_available ? "✨" : "💤"}
              </div>
              <div className="flex gap-1">
                <button className="p-2 text-slate-300 hover:text-blue-500 transition-colors">✎</button>
                <button className="p-2 text-slate-300 hover:text-rose-500 transition-colors">✕</button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FC687D]">
                {item.category}
              </p>
              <h3 className="text-lg font-bold text-slate-800 truncate">{item.name}</h3>
              <div className="flex items-center justify-between pt-4">
                <span className="text-xl font-black text-slate-900">₱{Number(item.price).toFixed(0)}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${item.is_available ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {item.is_available ? 'In Stock' : 'Sold Out'}
                </span>
              </div>
            </div>
            
            {/* Hover Decor */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-rose-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-rose-100">
          <p className="text-slate-400 font-medium">No items found in this category.</p>
        </div>
      )}
    </div>
  );
}