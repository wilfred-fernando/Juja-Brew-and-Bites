"use client";

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
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

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Loading menu...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Menu Builder</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Manage categories and items</p>
        </div>
        <button onClick={() => openModal()} className="px-6 py-3 bg-slate-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-sky-500 shadow-sm transition-all">
          + Add New Item
        </button>
      </div>

      {/* Grouped List per Category */}
      <div className="space-y-8">
        {categories.map((cat) => {
          // Filter items that belong to this category
          const catItems = items.filter(i => i.category === cat.name);

          return (
            <div key={cat.id} className="bg-white rounded-[24px] border border-sky-50 shadow-sm overflow-hidden">
              {/* Category Header */}
              <div className="bg-slate-50/50 px-6 py-4 border-b border-sky-50 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">{cat.icon}</span> {cat.name}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-100 shadow-sm">
                  {catItems.length} Items
                </span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-sky-50">
                {catItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs font-bold uppercase tracking-widest">No items in this category</div>
                ) : (
                  catItems.map(item => (
                    <div key={item.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-4">
                        {/* Image Thumbnail */}
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 text-xl border border-slate-200">
                            {cat.icon}
                          </div>
                        )}
                        
                        {/* Item Info */}
                        <div>
                          <p className="font-extrabold text-slate-800 text-sm">{item.name}</p>
                          <p className="text-slate-700 font-normal text-sm">₱{Number(item.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </div>

                      {/* Actions & Status */}
                      <div className="flex items-center gap-6">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-normal
                         uppercase tracking-widest border ${
                          item.is_available ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}>
                          {item.is_available ? "Available" : "Sold Out"}
                        </span>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openModal(item)} className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-blue-500 hover:border-blue-200 flex items-center justify-center shadow-sm">
                            ✎
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 flex items-center justify-center shadow-sm">
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-extrabold text-slate-800 mb-6">{editingItem ? "Edit Item" : "Add New Item"}</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Item Name</label>
                <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Category</label>
                  <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 appearance-none">
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Price (₱)</label>
                  <input type="number" step="0.01" required value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Image URL (Optional)</label>
                <input type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500" placeholder="https://..." />
              </div>

              <div className="flex items-center gap-3 py-2">
                <input type="checkbox" id="avail" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="w-5 h-5 accent-sky-700" />
                <label htmlFor="avail" className="text-sm font-bold text-slate-800">Item is Available</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 rounded-full bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-4 rounded-full bg-slate-600 text-white font-bold text-xs hover:bg-sky-500">{saving ? "Saving..." : "Save Item"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
