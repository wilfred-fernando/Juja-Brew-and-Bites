"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const emptyItem = { 
  name: "", 
  price: "", 
  category: "", 
  description: "", 
  image_url: "", 
  is_available: true, 
  is_featured: false, 
  option_groups: [] 
};

export default function MenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [activeTab, setActiveTab] = useState("items"); // 'items' or 'categories'
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemTab, setItemTab] = useState("details"); // 'details' or 'options'
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

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
      // Fallback unique categories if menu_categories table is empty/missing
      const uniqueCats = [...new Set(itemsRes.data?.map(i => i.category) || [])];
      setCategories(uniqueCats.map((name, i) => ({ id: i, name, icon: "☕", sort_order: i, is_active: true })));
    }
    setLoading(false);
  }

  // --- ITEM CRUD ---
  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({ ...emptyItem, category: categories[0]?.name || "" });
    setItemTab("details");
    setItemModalOpen(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({ ...item, price: item.price.toString() });
    setItemTab("details");
    setItemModalOpen(true);
  };

  const saveItem = async (e) => {
    e.preventDefault();
    setSavingItem(true);
    
    // Create the exact payload to send to Supabase
    // Ensure these keys match your Supabase columns exactly!
    const payload = {
      name: itemForm.name,
      price: parseFloat(itemForm.price) || 0,
      category: itemForm.category,
      description: itemForm.description,
      image_url: itemForm.image_url,
      is_available: itemForm.is_available,
      is_featured: itemForm.is_featured,
      option_groups: itemForm.option_groups
    };

    if (editingItem) {
      // Update existing item
      const { error } = await supabase
        .from("menu_items")
        .update(payload)
        .eq("id", editingItem.id);
        
      if (error) {
        console.error("Supabase Update Error:", error);
        alert(`Failed to update: ${error.message}`);
      } else {
        setItems(items.map(i => i.id === editingItem.id ? { ...i, ...payload } : i));
        setItemModalOpen(false);
      }
    } else {
      // Insert new item
      const { data, error } = await supabase
        .from("menu_items")
        .insert([payload])
        .select();
        
      if (error) {
        console.error("Supabase Insert Error:", error);
        alert(`Failed to add item: ${error.message}`);
      } else if (data) {
        setItems([...items, data[0]]);
        setItemModalOpen(false);
      }
    }
    
    setSavingItem(false);
  };

  const deleteItem = async (id) => {
    if (!confirm("Permanently delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) {
        alert(`Failed to delete: ${error.message}`);
    } else {
        setItems(items.filter(i => i.id !== id));
    }
  };

  const toggleItemStatus = async (item) => {
    const newStatus = !item.is_available;
    const { error } = await supabase.from("menu_items").update({ is_available: newStatus }).eq("id", item.id);
    if (error) {
        alert(`Failed to update status: ${error.message}`);
    } else {
        setItems(items.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));
    }
  };

  // --- OPTION GROUPS HANDLERS ---
  const addOptionGroup = () => setItemForm(f => ({ ...f, option_groups: [...(f.option_groups || []), { name: "", required: false, multi_select: false, options: [] }] }));
  const updateGroup = (gIdx, field, val) => { const newGroups = [...itemForm.option_groups]; newGroups[gIdx][field] = val; setItemForm({ ...itemForm, option_groups: newGroups }); };
  const removeGroup = (gIdx) => setItemForm(f => ({ ...f, option_groups: f.option_groups.filter((_, i) => i !== gIdx) }));
  const addOption = (gIdx) => { const newGroups = [...itemForm.option_groups]; newGroups[gIdx].options.push({ name: "", price_add: 0 }); setItemForm({ ...itemForm, option_groups: newGroups }); };
  const updateOption = (gIdx, oIdx, field, val) => { const newGroups = [...itemForm.option_groups]; newGroups[gIdx].options[oIdx][field] = val; setItemForm({ ...itemForm, option_groups: newGroups }); };
  const removeOption = (gIdx, oIdx) => { const newGroups = [...itemForm.option_groups]; newGroups[gIdx].options = newGroups[gIdx].options.filter((_, i) => i !== oIdx); setItemForm({ ...itemForm, option_groups: newGroups }); };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

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
          <button onClick={openAddItem} className="px-6 py-2.5 bg-[#FC687D] text-white text-sm font-bold rounded-full hover:bg-rose-500 transition-colors shadow-[0_4px_12px_rgba(252,104,125,0.25)]">
            + Add Item
          </button>
          <button className="px-6 py-2.5 bg-white border border-rose-200 text-[#FC687D] text-sm font-bold rounded-full hover:bg-rose-50 transition-colors shadow-sm">
            + Add Category
          </button>
        </div>
      </header>

      {/* TABS */}
      <div className="flex gap-4 mb-8">
        <button onClick={() => setActiveTab("items")} 
          className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === "items" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-white/50"
          }`}>
          <span>📋</span> Menu Items
        </button>
        <button onClick={() => setActiveTab("categories")} 
          className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === "categories" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-white/50"
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
              <span className="absolute left-4 top-2.5 text-slate-400">🔍</span>
              <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} 
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-rose-100 text-sm rounded-full focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] shadow-sm" />
            </div>
            
            <div className="flex gap-2 overflow-x-auto hide-scrollbar items-center pb-1">
              <button onClick={() => setCatFilter("All")} 
                className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all border shadow-sm flex-shrink-0 ${
                  catFilter === "All" ? "bg-white text-slate-700 border-slate-200" : "bg-transparent text-slate-500 border-transparent hover:bg-white/50 hover:border-slate-200"
                }`}>
                All
              </button>
              {categories.map(cat => (
                <button key={cat.id || cat.name} onClick={() => setCatFilter(cat.name)} 
                  className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all border shadow-sm flex items-center gap-2 flex-shrink-0 ${
                    catFilter === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-rose-100 hover:border-[#FC687D] hover:text-[#FC687D]"
                  }`}>
                  <span>{cat.icon || "☕"}</span> <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ITEM CARDS GRID */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className={`bg-white rounded-[24px] p-3.5 border border-rose-50 shadow-sm flex flex-col hover:shadow-md hover:-translate-y-1 transition-all duration-300 ${!item.is_available ? "opacity-60 grayscale-[0.2]" : ""}`}>
                
                {/* Image */}
                <div className="h-44 bg-slate-50 rounded-[16px] mb-4 overflow-hidden relative border border-slate-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">📷</div>
                  )}
                </div>
                
                {/* Details */}
                <div className="px-1.5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="font-extrabold text-slate-800 text-[15px] leading-tight tracking-tight">{item.name}</h3>
                    <span className="font-black text-[#FC687D] text-[15px]">₱{item.price}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{item.category}</p>
                  
                  {/* Status Pill */}
                  <div className="mb-5 mt-auto">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-full border ${
                      item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${item.is_available ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                      {item.is_available ? "Available" : "Disabled"}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Buttons (pill style) */}
                <div className="flex gap-2">
                  <button onClick={() => openEditItem(item)} className="flex-1 py-2.5 bg-slate-50 border border-slate-100 text-slate-700 text-[11px] font-bold rounded-xl hover:bg-[#FC687D] hover:text-white hover:border-[#FC687D] transition-all flex items-center justify-center gap-2">
                    <span className="text-rose-400">✏️</span> Edit
                  </button>
                  <button onClick={() => toggleItemStatus(item)} className="flex-1 py-2.5 bg-slate-50 border border-slate-100 text-slate-700 text-[11px] font-bold rounded-xl hover:bg-slate-200 transition-colors">
                    {item.is_available ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="w-12 bg-slate-50 border border-slate-100 text-slate-400 text-sm font-bold rounded-xl hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all flex items-center justify-center">
                    🗑️
                  </button>
                </div>

              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-rose-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Category management view coming soon.</p>
        </div>
      )}

      {/* --- ADD / EDIT ITEM MODAL --- */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-2xl rounded-3xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            
            <div className="p-6 border-b border-rose-50 flex justify-between items-center bg-white">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-800">{editingItem ? "Edit Item" : "Add New Item"}</h2>
              <button onClick={() => setItemModalOpen(false)} className="text-slate-400 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-2 px-8 pt-6 pb-2 border-b border-rose-50 bg-[#FFF9FA]">
              <button onClick={() => setItemTab("details")} className={`px-5 py-2.5 text-xs font-bold rounded-full transition-colors flex items-center gap-2 ${itemTab === "details" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-white/50"}`}>
                <span>📝</span> Details
              </button>
              <button onClick={() => setItemTab("options")} className={`px-5 py-2.5 text-xs font-bold rounded-full transition-colors flex items-center gap-2 ${itemTab === "options" ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:bg-white/50"}`}>
                <span>⚙️</span> Option Groups
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 bg-white hide-scrollbar">
              {itemTab === "details" ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Item Name *</label>
                    <input required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" placeholder="e.g. Chicken Wings" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Price (₱) *</label>
                      <input required type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Category *</label>
                      <select required value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all appearance-none">
                        <option value="">— Select Category —</option>
                        {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Description</label>
                    <textarea value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all resize-none" placeholder="Short description..." />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Image URL</label>
                    <input value={itemForm.image_url} onChange={e => setItemForm({ ...itemForm, image_url: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" placeholder="https://..." />
                  </div>
                  <div className="flex gap-8 bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={itemForm.is_available} onChange={e => setItemForm({ ...itemForm, is_available: e.target.checked })} className="accent-[#FC687D] w-4 h-4 cursor-pointer" />
                      <span className="text-xs font-bold text-slate-700">Available</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={itemForm.is_featured} onChange={e => setItemForm({ ...itemForm, is_featured: e.target.checked })} className="accent-[#FC687D] w-4 h-4 cursor-pointer" />
                      <span className="text-xs font-bold text-slate-700">Featured / Must Try</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-xs text-slate-500 font-medium">Add option groups like size, flavor, or add-ons that customers can choose from.</p>
                  
                  {(itemForm.option_groups || []).map((group, gIdx) => (
                    <div key={gIdx} className="border border-rose-100 bg-[#FFF9FA] p-6 rounded-3xl space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1">
                          <input value={group.name} onChange={e => updateGroup(gIdx, "name", e.target.value)} placeholder="Group Name (e.g. Size)"
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#FC687D]" />
                        </div>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <input type="checkbox" checked={group.required} onChange={e => updateGroup(gIdx, "required", e.target.checked)} className="accent-[#FC687D] w-3.5 h-3.5" /> Required
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <input type="checkbox" checked={group.multi_select} onChange={e => updateGroup(gIdx, "multi_select", e.target.checked)} className="accent-[#FC687D] w-3.5 h-3.5" /> Multiple
                          </label>
                        </div>
                        <button type="button" onClick={() => removeGroup(gIdx)} className="text-rose-300 hover:text-rose-500 font-bold text-xl leading-none bg-white w-8 h-8 rounded-full border border-rose-100 flex items-center justify-center pb-1">×</button>
                      </div>

                      <div className="space-y-3 pl-2">
                        {(group.options || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-3 items-center">
                            <span className="text-rose-300">↳</span>
                            <input value={opt.name} onChange={e => updateOption(gIdx, oIdx, "name", e.target.value)} placeholder="Option name"
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FC687D]" />
                            <div className="relative w-28">
                              <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">₱</span>
                              <input type="number" value={opt.price_add || 0} onChange={e => updateOption(gIdx, oIdx, "price_add", parseFloat(e.target.value))}
                                className="w-full bg-white border border-slate-200 rounded-xl pl-8 py-2 text-sm focus:outline-none focus:border-[#FC687D]" />
                            </div>
                            <button type="button" onClick={() => removeOption(gIdx, oIdx)} className="text-slate-400 hover:text-rose-500 font-bold px-2 text-lg">×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addOption(gIdx)} className="ml-6 text-[10px] font-bold text-[#FC687D] uppercase tracking-widest hover:underline mt-2 bg-rose-50 px-3 py-1.5 rounded-full">+ Add Option</button>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addOptionGroup} className="w-full py-5 border-2 border-dashed border-rose-200 text-[#FC687D] text-[11px] font-bold uppercase tracking-widest hover:bg-rose-50 hover:border-[#FC687D] transition-colors rounded-3xl">
                    + Add Option Group
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-rose-50 bg-[#FFF9FA] flex gap-4 rounded-b-3xl">
              <button type="button" onClick={() => setItemModalOpen(false)} className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest hover:border-[#FC687D] hover:text-[#FC687D] transition-colors rounded-full shadow-sm">Cancel</button>
              <button onClick={saveItem} disabled={savingItem} className="flex-1 py-3.5 bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest hover:bg-rose-500 transition-all rounded-full shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-50">
                {savingItem ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}