"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const emptyItem = { name: "", price: "", category: "", description: "", image_url: "", is_available: true, is_featured: false, option_groups: [] };
const emptyCategory = { name: "", icon: "🍽", sort_order: "", is_active: true };

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // View State
  const [activeView, setActiveView] = useState("items"); // 'items' or 'categories'
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemTab, setItemTab] = useState("details"); // 'details' or 'options'
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

  // Category Modal State
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState(emptyCategory);
  const [savingCat, setSavingCat] = useState(false);

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
    if (catsRes.data) {
      setCategories(catsRes.data);
    } else {
      // Fallback if menu_categories table doesn't exist yet
      const uniqueCats = [...new Set(itemsRes.data?.map(i => i.category) || [])];
      setCategories(uniqueCats.map((name, i) => ({ id: i, name, icon: "🍽", sort_order: i, is_active: true })));
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
    
    const payload = {
      ...itemForm,
      price: parseFloat(itemForm.price) || 0,
    };

    if (editingItem) {
      await supabase.from("menu_items").update(payload).eq("id", editingItem.id);
      setItems(items.map(i => i.id === editingItem.id ? { ...i, ...payload } : i));
    } else {
      const { data } = await supabase.from("menu_items").insert([payload]).select();
      if (data) setItems([...items, data[0]]);
    }
    
    setSavingItem(false);
    setItemModalOpen(false);
  };

  const deleteItem = async (id) => {
    if (!confirm("Permanently delete this item?")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    setItems(items.filter(i => i.id !== id));
  };

  const toggleItemStatus = async (item) => {
    const newStatus = !item.is_available;
    await supabase.from("menu_items").update({ is_available: newStatus }).eq("id", item.id);
    setItems(items.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));
  };

  // --- OPTION GROUPS LOGIC ---
  const addOptionGroup = () => {
    setItemForm(f => ({
      ...f, option_groups: [...(f.option_groups || []), { name: "", required: false, multi_select: false, options: [] }]
    }));
  };
  const updateGroup = (gIdx, field, val) => {
    const newGroups = [...itemForm.option_groups];
    newGroups[gIdx][field] = val;
    setItemForm({ ...itemForm, option_groups: newGroups });
  };
  const removeGroup = (gIdx) => {
    setItemForm(f => ({ ...f, option_groups: f.option_groups.filter((_, i) => i !== gIdx) }));
  };
  const addOption = (gIdx) => {
    const newGroups = [...itemForm.option_groups];
    newGroups[gIdx].options.push({ name: "", price_add: 0 });
    setItemForm({ ...itemForm, option_groups: newGroups });
  };
  const updateOption = (gIdx, oIdx, field, val) => {
    const newGroups = [...itemForm.option_groups];
    newGroups[gIdx].options[oIdx][field] = val;
    setItemForm({ ...itemForm, option_groups: newGroups });
  };
  const removeOption = (gIdx, oIdx) => {
    const newGroups = [...itemForm.option_groups];
    newGroups[gIdx].options = newGroups[gIdx].options.filter((_, i) => i !== oIdx);
    setItemForm({ ...itemForm, option_groups: newGroups });
  };

  // --- CATEGORY CRUD ---
  const openAddCategory = () => {
    setEditingCat(null);
    setCatForm({ ...emptyCategory, sort_order: categories.length + 1 });
    setCatModalOpen(true);
  };

  const openEditCategory = (cat) => {
    setEditingCat(cat);
    setCatForm(cat);
    setCatModalOpen(true);
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    setSavingCat(true);
    const payload = { ...catForm, sort_order: parseInt(catForm.sort_order) || 0 };

    if (editingCat) {
      await supabase.from("menu_categories").update(payload).eq("id", editingCat.id);
      setCategories(categories.map(c => c.id === editingCat.id ? { ...c, ...payload } : c));
    } else {
      const { data } = await supabase.from("menu_categories").insert([payload]).select();
      if (data) setCategories([...categories, data[0]]);
    }
    setSavingCat(false);
    setCatModalOpen(false);
  };

  const deleteCategory = async (id) => {
    if (!confirm("Delete this category?")) return;
    await supabase.from("menu_categories").delete().eq("id", id);
    setCategories(categories.filter(c => c.id !== id));
  };


  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto font-mono pb-20">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
            Menu <span className="text-[#1EBBA3] font-light">Builder</span>
          </h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
            {items.length} items • {categories.length} categories
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={openAddItem} className="px-6 py-3 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors rounded-none shadow-sm">+ Add Item</button>
          <button onClick={openAddCategory} className="px-6 py-3 bg-gray-50 border border-gray-200 text-[#1A1A1A] text-[10px] font-bold uppercase tracking-widest hover:border-[#1A1A1A] transition-colors rounded-none shadow-sm">+ Add Category</button>
        </div>
      </header>

      {/* VIEW TABS */}
      <div className="flex gap-2 mb-8 border-b border-gray-200 pb-px">
        <button onClick={() => setActiveView("items")} className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-none ${activeView === "items" ? "bg-[#1A1A1A] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
          📋 Menu Items
        </button>
        <button onClick={() => setActiveView("categories")} className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-none ${activeView === "categories" ? "bg-[#1A1A1A] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
          🏷️ Categories
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><div className="w-8 h-8 border-2 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-none"></div></div>
      ) : activeView === "items" ? (
        <>
          {/* FILTER BAR */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-none" />
            </div>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              <button onClick={() => setCatFilter("All")} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-none transition-colors border ${catFilter === "All" ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>All</button>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setCatFilter(cat.name)} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-none transition-colors border flex items-center gap-2 ${catFilter === cat.name ? "bg-[#1EBBA3] text-white border-[#1EBBA3]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                  <span>{cat.icon}</span> {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* ITEM GRID */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className={`bg-white border border-gray-200 flex flex-col rounded-none hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all ${!item.is_available ? "opacity-60" : ""}`}>
                <div className="h-40 bg-gray-50 relative border-b border-gray-100 flex items-center justify-center overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl opacity-20">📷</span>
                  )}
                </div>
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="font-bold text-[#1A1A1A] text-sm uppercase tracking-wide leading-tight">{item.name}</h3>
                    <span className="font-black text-[#1EBBA3] text-sm">₱{item.price}</span>
                  </div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">{item.category}</p>
                  <span className={`inline-block px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-none border ${item.is_available ? "bg-[#1EBBA3]/10 text-[#159a85] border-[#1EBBA3]/20" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                    {item.is_available ? "● Available" : "○ Disabled"}
                  </span>
                </div>
                <div className="grid grid-cols-3 border-t border-gray-100 bg-gray-50">
                  <button onClick={() => openEditItem(item)} className="p-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:bg-white hover:text-[#1EBBA3] transition-colors">✏️ Edit</button>
                  <button onClick={() => toggleItemStatus(item)} className="p-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:bg-white hover:text-[#1A1A1A] border-x border-gray-100 transition-colors">{item.is_available ? "Disable" : "Enable"}</button>
                  <button onClick={() => deleteItem(item.id)} className="p-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* CATEGORY LIST */
        <div className="space-y-4 max-w-3xl">
          {categories.map(cat => (
            <div key={cat.id} className="bg-white border border-gray-200 p-5 flex items-center justify-between rounded-none hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-6">
                <div className="text-3xl w-12 text-center">{cat.icon}</div>
                <div>
                  <h3 className="font-bold text-[#1A1A1A] uppercase tracking-widest text-sm">{cat.name}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Sort Order: {cat.sort_order}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => openEditCategory(cat)} className="px-4 py-2 border border-gray-200 text-[10px] font-bold uppercase tracking-widest hover:border-[#1EBBA3] hover:text-[#1EBBA3] transition-colors rounded-none">Edit</button>
                <button onClick={() => deleteCategory(cat.id)} className="px-4 py-2 border border-red-100 bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors rounded-none">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ITEM MODAL --- */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-2xl rounded-none flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold uppercase tracking-tighter text-[#1A1A1A]">{editingItem ? "Edit Item" : "Add New Item"}</h2>
              <button onClick={() => setItemModalOpen(false)} className="text-gray-400 hover:text-[#1A1A1A] text-2xl font-light">×</button>
            </div>

            <div className="flex gap-2 px-6 pt-4 border-b border-gray-100">
              <button onClick={() => setItemTab("details")} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${itemTab === "details" ? "border-[#1EBBA3] text-[#1A1A1A]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>📝 Details</button>
              <button onClick={() => setItemTab("options")} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${itemTab === "options" ? "border-[#1EBBA3] text-[#1A1A1A]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>⚙️ Option Groups</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {itemTab === "details" ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Item Name *</label>
                    <input required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#1EBBA3]" placeholder="e.g. Chicken Wings" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Price (₱) *</label>
                      <input required type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                        className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#1EBBA3]" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Category *</label>
                      <select required value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                        className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#1EBBA3] appearance-none bg-white">
                        <option value="">— Select Category —</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Description</label>
                    <textarea value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} rows={3}
                      className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#1EBBA3]" placeholder="Short description..." />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Image URL</label>
                    <input value={itemForm.image_url} onChange={e => setItemForm({ ...itemForm, image_url: e.target.value })}
                      className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm focus:outline-none focus:border-[#1EBBA3]" placeholder="https://..." />
                  </div>
                  <div className="flex gap-8">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={itemForm.is_available} onChange={e => setItemForm({ ...itemForm, is_available: e.target.checked })} className="accent-[#1EBBA3] w-4 h-4 rounded-none cursor-pointer" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Available</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={itemForm.is_featured} onChange={e => setItemForm({ ...itemForm, is_featured: e.target.checked })} className="accent-[#1EBBA3] w-4 h-4 rounded-none cursor-pointer" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Featured / Must Try</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-xs text-gray-500 font-medium">Add option groups like size, flavor, or add-ons that customers can choose from.</p>
                  
                  {(itemForm.option_groups || []).map((group, gIdx) => (
                    <div key={gIdx} className="border border-gray-200 bg-gray-50 p-5 rounded-none space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1">
                          <input value={group.name} onChange={e => updateGroup(gIdx, "name", e.target.value)} placeholder="Group Name (e.g. Size)"
                            className="w-full border border-gray-300 rounded-none px-3 py-2 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-[#1EBBA3]" />
                        </div>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            <input type="checkbox" checked={group.required} onChange={e => updateGroup(gIdx, "required", e.target.checked)} className="accent-[#1EBBA3]" /> Required
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            <input type="checkbox" checked={group.multi_select} onChange={e => updateGroup(gIdx, "multi_select", e.target.checked)} className="accent-[#1EBBA3]" /> Multiple
                          </label>
                        </div>
                        <button onClick={() => removeGroup(gIdx)} className="text-gray-400 hover:text-red-500 font-bold text-lg leading-none">×</button>
                      </div>

                      <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                        {(group.options || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-2 items-center">
                            <input value={opt.name} onChange={e => updateOption(gIdx, oIdx, "name", e.target.value)} placeholder="Option name"
                              className="flex-1 border border-gray-300 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-[#1EBBA3]" />
                            <div className="relative w-24">
                              <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
                              <input type="number" value={opt.price_add || 0} onChange={e => updateOption(gIdx, oIdx, "price_add", parseFloat(e.target.value))}
                                className="w-full border border-gray-300 rounded-none pl-7 py-2 text-sm focus:outline-none focus:border-[#1EBBA3]" />
                            </div>
                            <button onClick={() => removeOption(gIdx, oIdx)} className="text-gray-400 hover:text-red-500 font-bold px-2">×</button>
                          </div>
                        ))}
                        <button onClick={() => addOption(gIdx)} className="text-[10px] font-bold text-[#1EBBA3] uppercase tracking-widest hover:underline mt-2">+ Add Option</button>
                      </div>
                    </div>
                  ))}

                  <button onClick={addOptionGroup} className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-[#1EBBA3] hover:text-[#1EBBA3] hover:bg-gray-50 transition-colors rounded-none">
                    + Add Option Group
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-4">
              <button onClick={() => setItemModalOpen(false)} className="flex-1 py-4 border border-gray-200 bg-white text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors rounded-none">Cancel</button>
              <button onClick={saveItem} disabled={savingItem} className="flex-1 py-4 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors rounded-none disabled:opacity-50">
                {savingItem ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CATEGORY MODAL --- */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-sm rounded-none animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold uppercase tracking-tighter text-[#1A1A1A]">{editingCat ? "Edit Category" : "Add Category"}</h2>
              <button onClick={() => setCatModalOpen(false)} className="text-gray-400 hover:text-[#1A1A1A] text-2xl font-light">×</button>
            </div>
            
            <form onSubmit={saveCategory} className="p-6 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Category Name *</label>
                <input required value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#1EBBA3]" placeholder="e.g. Rice Meals" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Icon (Emoji)</label>
                  <input value={catForm.icon} onChange={e => setCatForm({ ...catForm, icon: e.target.value })}
                    className="w-full border border-gray-300 rounded-none px-4 py-3 text-2xl text-center focus:outline-none focus:border-[#1EBBA3]" placeholder="🍽️" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Sort Order</label>
                  <input type="number" required value={catForm.sort_order} onChange={e => setCatForm({ ...catForm, sort_order: e.target.value })}
                    className="w-full border border-gray-300 rounded-none px-4 py-3 text-sm focus:outline-none focus:border-[#1EBBA3]" placeholder="1" />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={catForm.is_active} onChange={e => setCatForm({ ...catForm, is_active: e.target.checked })} className="accent-[#1EBBA3] w-4 h-4 rounded-none cursor-pointer" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Active / Visible</span>
                </label>
              </div>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setCatModalOpen(false)} className="flex-1 py-4 border border-gray-200 bg-gray-50 text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors rounded-none">Cancel</button>
                <button type="submit" disabled={savingCat} className="flex-1 py-4 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors rounded-none disabled:opacity-50">
                  {savingCat ? "Saving..." : editingCat ? "Save" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}