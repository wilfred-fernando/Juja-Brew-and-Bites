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
  const [editingCategory, setEditingCategory] = useState(null);
  const [catForm, setCatForm] = useState({ name: "", sort_order: 1, is_active: true });
  const [catSaving, setCatSaving] = useState(false);

  // Custom Delete Modal State
  const [itemToDelete, setItemToDelete] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // --- HANDLERS ---
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
    if (!form.name.trim() || !form.category || (!hasVariants && form.price === "")) {
      alert("Please ensure Name, Category, and Price are filled out.");
      return;
    }
    setSaving(true);
    try {
      const finalPayload = {
        ...form,
        price: hasVariants ? 0 : parseFloat(form.price) || 0,
        variants: optionGroups
      };
      if (editingItem) {
        await supabase.from("menu_items").update(finalPayload).eq("id", editingItem.id);
      } else {
        await supabase.from("menu_items").insert([finalPayload]);
      }
      await fetchData(); 
      setIsModalOpen(false);
    } catch (error) { 
      alert("Error: " + error.message); 
    } finally {
      setSaving(false);
    }
  }

  // --- VARIANT LOGIC ---
  const addOptionGroup = () => {
    setOptionGroups([...optionGroups, { id: Date.now(), name: "Variants", isRequired: true, isMultiSelect: false, options: [{ id: Date.now() + 1, name: "", price: "" }] }]);
    setModalTab("Option Groups");
  };
  const removeOptionGroup = (groupId) => setOptionGroups(optionGroups.filter(g => g.id !== groupId));
  const updateOptionGroup = (groupId, field, value) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g));
  const addOption = (groupId) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: [...g.options, { id: Date.now(), name: "", price: "" }] } : g));
  const removeOption = (groupId, optionId) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: g.options.filter(o => o.id !== optionId) } : g));
  const updateOption = (groupId, optionId, field, value) => setOptionGroups(optionGroups.map(g => g.id === groupId ? { ...g, options: g.options.map(o => o.id === optionId ? { ...o, [field]: value } : o) } : g));

  // --- CATEGORY LOGIC ---
  const openCategoryModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setCatForm({ name: cat.name, sort_order: cat.sort_order, is_active: cat.is_active });
    } else {
      setEditingCategory(null);
      setCatForm({ name: "", sort_order: categories.length + 1, is_active: true });
    }
    setIsCatModalOpen(true);
  };

  const handleCategorySave = async (e) => {
    e.preventDefault();
    setCatSaving(true);
    try {
      if (editingCategory) {
        await supabase.from("menu_categories").update(catForm).eq("id", editingCategory.id);
        if (editingCategory.name !== catForm.name) {
          await supabase.from("menu_items").update({ category: catForm.name }).eq("category", editingCategory.name);
        }
      } else {
        await supabase.from("menu_categories").insert([catForm]);
      }
      await fetchData();
      setIsCatModalOpen(false);
    } finally {
      setCatSaving(false);
    }
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-700 pb-24 px-4 md:px-8">
      
      {/* HEADER: LUXURY TYPOGRAPHY */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-12 pt-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-800 leading-tight tracking-tighter">Menu Portfolio</h1>
          <p className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-8 h-[1px] bg-rose-200"></span>
            {items.length} Curated Items
          </p>
        </div>
        <div className="flex w-full lg:w-auto gap-3">
          <button onClick={() => openModal()} className="flex-1 lg:flex-none px-8 py-4 bg-[#FC687D] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 transition-all shadow-xl shadow-rose-100 hover:-translate-y-1 active:scale-95">
            + New Product
          </button>
          <button onClick={() => openCategoryModal()} className="flex-1 lg:flex-none px-8 py-4 bg-white border border-rose-100 text-[#FC687D] text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-50 transition-all active:scale-95">
            + Category
          </button>
        </div>
      </header>

      {/* MOBILE SEARCH/FILTER COMPONENT */}
      <div className="lg:hidden space-y-4 mb-8">
        <div className="relative group">
          <input 
            type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-[22px] text-sm focus:outline-none focus:border-[#FC687D] shadow-sm transition-all"
          />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FC687D] transition-colors">🔍</span>
        </div>
        <select 
          value={catFilter} 
          onChange={(e) => setCatFilter(e.target.value)}
          className="w-full p-4 bg-white border border-slate-100 rounded-[22px] text-xs font-black uppercase tracking-widest text-slate-700 outline-none"
        >
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* DESKTOP CATEGORY SIDEBAR: MINIMALIST & STICKY */}
        <div className="hidden lg:block w-72 flex-shrink-0 sticky top-10 h-fit">
          <div className="relative mb-8 group">
            <input 
              type="text" placeholder="Search portfolio..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-[24px] text-sm focus:outline-none focus:border-[#FC687D] shadow-sm transition-all"
            />
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FC687D] transition-colors">🔍</span>
          </div>
          
          <div className="space-y-1 px-1">
            <h3 className="text-[10px] font-black uppercase text-slate-300 tracking-[0.2em] mb-4 ml-4">Filter By</h3>
            <button 
              onClick={() => setCatFilter("All")}
              className={`w-full text-left px-5 py-4 rounded-[20px] text-[11px] font-black uppercase tracking-widest transition-all ${catFilter === "All" ? "bg-slate-900 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}
            >
              All Items
            </button>
            {categories.map(cat => (
              <div key={cat.id} className="group relative">
                <button 
                  onClick={() => setCatFilter(cat.name)}
                  className={`w-full text-left px-5 py-4 rounded-[20px] text-[11px] font-black uppercase tracking-widest transition-all ${catFilter === cat.name ? "bg-[#FC687D] text-white shadow-xl shadow-rose-100" : "text-slate-400 hover:bg-slate-50"}`}
                >
                  {cat.name}
                </button>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
                  <button onClick={() => openCategoryModal(cat)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-[10px] hover:bg-white/40">✎</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PRODUCT GRID: LUXURY CARD SYSTEM */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="group bg-white rounded-[32px] border border-rose-50 p-6 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(252,104,125,0.08)] hover:-translate-y-2 relative overflow-hidden flex flex-col h-full">
              
              {/* IMAGE CONTAINER */}
              <div className="w-full aspect-square rounded-[24px] bg-rose-50 mb-6 relative overflow-hidden border border-rose-50 flex-shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-rose-200 text-4xl">🍵</div>
                )}
                {item.is_featured && <span className="absolute top-4 left-4 bg-white/90 backdrop-blur-md text-[#FC687D] text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm">Featured</span>}
              </div>

              {/* CONTENT */}
              <div className="flex-1 flex flex-col">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FC687D] mb-2">{item.category}</p>
                <h3 className="text-xl font-bold text-slate-800 leading-tight mb-2 group-hover:text-[#FC687D] transition-colors line-clamp-1">{item.name}</h3>
                <p className="text-sm text-slate-400 line-clamp-2 mb-6 font-medium leading-relaxed">{item.description || "No description provided."}</p>
                
                <div className="mt-auto pt-6 border-t border-rose-50 flex items-center justify-between">
                  <span className="text-2xl font-black text-slate-900">
                    {item.variants?.length > 0 ? <span className="text-xs uppercase text-slate-300 tracking-widest">Multi-Price</span> : `₱${item.price}`}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => openModal(item)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-[#FC687D] hover:text-white transition-all active:scale-90">✎</button>
                    <button onClick={() => setItemToDelete(item)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-all active:scale-90">✕</button>
                  </div>
                </div>
              </div>

              {!item.is_available && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                  <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.3em] px-5 py-2.5 rounded-full">Unavailable</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* LUXURY GLASS MODALS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-6 transition-all duration-500 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-t-[40px] md:rounded-[40px] p-8 md:p-12 shadow-2xl animate-in slide-in-from-bottom-full md:zoom-in-95 duration-500 flex flex-col my-auto" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8 md:hidden" />
            
            <header className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-3xl font-black text-slate-800">{editingItem ? "Refine Item" : "New Creation"}</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Menu Inventory System</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-3xl text-slate-200 hover:text-slate-800 transition-colors">✕</button>
            </header>

            <nav className="flex gap-6 mb-10 border-b border-slate-50">
              {["Details", "Option Groups"].map(tab => (
                <button 
                  key={tab} 
                  onClick={() => setModalTab(tab)}
                  className={`pb-4 text-[11px] font-black uppercase tracking-widest transition-all relative ${modalTab === tab ? "text-[#FC687D]" : "text-slate-300"}`}
                >
                  {tab}
                  {modalTab === tab && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#FC687D] rounded-full animate-in fade-in zoom-in duration-300" />}
                </button>
              ))}
            </nav>

            <div className="space-y-8 mb-12 max-h-[50vh] overflow-y-auto pr-2 hide-scrollbar">
              {modalTab === "Details" ? (
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Product Name</label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-rose-100 transition-all" placeholder="e.g. Signature Iced Latte" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Category</label>
                      <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-5 text-sm font-bold text-slate-700 outline-none">
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Base Price (₱)</label>
                      <input disabled={hasVariants} type="number" value={hasVariants ? "" : form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-5 text-sm font-bold text-slate-700 disabled:opacity-30" placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Image URL</label>
                    <input value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-5 text-sm font-bold text-slate-700" placeholder="https://..." />
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {optionGroups.map(group => (
                    <div key={group.id} className="bg-slate-50 rounded-[32px] p-8 space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                        <input value={group.name} onChange={e => updateOptionGroup(group.id, "name", e.target.value)} className="bg-transparent font-black uppercase tracking-[0.2em] text-xs text-slate-800 outline-none" />
                        <button onClick={() => removeOptionGroup(group.id)} className="text-[10px] font-black text-red-400 uppercase tracking-widest">Remove Group</button>
                      </div>
                      {group.options.map(opt => (
                        <div key={opt.id} className="flex gap-3">
                          <input placeholder="Option Name" value={opt.name} onChange={e => updateOption(group.id, opt.id, "name", e.target.value)} className="flex-1 bg-white rounded-xl p-4 text-xs font-bold" />
                          <input placeholder="₱ Price" value={opt.price} onChange={e => updateOption(group.id, opt.id, "price", e.target.value)} className="w-28 bg-white rounded-xl p-4 text-xs font-bold" />
                          <button onClick={() => removeOption(group.id, opt.id)} className="text-slate-300">✕</button>
                        </div>
                      ))}
                      <button onClick={() => addOption(group.id)} className="text-[10px] font-black uppercase text-[#FC687D] tracking-widest">+ Add Option</button>
                    </div>
                  ))}
                  <button onClick={addOptionGroup} className="w-full py-6 border-2 border-dashed border-slate-100 rounded-[32px] text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">+ New Option Group</button>
                </div>
              )}
            </div>

            <footer className="flex gap-4 pt-10 border-t border-slate-50">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400">Discard</button>
              <button onClick={handleSave} className="flex-[2] py-5 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">{saving ? "Saving..." : "Commit Changes"}</button>
            </footer>
          </div>
        </div>
      )}

      {/* DELETE DIALOG: SOFT DANGER */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 text-center animate-in zoom-in-95 duration-300 shadow-2xl">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🗑️</div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">Confirm Deletion</h3>
            <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed">This will permanently remove <span className="text-slate-900 font-bold">"{itemToDelete.name}"</span> from the database.</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cancel</button>
              <button onClick={executeDeleteItem} className="flex-1 py-4 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-100 active:scale-95 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}