"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const emptyItem = { name: "", price: "", category: "", description: "", image_url: "", is_available: true, is_featured: false, option_groups: [] };
const emptyCategory = { name: "", icon: "🍽", sort_order: "", is_active: true };

export default function MenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("items");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemTab, setItemTab] = useState("details");
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState(emptyCategory);
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("sort_order")
    ]);
    if (itemsRes.data) setItems(itemsRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    setLoading(false);
  }

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
      const { error } = await supabase.from("menu_items").update(payload).eq("id", editingItem.id);
      if (error) alert(`Update Failed: ${error.message}`);
      else {
        setItems(items.map(i => i.id === editingItem.id ? { ...i, ...payload } : i));
        setItemModalOpen(false);
      }
    } else {
      const { data, error } = await supabase.from("menu_items").insert([payload]).select();
      if (error) alert(`Insert Failed: ${error.message}`);
      else if (data) {
        setItems([...items, data[0]]);
        setItemModalOpen(false);
      }
    }
    setSavingItem(false);
  };

  const toggleItemStatus = async (item) => {
    const newStatus = !item.is_available;
    const { error } = await supabase.from("menu_items").update({ is_available: newStatus }).eq("id", item.id);
    if (!error) setItems(items.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));
  };

  const deleteItem = async (id) => {
    if (confirm("Delete this item?")) {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (!error) setItems(items.filter(i => i.id !== id));
    }
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    setSavingCat(true);
    const payload = { ...catForm, sort_order: parseInt(catForm.sort_order) || 0 };
    if (editingCat) {
      const { error } = await supabase.from("menu_categories").update(payload).eq("id", editingCat.id);
      if (!error) setCategories(categories.map(c => c.id === editingCat.id ? { ...c, ...payload } : c));
    } else {
      const { data, error } = await supabase.from("menu_categories").insert([payload]).select();
      if (data) setCategories([...categories, data[0]]);
    }
    setSavingCat(false);
    setCatModalOpen(false);
  };

  const filteredItems = items
    .filter(i => catFilter === "All" || i.category === catFilter)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-slate-800">Menu Builder</h1>
        <div className="flex gap-3">
          <button onClick={openAddItem} className="px-6 py-2.5 bg-[#FC687D] text-white text-sm font-bold rounded-full">+ Add Item</button>
          <button onClick={() => { setEditingCat(null); setCatForm(emptyCategory); setCatModalOpen(true); }} className="px-6 py-2.5 bg-white border border-rose-200 text-[#FC687D] text-sm font-bold rounded-full">+ Add Category</button>
        </div>
      </header>

      <div className="flex gap-4 mb-8">
        <button onClick={() => setActiveTab("items")} className={`px-6 py-3 rounded-xl text-sm font-bold ${activeTab === "items" ? "bg-white text-[#FC687D] shadow-sm" : "text-slate-500"}`}>Menu Items</button>
        <button onClick={() => setActiveTab("categories")} className={`px-6 py-3 rounded-xl text-sm font-bold ${activeTab === "categories" ? "bg-white text-[#FC687D] shadow-sm" : "text-slate-500"}`}>Categories</button>
      </div>

      {activeTab === "items" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-3xl p-4 border border-rose-50 shadow-sm flex flex-col">
              <div className="h-40 bg-slate-100 rounded-2xl mb-4 overflow-hidden">
                {item.image_url && <img src={item.image_url} className="w-full h-full object-cover" />}
              </div>
              <h3 className="font-bold text-slate-800">{item.name}</h3>
              <p className="text-xs text-slate-400 uppercase mb-4">{item.category}</p>
              <div className="mt-auto flex gap-2">
                <button onClick={() => openEditItem(item)} className="flex-1 py-2 bg-slate-50 text-xs font-bold rounded-lg hover:bg-rose-50 transition">Edit</button>
                <button onClick={() => toggleItemStatus(item)} className="flex-1 py-2 bg-slate-50 text-xs font-bold rounded-lg">{item.is_available ? "Disable" : "Enable"}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat.id} className="bg-white p-5 rounded-2xl border border-rose-50 flex justify-between items-center">
              <span className="font-bold">{cat.icon} {cat.name}</span>
              <button onClick={() => { setEditingCat(cat); setCatForm(cat); setCatModalOpen(true); }} className="text-xs font-bold text-[#FC687D]">Edit</button>
            </div>
          ))}
        </div>
      )}

      {/* ITEM MODAL */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">{editingItem ? "Edit Item" : "Add Item"}</h2>
            <form onSubmit={saveItem} className="space-y-4">
              <input required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Item Name" className="w-full border p-3 rounded-xl" />
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: e.target.value })} placeholder="Price" className="w-full border p-3 rounded-xl" />
                <select required value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} className="w-full border p-3 rounded-xl">
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setItemModalOpen(false)} className="flex-1 py-3 bg-slate-100 rounded-full font-bold">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-[#FC687D] text-white rounded-full font-bold">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">Category</h2>
            <form onSubmit={saveCategory} className="space-y-4">
              <input required value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} placeholder="Category Name" className="w-full border p-3 rounded-xl" />
              <input value={catForm.icon} onChange={e => setCatForm({ ...catForm, icon: e.target.value })} placeholder="Emoji Icon" className="w-full border p-3 rounded-xl" />
              <button type="submit" className="w-full py-3 bg-[#FC687D] text-white rounded-full font-bold">Save Category</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}