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
  
  // Expanded form state
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
    setModalTab("Details"); 
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || "",
        category: item.category || "",
        price: item.price || "",
        description: item.description || "",
        image_url: item.image_url || "",
        is_available: item.is_available !== false,
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
      await fetchData(); 
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

      {/* MAIN CONTENT: SIDEBAR + LIST */}
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* LEFT SIDEBAR (Vertical Filters) */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-6">
          
          {/* Search */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search items..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm"
            />
          </div>
          
          {/* Vertical Categories List */}
          <div className="bg-white p-3 rounded-[24px] border border-slate-100 shadow-sm flex flex-col gap-1">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-2 pb-3">Categories</h3>
            
            <button 
              onClick={() => setCatFilter("All")}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                catFilter === "All" ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span>All Items</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>
            
            {categories.map(cat => {
              const catCount = items.filter(i => i.category === cat.name).length;
              return (
                <button 
                  key={cat.id}
                  onClick={() => setCatFilter(cat.name)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                    catFilter === cat.name ? "bg-[#FC687D] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{cat.icon}</span> 
                    <span className="truncate max-w-[130px] text-left">{cat.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] flex-shrink-0 ${catFilter === cat.name ? "bg-white/20" : "bg-slate-100"}`}>
                    {catCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT AREA (Items List) */}
        <div className="flex-1 flex flex-col gap-4">
          
          {/* Add New Item Button Slot */}
          <button onClick={() => openModal()} className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[20px] p-4 flex items-center justify-center gap-3 text-slate-400 hover:bg-rose-50 hover:border-rose-200 hover:text-[#FC687D] transition-all group shadow-sm">
            <span className="text-2xl leading-none group-hover:scale-110 transition-transform">+</span>
            <span className="font-bold text-sm">Add New Item</span>
          </button>

          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-[20px] border border-rose-50 shadow-sm p-4 pr-6 flex items-center justify-between hover:shadow-md transition-all group">
              
              {/* Image & Info */}
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-slate-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl text-slate-200">📷</span>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-[15px] mb-1">{item.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-[#FC687D] text-sm">₱{item.price}</span>
                    <span className="text-slate-300 text-xs">•</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.category}</span>
                  </div>
                </div>
              </div>
              
              {/* Status & Actions */}
              <div className="flex items-center gap-8">
                <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border flex items-center gap-1.5 ${
                  item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? "bg-emerald-500" : "bg-slate-300"}`}></span>
                  {item.is_available ? "Available" : "Disabled"}
                </span>

                {/* Action Buttons (Visible on Hover) */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(item)} className="px-4 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-[#FC687D] hover:border-rose-200 hover:bg-rose-50 rounded-xl transition-all">
                    ✎ Edit
                  </button>
                  <button className="px-4 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                    Disable
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all">
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-sm border-2 border-dashed border-slate-100 rounded-[24px]">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* DETAILED ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[24px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-extrabold text-slate-800">{editingItem ? "Edit Item" : "Add New Item"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-xl">
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-2 mb-6 bg-rose-50/30 p-1.5 rounded-2xl w-fit border border-rose-50">
              <button 
                onClick={() => setModalTab("Details")}
                className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                  modalTab === "Details" ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="opacity-70">📄</span> Details
              </button>
              <button 
                onClick={() => setModalTab("Option Groups")}
                className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                  modalTab === "Option Groups" ? "bg-white text-[#FC687D] shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="opacity-70">⚙️</span> Option Groups
              </button>
            </div>
            
            {/* Modal Form Content */}
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
                    <input type="checkbox" id="avail" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="w-5 h-5 rounded accent-[#FC687D] cursor-pointer" />
                    <label htmlFor="avail" className="text-sm font-bold text-slate-700 cursor-pointer">Available</label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="feat" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="w-5 h-5 rounded accent-[#FC687D] cursor-pointer" />
                    <label htmlFor="feat" className="text-sm font-bold text-slate-700 cursor-pointer">Featured / Must Try</label>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="grid grid-cols-2 gap-4 pt-6 mt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors border border-slate-200">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-bold text-sm hover:bg-rose-500 transition-colors shadow-sm disabled:opacity-70">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            ) : (
              /* Option Groups Tab */
              <div className="flex flex-col h-full animate-in fade-in duration-300">
                <p className="text-[14px] text-slate-500 mb-6 font-medium">
                  Add option groups like size, flavor, or add-ons that customers can choose from.
                </p>
                
                <button 
                  type="button"
                  className="w-full py-4 border-2 border-dashed border-rose-300 text-[#FC687D] font-bold text-sm rounded-2xl hover:bg-rose-50 transition-colors mb-6"
                >
                  + Add Option Group
                </button>

                <div className="grid grid-cols-2 gap-4 pt-6 mt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors border border-slate-200">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-bold text-sm hover:bg-rose-500 transition-colors shadow-sm disabled:opacity-70">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}