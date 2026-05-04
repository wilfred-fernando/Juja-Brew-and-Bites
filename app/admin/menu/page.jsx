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
  const [modalTab, setModalTab] = useState("Details");
  const [editingItem, setEditingItem] = useState(null);
  
  // Expanded form state to match your screenshot
  const [form, setForm] = useState({ 
    name: "", 
    category: "", 
    price: "", 
    description: "", 
    image_url: "", 
    is_available: true, 
    is_featured: false 
  });
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
    setModalTab("Details"); // Reset tab to Details when opening
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || "",
        category: item.category || "",
        price: item.price || "",
        description: item.description || "",
        image_url: item.image_url || "",
        is_available: item.is_available !== false, // Defaults to true if null
        is_featured: item.is_featured || false
      });
    } else {
      setEditingItem(null);
      setForm({ 
        name: "", 
        category: categories.length > 0 ? categories[0].name : "", 
        price: "", 
        description: "", 
        image_url: "", 
        is_available: true, 
        is_featured: false 
      });
    }
    setIsModalOpen(true);
  };

  // Save Item
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (editingItem) {
        await supabase.from("menu_items").update(form).eq("id", editingItem.id);
      } else {
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
                <h3 className="font-extrabold text-slate-800 text-[15px] leading-tight pr-2">{item.name}</h3>
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
                <button onClick={() => openModal(item)} className="col-span-1 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-[#FC687D] hover:border-rose-200 hover:bg-rose-50 rounded-xl transition-all flex items-center justify-center gap-1">
                  ✎ Edit
                </button>
                <button className="col-span-1 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                  Disable
                </button>
                <button onClick={() => handleDelete(item.id)} className="col-span-1 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all flex items-center justify-center">
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Card Slot */}
        <button onClick={() => openModal()} className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[24px] h-[360px] flex flex-col items-center justify-center text-slate-400 hover:bg-rose-50 hover:border-rose-200 hover:text-[#FC687D] transition-all group">
          <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">+</span>
          <span className="font-bold text-sm">Add New Item</span>
        </button>
      </div>

      {/* DETAILED ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[24px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-extrabold text-slate-800">{editingItem ? "Edit Item" : "Add New Item"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-2 mb-6">
              <button 
                onClick={() => setModalTab("Details")}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${
                  modalTab === "Details" ? "bg-rose-50 text-[#FC687D]" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                📄 Details
              </button>
              <button 
                onClick={() => setModalTab("Option Groups")}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${
                  modalTab === "Option Groups" ? "bg-rose-50 text-[#FC687D]" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                ⚙️ Option Groups
              </button>
            </div>
            
            {/* Modal Form */}
            {modalTab === "Details" ? (
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-[13px] font-bold text-slate-800 mb-2">Item Name *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm" placeholder="e.g. Chopseuy Tray (Family)" />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-800 mb-2">Price (₱) *</label>
                    <input type="number" step="0.01" required value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-800 mb-2">Category *</label>
                    <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm appearance-none">
                      <option value="">— Select —</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-slate-800 mb-2">Description</label>
                  <textarea rows="3" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm resize-none" placeholder="Group Tray for up to 5 pax" />
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-slate-800 mb-2">Image URL</label>
                  <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm text-slate-500" placeholder="https://media.base44.com/..." />
                </div>

                <div className="flex items-center gap-8 pt-2">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="avail" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="w-5 h-5 rounded accent-[#FC687D]" />
                    <label htmlFor="avail" className="text-sm font-bold text-slate-700 cursor-pointer">Available</label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="feat" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="w-5 h-5 rounded accent-[#FC687D]" />
                    <label htmlFor="feat" className="text-sm font-bold text-slate-700 cursor-pointer">Featured / Must Try</label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 mt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-bold text-sm hover:bg-rose-500 transition-colors shadow-sm disabled:opacity-70">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-12 text-center text-slate-400 font-bold text-sm border-2 border-dashed border-slate-100 rounded-xl">
                Option Groups feature coming soon!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}