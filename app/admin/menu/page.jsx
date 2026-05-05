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
  }

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
    <div 
      className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8"
      style={{ fontFamily: "'Abadi', sans-serif" }} /* Applying Abadi Font Globally */
    >
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 mb-4 md:mb-8 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-800 leading-none">Menu Builder</h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium mt-1 md:mt-2">
            {items.length} exquisite items • {categories.length} categories
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-2 md:gap-3">
          <button onClick={() => openModal()} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-[#FC687D] text-white text-[11px] md:text-sm font-black uppercase rounded-xl md:rounded-2xl hover:bg-rose-500 transition-all shadow-[0_4px_15px_rgba(252,104,125,0.25)] hover:-translate-y-0.5 active:scale-95">
            + Add Item
          </button>
          <button className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white border border-rose-100 text-[#FC687D] text-[11px] md:text-sm font-black uppercase rounded-xl md:rounded-2xl hover:bg-rose-50 transition-all shadow-sm active:scale-95">
            + Category
          </button>
        </div>
      </header>

      {/* SEARCH BAR (Mobile Full Width) */}
      <div className="relative mb-4 lg:hidden">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input 
          type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-xl text-xs md:text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
        
        {/* RESPONSIVE CATEGORY NAVIGATION */}
        <div className="w-full lg:w-72 flex-shrink-0">
          
          {/* Desktop Search (Hidden on Mobile) */}
          <div className="hidden lg:block relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm"
            />
          </div>
          
          {/* Categories */}
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible hide-scrollbar gap-2 lg:gap-1 pb-2 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0 lg:bg-white lg:p-2 lg:rounded-2xl lg:border lg:border-slate-100 lg:shadow-sm">
            <h3 className="hidden lg:block text-[10px] font-black uppercase text-slate-400 px-3 pt-2 pb-2">Categories</h3>
            
            <button 
              onClick={() => setCatFilter("All")}
              className={`flex-shrink-0 lg:w-full flex items-center justify-between px-4 lg:px-3 py-2.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase transition-all duration-300 active:scale-95 ${
                catFilter === "All" ? "bg-slate-800 text-white shadow-sm" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent"
              }`}
            >
              <span>All Items</span>
              <span className={`hidden lg:flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>
            
            {categories.map(cat => (
              <button 
                key={cat.id} onClick={() => setCatFilter(cat.name)}
                className={`flex-shrink-0 lg:w-full flex items-center justify-between px-4 lg:px-3 py-2.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase transition-all duration-300 active:scale-95 ${
                  catFilter === cat.name ? "bg-[#FC687D] text-white shadow-sm shadow-rose-200" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm lg:text-base">{cat.icon}</span> 
                  <span className="whitespace-nowrap lg:truncate max-w-[130px]">{cat.name}</span>
                </div>
                <span className={`hidden lg:flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === cat.name ? "bg-white/20" : "bg-slate-100"}`}>
                  {items.filter(i => i.category === cat.name).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* LIST AREA */}
        <div className="flex-1 flex flex-col gap-3 md:gap-4">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-xl md:rounded-2xl border border-rose-50 shadow-sm p-3 md:p-4 pr-3 md:pr-5 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0 hover:shadow-md transition-all duration-300 group cursor-default">
              
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl bg-[#FFF9FA] flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-rose-50">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl md:text-2xl text-rose-200/50">📷</span>
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm md:text-base mb-0.5 leading-tight">{item.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[#FC687D] text-xs md:text-sm">₱{item.price}</span>
                    <span className="text-slate-200 text-[10px]">•</span>
                    <span className="text-[9px] md:text-[10px] font-black uppercase text-slate-400">{item.category}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3 md:gap-6 pt-3 md:pt-0 border-t md:border-none border-slate-50">
                <span className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase border flex items-center gap-1.5 ${
                  item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100/50" : "bg-slate-50 text-slate-400 border-slate-100"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></span>
                  {item.is_available ? "Available" : "Disabled"}
                </span>

                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <button onClick={() => openModal(item)} className="px-3 md:px-4 py-1.5 md:py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-black text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 rounded-lg md:rounded-xl transition-all active:scale-90">
                    ✎
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-slate-50 border border-slate-100 text-[10px] md:text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg md:rounded-xl transition-all active:scale-90">
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div className="text-center py-12 md:py-20 text-slate-400 font-black uppercase text-[10px] md:text-xs border border-dashed border-slate-200/60 rounded-xl md:rounded-2xl bg-white/50">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* LUXURY MODAL (Reduced borders & padding for Mobile) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-t-[20px] md:rounded-[24px] p-5 md:p-8 shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto hide-scrollbar" onClick={e => e.stopPropagation()}>
            
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex justify-between items-center mb-5 md:mb-6">
              <h3 className="text-xl md:text-2xl font-black text-slate-800 >{editingItem ? "Edit Item" : "New Item"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90">
                ✕
              </button>
            </div>

            {/* Premium Tabs */}
            <div className="flex gap-1 md:gap-2 mb-5 md:mb-6 bg-slate-50 p-1 rounded-xl w-fit border border-slate-100">
              <button onClick={() => setModalTab("Details")} className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase flex items-center gap-1.5 transition-all duration-300 ${modalTab === "Details" ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"}`}>
                <span className="text-xs md:text-sm">📄</span> Details
              </button>
              <button onClick={() => setModalTab("Option Groups")} className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase flex items-center gap-1.5 transition-all duration-300 ${modalTab === "Option Groups" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-400 hover:text-slate-600"}`}>
                <span className="text-xs md:text-sm">⚙️</span> Options
              </button>
            </div>
            
            {modalTab === "Details" ? (
              <form onSubmit={handleSave} className="space-y-4 md:space-y-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 ml-1">Item Name *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
                </div>
                
                <div className="grid grid-cols-2 gap-3 md:gap-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 ml-1">Price (₱) *</label>
                    <input type="number" step="0.01" required value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 ml-1">Category *</label>
                    <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all appearance-none">
                      <option value="">— Select Category —</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 ml-1">Description</label>
                  <textarea rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all resize-none" />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 ml-1">Image URL</label>
                  <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all text-slate-500" />
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-6 bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                      <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                    </div>
                    <span className="text-xs md:text-sm font-black text-slate-700">Available to Order</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                      <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                    </div>
                    <span className="text-xs md:text-sm font-black text-slate-700">Featured Item ⭐️</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3 md:py-3.5 rounded-xl bg-white border border-slate-200 text-slate-500 font-black uppercase text-[10px] md:text-xs hover:bg-slate-50 transition-all active:scale-95">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="w-full py-3 md:py-3.5 rounded-xl bg-[#FC687D] text-white font-black uppercase text-[10px] md:text-xs hover:bg-rose-500 transition-all shadow-sm disabled:opacity-70 active:scale-95">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col h-full animate-in fade-in duration-300 pb-2">
                <p className="text-xs text-slate-500 mb-4 font-medium leading-relaxed">
                  Add option groups like size, flavor, or add-ons.
                </p>
                
                <button type="button" className="w-full py-4 border border-dashed border-rose-200 text-[#FC687D] font-black uppercase text-[10px] md:text-xs rounded-xl hover:bg-rose-50 transition-all mb-6 active:scale-95">
                  + Add Option Group
                </button>

                <div className="grid grid-cols-2 gap-3 pt-4 mt-auto border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3 md:py-3.5 rounded-xl bg-white border border-slate-200 text-slate-500 font-black uppercase text-[10px] md:text-xs hover:bg-slate-50 transition-all active:scale-95">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="w-full py-3 md:py-3.5 rounded-xl bg-[#FC687D] text-white font-black uppercase text-[10px] md:text-xs hover:bg-rose-500 transition-all shadow-sm disabled:opacity-70 active:scale-95">
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