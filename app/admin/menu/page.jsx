"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: "", category: "", price: "", image_url: "", is_available: true });
  const [saving, setSaving] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [itemRes, catRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("sort_order")
    ]);
    
    if (itemRes.data) setItems(itemRes.data);
    if (catRes.data) setCategories(catRes.data);
    setLoading(false);
  }

  // Open modal to add or edit
  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setForm(item);
    } else {
      setEditingItem(null);
      setForm({ name: "", category: categories[0]?.name || "", price: "", image_url: "", is_available: true });
    }
    setIsModalOpen(true);
  };

  // Save Item
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (editingItem) {
        // Update existing
        await supabase.from("menu_items").update(form).eq("id", editingItem.id);
      } else {
        // Insert new
        await supabase.from("menu_items").insert([form]);
      }
      await fetchData(); // Refresh the list
      setIsModalOpen(false);
    } catch (error) {
      alert("Error saving item: " + error.message);
    }
    setSaving(false);
  };

  // Delete Item
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    fetchData();
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">Loading menu...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-20">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-[32px] font-extrabold text-slate-800 tracking-tight leading-none">Menu Builder</h1>
          <p className="text-slate-400 text-[13px] font-medium mt-2">
            {items.length} items • {categories.length} categories
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => openModal()} className="px-6 py-2.5 bg-[#FC687D] text-white text-sm font-bold rounded-full hover:bg-rose-500 transition-colors shadow-sm">
            + Add Item
          </button>
          <button className="px-6 py-2.5 bg-white border border-rose-200 text-[#FC687D] text-sm font-bold rounded-full hover:bg-rose-50 transition-colors shadow-sm">
            + Add Category
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Search items..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
          <button 
            onClick={() => setCatFilter("All")}
            className={`px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all shadow-sm border ${
              catFilter === "All" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            ALL
          </button>
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setCatFilter(cat.name)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all shadow-sm border ${
                catFilter === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="text-base">{cat.icon}</span> {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* GRID LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredItems.map(item => (
          <div key={item.id} className="bg-white rounded-[24px] border border-rose-50 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all">
            {/* Image Placeholder */}
            <div className="h-48 bg-slate-50 flex items-center justify-center relative overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl text-slate-200">📷</span>
              )}
            </div>
            
            {/* Content */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-extrabold text-slate-800 text-[15px]">{item.name}</h3>
                <span className="font-black text-[#FC687D]">₱{item.price}</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">{item.category}</p>
              
              {/* Status */}
              <div className="mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border inline-flex items-center gap-1.5 ${
                  item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? "bg-emerald-500" : "bg-slate-300"}`}></span>
                  {item.is_available ? "Available" : "Disabled"}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="mt-auto pt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
                <button onClick={() => openModal(item)} className="col-span-1 py-2 text-xs font-bold text-slate-500 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-1">
                  ✎ Edit
                </button>
                <button className="col-span-1 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors">
                  Disable
                </button>
                <button onClick={() => handleDelete(item.id)} className="col-span-1 py-2 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center">
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Card Slot */}
        <button onClick={() => openModal()} className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[24px] h-[340px] flex flex-col items-center justify-center text-slate-400 hover:bg-rose-50 hover:border-rose-200 hover:text-[#FC687D] transition-all group">
          <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">+</span>
          <span className="font-bold text-sm">Add New Item</span>
        </button>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-extrabold text-slate-800 mb-6">{editingItem ? "Edit Item" : "Add New Item"}</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Item Name</label>
                <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D]" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Category</label>
                  <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] appearance-none">
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Price (₱)</label>
                  <input type="number" step="0.01" required value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D]" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Image URL (Optional)</label>
                <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D]" placeholder="https://..." />
              </div>

              <div className="flex items-center gap-3 py-2">
                <input type="checkbox" id="avail" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="w-5 h-5 accent-[#FC687D]" />
                <label htmlFor="avail" className="text-sm font-bold text-slate-800">Item is Available</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 rounded-full bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-4 rounded-full bg-[#FC687D] text-white font-bold text-xs hover:bg-rose-500">{saving ? "Saving..." : "Save Item"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}