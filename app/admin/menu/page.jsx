"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("Details");
  const [editingItem, setEditingItem] = useState(null);
  
  const [form, setForm] = useState({ 
    name: "", category: "", price: "", description: "", 
    image_url: "", is_available: true, is_featured: false 
  });
  const [saving, setSaving] = useState(false);

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

  const openModal = (item = null) => {
    setModalTab("Details"); 
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || "", category: item.category || "", price: item.price || "",
        description: item.description || "", image_url: item.image_url || "",
        is_available: item.is_available !== false, is_featured: item.is_featured || false
      });
    } else {
      setEditingItem(null);
      setForm({ 
        name: "", category: categories.length > 0 ? categories[0].name : "", 
        price: "", description: "", image_url: "", is_available: true, is_featured: false 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingItem) await supabase.from("menu_items").update(form).eq("id", editingItem.id);
      else await supabase.from("menu_items").insert([form]);
      await fetchData(); 
      setIsModalOpen(false);
    } catch (error) { alert("Error saving item: " + error.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    fetchData();
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 px-4 md:px-8">
      
      {/* HEADER: Adapts to stack on mobile, inline on desktop */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pt-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight leading-none">Menu Builder</h1>
          <p className="text-slate-400 text-sm font-medium mt-2">
            {items.length} exquisite items • {categories.length} categories
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          <button onClick={() => openModal()} className="flex-1 md:flex-none px-6 py-3.5 bg-[#FC687D] text-white text-sm font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:shadow-[0_12px_25px_rgba(252,104,125,0.35)] hover:-translate-y-0.5 active:scale-95">
            + Add Item
          </button>
          <button className="flex-1 md:flex-none px-6 py-3.5 bg-white border border-rose-100 text-[#FC687D] text-sm font-black uppercase tracking-widest rounded-2xl hover:bg-rose-50 transition-all shadow-sm hover:-translate-y-0.5 active:scale-95">
            + Category
          </button>
        </div>
      </header>

      {/* SEARCH BAR (Mobile Full Width, Desktop Integrated) */}
      <div className="relative mb-6 lg:hidden">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input 
          type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-5 py-4 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all shadow-sm"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* RESPONSIVE CATEGORY NAVIGATION */}
        <div className="w-full lg:w-72 flex-shrink-0">
          
          {/* Desktop Search (Hidden on Mobile) */}
          <div className="hidden lg:block relative mb-6">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-5 py-4 bg-white border border-slate-100 rounded-[20px] text-sm focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all shadow-sm"
            />
          </div>
          
          {/* Categories: Horizontal Swipe on Mobile, Vertical Sidebar on Desktop */}
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible hide-scrollbar gap-3 lg:gap-1 pb-4 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 lg:bg-white lg:p-3 lg:rounded-[28px] lg:border lg:border-slate-100 lg:shadow-sm">
            <h3 className="hidden lg:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 pt-2 pb-3">Categories</h3>
            
            <button 
              onClick={() => setCatFilter("All")}
              className={`flex-shrink-0 lg:w-full flex items-center justify-between px-5 lg:px-4 py-3.5 lg:py-3 rounded-2xl text-[11px] lg:text-xs font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${
                catFilter === "All" ? "bg-slate-800 text-white shadow-md lg:shadow-sm" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent shadow-sm lg:shadow-none"
              }`}
            >
              <span>All Items</span>
              <span className={`hidden lg:flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>
            
            {categories.map(cat => (
              <button 
                key={cat.id} onClick={() => setCatFilter(cat.name)}
                className={`flex-shrink-0 lg:w-full flex items-center justify-between px-5 lg:px-4 py-3.5 lg:py-3 rounded-2xl text-[11px] lg:text-xs font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${
                  catFilter === cat.name ? "bg-[#FC687D] text-white shadow-md lg:shadow-sm shadow-rose-200" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent shadow-sm lg:shadow-none"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg lg:text-base">{cat.icon}</span> 
                  <span className="whitespace-nowrap lg:truncate max-w-[130px]">{cat.name}</span>
                </div>
                <span className={`hidden lg:flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === cat.name ? "bg-white/20" : "bg-slate-100"}`}>
                  {items.filter(i => i.category === cat.name).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* LIST AREA (Luxury Cards) */}
        <div className="flex-1 flex flex-col gap-4 lg:gap-5">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-[24px] lg:rounded-[28px] border border-rose-50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 md:p-5 pr-4 md:pr-6 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0 hover:shadow-[0_8px_30px_rgba(252,104,125,0.08)] hover:-translate-y-1 transition-all duration-300 group cursor-default">
              
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-[#FFF9FA] flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-rose-100/50">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl md:text-3xl text-rose-200/50">📷</span>
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base md:text-lg mb-1 tracking-tight">{item.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-[#FC687D] text-sm md:text-base">₱{item.price}</span>
                    <span className="text-slate-200 text-xs">•</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{item.category}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 md:gap-8 pt-4 md:pt-0 border-t md:border-none border-slate-50">
                <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 ${
                  item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100/50" : "bg-slate-50 text-slate-400 border-slate-100"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></span>
                  {item.is_available ? "Available" : "Disabled"}
                </span>

                <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <button onClick={() => openModal(item)} className="px-5 py-2.5 bg-slate-50/80 border border-slate-100 text-xs font-black text-slate-500 hover:text-[#FC687D] hover:border-rose-200 hover:bg-rose-50 rounded-xl transition-all active:scale-90">
                    ✎
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="w-10 h-10 flex items-center justify-center bg-slate-50/80 border border-slate-100 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all active:scale-90">
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div className="text-center py-24 text-slate-400 font-black uppercase tracking-[0.2em] text-xs border-2 border-dashed border-slate-200/60 rounded-[32px] bg-white/50">
              No exquisite items found
            </div>
          )}
        </div>
      </div>

      {/* LUXURY MODAL (Fully Responsive) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-t-[40px] md:rounded-[32px] p-6 md:p-10 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto hide-scrollbar" onClick={e => e.stopPropagation()}>
            
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 md:hidden" />

            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{editingItem ? "Edit Creation" : "New Creation"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90">
                ✕
              </button>
            </div>

            {/* Premium Tabs */}
            <div className="flex gap-2 mb-8 bg-slate-50/80 p-1.5 rounded-[20px] w-fit border border-slate-100/50">
              <button onClick={() => setModalTab("Details")} className={`px-6 py-2.5 rounded-[16px] text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all duration-300 ${modalTab === "Details" ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"}`}>
                <span className="text-sm">📄</span> Details
              </button>
              <button onClick={() => setModalTab("Option Groups")} className={`px-6 py-2.5 rounded-[16px] text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all duration-300 ${modalTab === "Option Groups" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-400 hover:text-slate-600"}`}>
                <span className="text-sm">⚙️</span> Options
              </button>
            </div>
            
            {modalTab === "Details" ? (
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Item Name *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all" placeholder="e.g. Signature Seasalt Latte" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Price (₱) *</label>
                    <input type="number" step="0.01" required value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Category *</label>
                    <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all appearance-none">
                      <option value="">— Select Category —</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Description</label>
                  <textarea rows="3" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all resize-none" placeholder="Rich espresso topped with sea salt cream..." />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Image URL</label>
                  <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-rose-100 transition-all text-slate-500" placeholder="https://media.base44.com/..." />
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <label className="flex items-center gap-4 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="peer appearance-none w-6 h-6 border-2 border-slate-300 rounded-lg checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                      <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-sm font-bold">✓</span>
                    </div>
                    <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors">Available to Order</span>
                  </label>
                  
                  <label className="flex items-center gap-4 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="peer appearance-none w-6 h-6 border-2 border-slate-300 rounded-lg checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                      <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-sm font-bold">✓</span>
                    </div>
                    <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors">Featured Item ⭐️</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 mt-6 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="w-full py-4 rounded-2xl bg-[#FC687D] text-white font-black uppercase tracking-widest text-xs hover:bg-rose-500 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:shadow-[0_12px_25px_rgba(252,104,125,0.35)] disabled:opacity-70 active:scale-95 hover:-translate-y-0.5">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col h-full animate-in fade-in duration-300 pb-4">
                <p className="text-[13px] text-slate-500 mb-6 font-medium leading-relaxed">
                  Add option groups like size, flavor, or add-ons that customers can choose from.
                </p>
                
                <button type="button" className="w-full py-5 border-2 border-dashed border-rose-200 text-[#FC687D] font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-rose-50 hover:border-[#FC687D] transition-all mb-8 active:scale-[0.98]">
                  + Add Option Group
                </button>

                <div className="grid grid-cols-2 gap-4 pt-6 mt-auto border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="w-full py-4 rounded-2xl bg-[#FC687D] text-white font-black uppercase tracking-widest text-xs hover:bg-rose-500 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:shadow-[0_12px_25px_rgba(252,104,125,0.35)] disabled:opacity-70 active:scale-95 hover:-translate-y-0.5">
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