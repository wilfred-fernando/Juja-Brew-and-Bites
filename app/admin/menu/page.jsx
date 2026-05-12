"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { supabase } from "@/lib/supabase/client";

export default function MenuAdminPage() {
  const supabaseClient = createBrowserClient();

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

  const [globalModifierGroups, setGlobalModifierGroups] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [itemRes, catRes, modifierRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("name"),
        supabase.from("menu_categories").select("*").order("sort_order"),
        supabase.from("modifier_groups").select("*, modifier_options(*)")
      ]);

      if (itemRes.error) console.error("Items Error:", itemRes.error);
      if (catRes.error) console.error("Categories Error:", catRes.error);
      if (modifierRes.error) console.error("Modifiers Error (Check if table exists):", modifierRes.error);

      if (itemRes.data) setItems(itemRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (modifierRes.data) setGlobalModifierGroups(modifierRes.data);
      
    } catch (err) {
      console.error("Data Fetch Crash:", err);
    } finally {
      // This is the most important line!
      setLoading(false); 
    }
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

      let responseError = null;
      if (editingItem) {
        const { error } = await supabase.from("menu_items").update(finalPayload).eq("id", editingItem.id);
        responseError = error;
      } else {
        const { error } = await supabase.from("menu_items").insert([finalPayload]);
        responseError = error;
      }
      
      if (responseError) throw responseError;
      
      await fetchData(); 
      setIsModalOpen(false);
    } catch (error) { 
      console.error("Save Error:", error);
      alert("Error saving item: " + (error.message || JSON.stringify(error))); 
    } finally {
      setSaving(false);
    }
  }

  // --- DELETE HANDLERS ---
  const executeDeleteItem = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", itemToDelete.id);
      if (error) throw error;
      await fetchData();
      setItemToDelete(null);
    } catch (err) {
      alert("Error deleting item: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const executeDeleteCategory = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("menu_categories").delete().eq("id", categoryToDelete.id);
      if (error) throw error;
      if (catFilter === categoryToDelete.name) setCatFilter("All");
      await fetchData();
      setCategoryToDelete(null);
    } catch (err) {
      alert("Error deleting category: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- CATEGORY HANDLERS ---
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
    if (!catForm.name.trim()) return alert("Category name is required.");
    
    setCatSaving(true);
    try {
      if (editingCategory) {
        const { error } = await supabase.from("menu_categories").update(catForm).eq("id", editingCategory.id);
        if (error) throw error;
        
        if (editingCategory.name !== catForm.name) {
          await supabase.from("menu_items").update({ category: catForm.name }).eq("category", editingCategory.name);
          if (catFilter === editingCategory.name) setCatFilter(catForm.name);
        }
      } else {
        const { error } = await supabase.from("menu_categories").insert([catForm]);
        if (error) throw error;
      }
      
      await fetchData();
      setIsCatModalOpen(false);
    } catch (error) {
      console.error("Category Save Error:", error);
      alert("Error saving category: " + error.message);
    } finally {
      setCatSaving(false);
    }
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8" style={{ fontFamily: "'Arial', sans-serif" }}>
      
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
          <button onClick={() => openCategoryModal()} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white border border-rose-100 text-[#FC687D] text-[11px] md:text-sm font-normal uppercase rounded-xl md:rounded-2xl hover:bg-rose-50 transition-all shadow-sm active:scale-95">
            + Category
          </button>
        </div>
      </header>

      {/* SEARCH & NAV AREA */}
      <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
        <div className="hidden lg:block w-72 flex-shrink-0 text-xs font-normal uppercase">
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-[#FC687D] transition-all shadow-sm"
            />
          </div>
          
          <div className="flex flex-col bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-1">
            <h3 className="text-slate-400 px-3 pt-2 pb-2">Categories</h3>
            <button onClick={() => setCatFilter("All")} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${catFilter === "All" ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
              <span>All Items</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>
            {categories.map(cat => (
              <div key={cat.id} className="relative group">
                <button onClick={() => setCatFilter(cat.name)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${catFilter === cat.name ? "bg-[#FC687D] text-white shadow-rose-200" : "text-slate-500 hover:bg-slate-50"}`}>
                  <span className="text-left truncate pr-2">{cat.name}</span>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] ${catFilter === cat.name ? "bg-white/20" : "bg-slate-100"}`}>{items.filter(i => i.category === cat.name).length}</span>
                </button>
                <div className="absolute right-2 top-1.5 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={() => openCategoryModal(cat)} className="w-6 h-6 bg-white/90 rounded border border-slate-100 text-slate-400 hover:text-[#FC687D]">✎</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ITEMS LIST */}
        <div className="flex-1 space-y-3">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-rose-50 shadow-sm p-4 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-rose-50/30 border border-rose-50 flex items-center justify-center overflow-hidden">
                  {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <span className="text-2xl opacity-20">📷</span>}
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">{item.name}</h3>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">{item.category} • ₱{item.price || 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openModal(item)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-[#FC687D] rounded-xl transition-colors">✎</button>
                <button onClick={() => setItemToDelete(item)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-colors">🗑</button>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 text-slate-400 text-sm">No items found</div>}
        </div>
      </div>

      {/* ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-t-[24px] md:rounded-[32px] p-6 md:p-8 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">{editingItem ? "Edit Item" : "New Item"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-800 text-2xl">✕</button>
            </div>

            <div className="flex gap-2 mb-6 bg-slate-50 p-1 rounded-2xl w-fit border border-slate-100">
              <button onClick={() => setModalTab("Details")} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${modalTab === "Details" ? "bg-white text-[#FC687D] shadow-sm" : "text-slate-500"}`}>Details</button>
              <button onClick={() => setModalTab("Option Groups")} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${modalTab === "Option Groups" ? "bg-white text-[#FC687D] shadow-sm" : "text-slate-500"}`}>Modifiers</button>
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar">
              {modalTab === "Details" ? (
                <form id="item-form" onSubmit={handleSave} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Name</label>
                      <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-rose-100" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Price</label>
                      <input type="number" required disabled={hasVariants} value={hasVariants ? "" : form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 text-sm outline-none disabled:opacity-50" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
                    <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 text-sm outline-none cursor-pointer">
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Image URL</label>
                    <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 text-sm outline-none" />
                  </div>
                </form>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
                   <div className="flex justify-between items-center mb-4 px-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Global Modifiers</p>
                    <Link href="/admin/pos-admin" className="text-[10px] text-[#FC687D] font-bold hover:underline">Manage Groups →</Link>
                  </div>
                  {globalModifierGroups.map((group) => {
                    const isAssigned = optionGroups.some(g => g.id === group.id);
                    return (
                      <div key={group.id} onClick={() => isAssigned ? setOptionGroups(optionGroups.filter(g => g.id !== group.id)) : setOptionGroups([...optionGroups, group])} className={`flex justify-between items-center p-4 border rounded-2xl cursor-pointer transition-all ${isAssigned ? 'border-rose-200 bg-rose-50/20' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{group.name}</p>
                          <p className="text-[10px] text-slate-400">{group.modifier_options?.map(o => o.name).join(", ")}</p>
                        </div>
                        <div className={`w-11 h-6 rounded-full transition-all relative ${isAssigned ? 'bg-[#FC687D]' : 'bg-slate-200'}`}>
                          <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-all ${isAssigned ? 'left-6' : 'left-1'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100 grid grid-cols-2 gap-3">
              <button onClick={() => setIsModalOpen(false)} className="py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-widest">Cancel</button>
              <button onClick={handleSave} form="item-form" disabled={saving} className="py-4 rounded-2xl bg-[#FC687D] text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-200 disabled:opacity-50">Save Item</button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsCatModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-2xl font-bold text-slate-800 mb-6">{editingCategory ? "Edit Category" : "Add Category"}</h3>
            <form onSubmit={handleCategorySave} className="space-y-5">
              <input type="text" required placeholder="Category Name" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 text-sm outline-none" />
              <button type="submit" disabled={catSaving} className="w-full py-4 bg-[#FC687D] text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-200">Save Category</button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {(itemToDelete || categoryToDelete) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Are you sure?</h3>
            <p className="text-sm text-slate-500 mb-8">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => {setItemToDelete(null); setCategoryToDelete(null);}} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold text-xs uppercase text-slate-600">Cancel</button>
              <button onClick={itemToDelete ? executeDeleteItem : executeDeleteCategory} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold text-xs uppercase shadow-lg shadow-red-200">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}