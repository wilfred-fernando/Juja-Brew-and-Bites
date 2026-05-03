"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function MenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [activeTab, setActiveTab] = useState("items"); // 'items' or 'categories'
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("sort_order")
    ]);

    if (itemsRes.data) setItems(itemsRes.data);
    if (catsRes.data && catsRes.data.length > 0) {
      setCategories(catsRes.data);
    } else {
      // Fallback unique categories
      const uniqueCats = [...new Set(itemsRes.data?.map(i => i.category) || [])];
      setCategories(uniqueCats.map((name, i) => ({ id: i, name, icon: "☕" })));
    }
    setLoading(false);
  }

  const toggleItemStatus = async (item) => {
    const newStatus = !item.is_available;
    await supabase.from("menu_items").update({ is_available: newStatus }).eq("id", item.id);
    setItems(items.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));
  };

  const deleteItem = async (id) => {
    if (!confirm("Permanently delete this item?")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    setItems(items.filter(i => i.id !== id));
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300">
      
      {/* HEADER */}
      <header className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">Menu Builder</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {items.length} items • {categories.length} categories
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-6 py-2.5 bg-[#FC687D] text-white text-sm font-bold rounded-full hover:bg-rose-500 transition-colors shadow-sm">
            + Add Item
          </button>
          <button className="px-6 py-2.5 bg-white border border-[#FC687D] text-[#FC687D] text-sm font-bold rounded-full hover:bg-rose-50 transition-colors shadow-sm">
            + Add Category
          </button>
        </div>
      </header>

      {/* TABS */}
      <div className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab("items")} 
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === "items" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-gray-500 hover:bg-white/50"
          }`}>
          <span>📋</span> Menu Items
        </button>
        <button onClick={() => setActiveTab("categories")} 
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === "categories" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-gray-500 hover:bg-white/50"
          }`}>
          <span>🏷️</span> Categories
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>
      ) : activeTab === "items" ? (
        <>
          {/* SEARCH & FILTER PILLS */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative w-full md:w-64">
              <span className="absolute left-4 top-2.5 text-gray-400">🔍</span>
              <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} 
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 text-sm rounded-xl focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] shadow-sm" />
            </div>
            
            <div className="flex gap-2 overflow-x-auto hide-scrollbar items-center">
              <button onClick={() => setCatFilter("All")} 
                className={`px-5 py-2 text-sm font-bold rounded-full transition-all border shadow-sm ${
                  catFilter === "All" ? "bg-white text-gray-800 border-gray-300" : "bg-transparent text-gray-500 border-transparent hover:bg-white/50"
                }`}>
                All
              </button>
              {categories.map(cat => (
                <button key={cat.id || cat.name} onClick={() => setCatFilter(cat.name)} 
                  className={`px-5 py-2 text-sm font-bold rounded-full transition-all border shadow-sm flex items-center gap-2 ${
                    catFilter === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}>
                  <span>{cat.icon || "☕"}</span> <span className="uppercase text-xs">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ITEM CARDS GRID */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className={`bg-white rounded-3xl p-3 border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-all ${!item.is_available ? "opacity-60" : ""}`}>
                
                {/* Image Placeholder */}
                <div className="h-40 bg-gray-100 rounded-2xl mb-4 overflow-hidden relative">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl bg-rose-50">☕</div>
                  )}
                </div>
                
                {/* Content */}
                <div className="px-2 flex-1">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="font-extrabold text-slate-800 text-[15px] leading-tight">{item.name}</h3>
                    <span className="font-extrabold text-[#FC687D] text-[15px]">₱{item.price}</span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{item.category}</p>
                  
                  {/* Status Pill */}
                  <div className="mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${
                      item.is_available ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${item.is_available ? "bg-emerald-500" : "bg-gray-400"}`}></span>
                      {item.is_available ? "Available" : "Disabled"}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex gap-2 mt-auto">
                  <button className="flex-1 py-2.5 bg-[#F3F4F6] text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                    <span>✏️</span> Edit
                  </button>
                  <button onClick={() => toggleItemStatus(item)} className="flex-1 py-2.5 bg-[#F3F4F6] text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors">
                    {item.is_available ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="w-11 bg-[#F3F4F6] text-gray-400 text-sm font-bold rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors flex items-center justify-center">
                    🗑️
                  </button>
                </div>

              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-gray-500">Categories management view coming soon...</div>
      )}
    </div>
  );
}