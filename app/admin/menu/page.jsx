"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Item Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("Details");
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ 
    name: "", category: "", price: "", description: "", 
    image_url: "", is_available: true, is_featured: false 
  });
  const [optionGroups, setOptionGroups] = useState([]);
  const hasVariants = optionGroups.length > 0;
  const [saving, setSaving] = useState(false);

  // Category Modal State
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", sort_order: 1, is_active: true });
  const [catSaving, setCatSaving] = useState(false);

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

  // --- ITEM HANDLERS ---
  const openModal = (item = null) => {
    setModalTab("Details"); 
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || "", category: item.category || "", price: item.price || "",
        description: item.description || "", image_url: item.image_url || "",
        is_available: item.is_available !== false, is_featured: item.is_featured || false
      });
      setOptionGroups(item.variants || []);
    } else {
      setEditingItem(null);
      setForm({ 
        name: "", category: categories.length > 0 ? categories[0].name : "", 
        price: "", description: "", image_url: "", is_available: true, is_featured: false 
      });
      setOptionGroups([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSaving(true);
    try {
      const finalPayload = {
        ...form,
        price: hasVariants ? 0 : form.price,
        variants: optionGroups
      };

      if (editingItem) await supabase.from("menu_items").update(finalPayload).eq("id", editingItem.id);
      else await supabase.from("menu_items").insert([finalPayload]);
      
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

  // --- VARIANT HANDLERS ---
  const addOptionGroup = () => {
    setOptionGroups([
      ...optionGroups,
      { id: Date.now(), name: "", isRequired: false, isMultiSelect: false, options: [{ id: Date.now() + 1, name: "", priceAdjustment: 0 }] }
    ]);
    setModalTab("Option Groups");
  };

  const removeOptionGroup = (groupId) => setOptionGroups(optionGroups.filter(g => g.id !== groupId));
  const updateOptionGroup = (groupId, field, value) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g));
  const addOption = (groupId) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: [...g.options, { id: Date.now(), name: "", priceAdjustment: 0 }] } : g));
  const removeOption = (groupId, optionId) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: g.options.filter(o => o.id !== optionId) } : g));
  const updateOption = (groupId, optionId, field, value) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: g.options.map(o => o.id === optionId ? { ...o, [field]: value } : o) } : g));

  // --- CATEGORY HANDLERS ---
  const openCategoryModal = () => {
    setCatForm({ name: "", sort_order: categories.length + 1, is_active: true });
    setIsCatModalOpen(true);
  };

  const handleCategorySave = async (e) => {
    e.preventDefault();
    setCatSaving(true);
    try {
      await supabase.from("menu_categories").insert([catForm]);
      await fetchData();
      setIsCatModalOpen(false);
    } catch (error) {
      alert("Error saving category: " + error.message);
    }
    setCatSaving(false);
  };


  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div 
      className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8"
      style={{ fontFamily: "'Abadi', sans-serif" }}
    >
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 mb-4 md:mb-8 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-normal text-slate-800 leading-none">Menu Builder</h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium mt-1 md:mt-2">
            {items.length} exquisite items • {categories.length} categories
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-2 md:gap-3">
          <button onClick={() => openModal()} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-[#FC687D] text-white text-[11px] md:text-sm font-normal uppercase rounded-xl md:rounded-2xl hover:bg-rose-500 transition-all shadow-[0_4px_15px_rgba(252,104,125,0.25)] hover:-translate-y-0.5 active:scale-95">
            + Add Item
          </button>
          <button onClick={openCategoryModal} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white border border-rose-100 text-[#FC687D] text-[11px] md:text-sm font-normal uppercase rounded-xl md:rounded-2xl hover:bg-rose-50 transition-all shadow-sm active:scale-95">
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
          
          <div className="hidden lg:block relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm"
            />
          </div>
          
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible hide-scrollbar gap-2 lg:gap-1 pb-2 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0 lg:bg-white lg:p-2 lg:rounded-2xl lg:border lg:border-slate-100 lg:shadow-sm">
            <h3 className="hidden lg:block text-[10px] font-normal uppercase text-slate-400 px-3 pt-2 pb-2">Categories</h3>
            
            <button 
              onClick={() => setCatFilter("All")}
              className={`flex-shrink-0 lg:w-full flex items-center justify-between px-4 lg:px-3 py-2.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-normal uppercase transition-all duration-300 active:scale-95 ${
                catFilter === "All" ? "bg-slate-800 text-white shadow-sm" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent"
              }`}
            >
              <span>All Items</span>
              <span className={`hidden lg:flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>
            
            {categories.map(cat => (
              <button 
                key={cat.id} onClick={() => setCatFilter(cat.name)}
                className={`flex-shrink-0 lg:w-full flex items-center justify-between px-4 lg:px-3 py-2.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-normal uppercase transition-all duration-300 active:scale-95 ${
                  catFilter === cat.name ? "bg-[#FC687D] text-white shadow-sm shadow-rose-200" : "bg-white lg:bg-transparent text-slate-500 hover:bg-slate-50 border border-slate-100 lg:border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
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
                  <h3 className="font-normal text-slate-800 text-sm md:text-base mb-0.5 leading-tight">
                    {item.name} {item.variants?.length > 0 && <span className="ml-1 text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded uppercase font-bold">Variants</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="font-normal text-[#FC687D] text-xs md:text-sm">
                      {item.variants?.length > 0 ? "Variable Price" : `₱${item.price}`}
                    </span>
                    <span className="text-slate-200 text-[10px]">•</span>
                    <span className="text-[9px] md:text-[10px] font-normal uppercase text-slate-400">{item.category}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3 md:gap-6 pt-3 md:pt-0 border-t md:border-none border-slate-50">
                <span className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-normal uppercase border flex items-center gap-1.5 ${
                  item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100/50" : "bg-slate-50 text-slate-400 border-slate-100"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></span>
                  {item.is_available ? "Available" : "Disabled"}
                </span>

                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <button onClick={() => openModal(item)} className="px-3 md:px-4 py-1.5 md:py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-normal text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 rounded-lg md:rounded-xl transition-all active:scale-90">
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
            <div className="text-center py-12 md:py-20 text-slate-400 font-normal uppercase text-[10px] md:text-xs border border-dashed border-slate-200/60 rounded-xl md:rounded-2xl bg-white/50">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* ─── ADD CATEGORY MODAL ─── */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300" onClick={() => setIsCatModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[24px] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800">Add Category</h3>
              <button onClick={() => setIsCatModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCategorySave} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Category Name *</label>
                <input 
                  type="text" required placeholder="e.g. Rice Meals" 
                  value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Sort Order</label>
                <input 
                  type="number" required 
                  value={catForm.sort_order} onChange={e => setCatForm({...catForm, sort_order: parseInt(e.target.value) || 0})} 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" 
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" checked={catForm.is_active} onChange={e => setCatForm({...catForm, is_active: e.target.checked})} 
                      className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" 
                    />
                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Active / Visible</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsCatModalOpen(false)} className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all active:scale-95">
                  Cancel
                </button>
                <button type="submit" disabled={catSaving} className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-bold text-xs hover:bg-rose-500 transition-all shadow-md shadow-rose-200 disabled:opacity-70 active:scale-95">
                  {catSaving ? "Saving..." : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT ITEM MODAL ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-t-[20px] md:rounded-[24px] p-5 md:p-8 shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-300 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 md:hidden flex-shrink-0" />

            <div className="flex justify-between items-center mb-5 md:mb-6 flex-shrink-0">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800" >{editingItem ? "Edit Item" : "New Item"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 font-bold">
                ✕
              </button>
            </div>

            {/* Premium Tabs */}
            <div className="flex gap-1 md:gap-2 mb-5 md:mb-6 bg-slate-50 p-1 rounded-xl w-fit border border-slate-100 flex-shrink-0">
              <button onClick={() => setModalTab("Details")} className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all duration-300 ${modalTab === "Details" ? "bg-rose-50 text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-slate-100"}`}>
                <span className="text-xs md:text-sm">📝</span> Details
              </button>
              <button onClick={() => setModalTab("Option Groups")} className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all duration-300 ${modalTab === "Option Groups" ? "bg-rose-50 text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-slate-100"}`}>
                <span className="text-xs md:text-sm">⚙️</span> Option Groups {hasVariants && `(${optionGroups.length})`}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto hide-scrollbar -mx-2 px-2 pb-4">
              {modalTab === "Details" ? (
                <form id="item-form" onSubmit={handleSave} className="space-y-4 md:space-y-5 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Item Name *</label>
                    <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 md:gap-5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Category *</label>
                      <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all appearance-none cursor-pointer">
                        <option value="">— Select Category —</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Price (₱) *</label>
                      <input 
                        type="number" step="0.01" 
                        required={!hasVariants} 
                        disabled={hasVariants}
                        value={hasVariants ? "0" : form.price} 
                        onChange={e => setForm({...form, price: e.target.value})} 
                        className={`w-full rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm transition-all ${
                          hasVariants 
                            ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed" 
                            : "bg-white border border-slate-200 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100"
                        }`} 
                      />
                      {hasVariants && <p className="text-[10px] text-slate-500 mt-1.5 ml-1 leading-tight">Price derived from variants because Option Groups are added.</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Description</label>
                    <textarea rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all resize-none" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Product Image</label>
                    <button type="button" className="w-full py-5 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 font-medium text-xs transition flex flex-col items-center gap-1.5">
                      <span className="text-lg">↑</span>
                      Upload Image
                    </button>
                    <input type="url" placeholder="Or paste Image URL here" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-[#FC687D] transition-all text-slate-500" />
                  </div>

                  <button type="button" onClick={addOptionGroup} className="w-full py-3.5 bg-slate-500 hover:bg-slate-600 text-white rounded-xl font-bold text-xs transition-colors mt-2 active:scale-95 shadow-sm">
                    Add Variant Option Group
                  </button>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                        <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                      </div>
                      <span className="text-xs md:text-sm font-medium text-slate-700">Available to Order</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-[#FC687D] checked:bg-[#FC687D] transition-all cursor-pointer" />
                        <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                      </div>
                      <span className="text-xs md:text-sm font-medium text-slate-700">Featured Item ⭐️</span>
                    </label>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col h-full animate-in fade-in duration-300 pb-2">
                  <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed px-1">
                    Add option groups like size, flavor, or add-ons that customers can choose from.
                  </p>

                  <div className="space-y-4 mb-6">
                    {optionGroups.map((group) => (
                      <div key={group.id} className="border border-rose-100 rounded-2xl p-4 md:p-5 bg-white shadow-[0_2px_10px_rgba(252,104,125,0.05)]">
                        
                        {/* Group Header Row */}
                        <div className="flex flex-wrap lg:flex-nowrap gap-3 items-center mb-4 pb-4 border-b border-slate-50">
                          <input
                            placeholder="Group name (e.g. Size, Flavor)"
                            value={group.name}
                            onChange={(e) => updateOptionGroup(group.id, "name", e.target.value)}
                            className="flex-1 min-w-[140px] border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm focus:outline-none focus:border-[#FC687D] transition"
                          />
                          <label className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-600 font-medium cursor-pointer">
                            <input type="checkbox" checked={group.isRequired} onChange={(e) => updateOptionGroup(group.id, "isRequired", e.target.checked)} className="w-3.5 h-3.5 accent-[#FC687D] cursor-pointer" />
                            Required
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-600 font-medium cursor-pointer">
                            <input type="checkbox" checked={group.isMultiSelect} onChange={(e) => updateOptionGroup(group.id, "isMultiSelect", e.target.checked)} className="w-3.5 h-3.5 accent-[#FC687D] cursor-pointer" />
                            Multi-select
                          </label>
                          <button type="button" onClick={() => removeOptionGroup(group.id)} className="text-red-400 hover:text-red-600 px-1 font-bold text-base transition-colors ml-auto lg:ml-2">✕</button>
                        </div>

                        {/* Options List */}
                        <div className="space-y-3 pl-2 md:pl-4 border-l-2 border-slate-100 ml-1">
                          {group.options.map((opt) => (
                            <div key={opt.id} className="flex gap-2 md:gap-3 items-center">
                              <input
                                placeholder="Option name"
                                value={opt.name}
                                onChange={(e) => updateOption(group.id, opt.id, "name", e.target.value)}
                                className="flex-1 border border-slate-200 rounded-xl p-2 md:p-2.5 text-xs md:text-sm focus:outline-none focus:border-[#FC687D] transition"
                              />
                              <input
                                type="number"
                                placeholder="0"
                                value={opt.priceAdjustment}
                                onChange={(e) => updateOption(group.id, opt.id, "priceAdjustment", e.target.value)}
                                className="w-20 md:w-24 border border-slate-200 rounded-xl p-2 md:p-2.5 text-xs md:text-sm text-center focus:outline-none focus:border-[#FC687D] transition"
                              />
                              <button type="button" onClick={() => removeOption(group.id, opt.id)} className="text-red-300 hover:text-red-500 font-bold px-1 transition-colors text-base">✕</button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addOption(group.id)} className="text-[#FC687D] font-bold text-[10px] md:text-xs mt-2 hover:underline flex items-center gap-1">
                            + Add Option
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addOptionGroup} className="w-full py-3.5 md:py-4 border-2 border-dashed border-slate-200 text-[#FC687D] font-bold text-xs rounded-xl hover:bg-rose-50 hover:border-rose-200 transition-all mt-auto active:scale-95">
                    + Add Option Group
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex-shrink-0">
               {hasVariants && modalTab === "Option Groups" && (
                 <p className="text-center font-bold text-[11px] md:text-xs text-slate-800 mb-3 bg-slate-50 py-2 rounded-lg">
                   Price derived from Option Groups. Save or Update to reflect.
                 </p>
               )}
               <div className="grid grid-cols-2 gap-3">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-3 md:py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-all active:scale-95">
                   Cancel
                 </button>
                 <button onClick={handleSave} form="item-form" disabled={saving} className="w-full py-3 md:py-3.5 rounded-xl bg-[#FC687D] text-white font-bold text-xs hover:bg-rose-500 transition-all shadow-md shadow-rose-200 disabled:opacity-70 active:scale-95">
                   {saving ? "Saving..." : "Save Changes"}
                 </button>
               </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}