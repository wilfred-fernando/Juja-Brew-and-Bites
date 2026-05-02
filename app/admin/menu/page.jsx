"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .order("category", { ascending: true });

    if (!error && data) {
      setItems(data);
      const uniqueCategories = [...new Set(data.map(item => item.category))];
      setCategories(uniqueCategories);
      
      if (uniqueCategories.length > 0 && !activeCategory) {
        setActiveCategory(uniqueCategories[0]);
      }
    }
    setIsLoading(false);
  }

  const displayedItems = items.filter(item => item.category === activeCategory);

  return (
    <div className="max-w-6xl mx-auto font-mono relative">
      {/* High-End Header */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
            Menu <span className="text-[#1EBBA3] font-light tracking-widest">System</span>
          </h1>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-2">
            Global Control Panel
          </p>
        </div>

        <div className="flex gap-4">
          <button className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-[#1A1A1A] transition-colors duration-300">
            Manage Categories
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="group relative px-6 py-3 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(30,187,163,0.3)] hover:-translate-y-0.5 rounded-sm"
          >
            <div className="absolute inset-0 bg-[#1EBBA3] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            <span className="relative z-10 flex items-center gap-2">
              <span>+</span> New Item
            </span>
          </button>
        </div>
      </header>

      {/* Dropdown & Item List */}
      {isLoading ? (
        <div className="py-32 flex justify-center items-center">
           <div className="w-8 h-8 border-2 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-full"></div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden md:block">
                Select Category:
              </label>
              <div className="relative">
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 text-[#1A1A1A] text-xs font-bold uppercase tracking-widest py-3 pl-5 pr-12 hover:border-[#1EBBA3] focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all duration-300 cursor-pointer rounded-sm shadow-sm"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#1EBBA3]">
                  ▼
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-sm">
              {displayedItems.length} Items Listed
            </span>
          </div>

          <div key={activeCategory} className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
            {displayedItems.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-lg">
                No items in this category.
              </div>
            ) : (
              displayedItems.map((item) => (
                <div key={item.id} className="group relative flex items-center justify-between p-5 bg-white border border-gray-100 rounded-lg transition-all duration-300 ease-out hover:border-transparent hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1EBBA3] opacity-0 -translate-x-full group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out"></div>
                  <div className="flex items-center gap-5 pl-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm uppercase tracking-wide text-[#1A1A1A] group-hover:text-[#1EBBA3] transition-colors duration-300">
                          {item.name}
                        </span>
                        {item.is_featured && <span className="w-1.5 h-1.5 rounded-full bg-[#1EBBA3] shadow-[0_0_8px_rgb(30,187,163,0.6)]"></span>}
                      </div>
                      <div className="flex gap-2 mt-1.5">
                        {item.option_groups?.map((og, idx) => (
                          <span key={idx} className="text-[9px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-sm uppercase font-semibold tracking-wider border border-gray-100">
                            {og.name}
                          </span>
                        )) || <span className="text-[10px] text-gray-300 font-light italic">Standard Item</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <span className="text-sm font-bold text-[#1A1A1A]">₱{Number(item.price).toFixed(2)}</span>
                    <div className="flex gap-3 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out">
                      <button className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-100 rounded-sm uppercase tracking-widest transition-colors duration-200">Edit</button>
                      <button className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-sm uppercase tracking-widest transition-colors duration-200">Remove</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* --- POPUP MODAL COMPONENT --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-start overflow-y-auto bg-[#1A1A1A]/60 backdrop-blur-sm p-4 md:p-8">
          
          {/* Modal Container */}
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 mt-10 mb-10 overflow-hidden">
            
            {/* Close Button */}
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-[#1A1A1A] transition-colors z-20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Embedded Form */}
            <AddItemForm 
              onClose={() => setIsModalOpen(false)} 
              onSuccess={() => {
                setIsModalOpen(false);
                fetchItems(); // Refresh the list instantly
              }} 
            />
          </div>

        </div>
      )}
    </div>
  );
}


// --- THE ADD ITEM FORM LOGIC ---
function AddItemForm({ onClose, onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("Cookies");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sizes, setSizes] = useState([{ id: "1", name: "", price: "", isDefault: true }]);

  const categories = ["Signature", "Cookies", "Pastries", "Coffee", "Non-Coffee", "Frappe", "Rice Meal", "Pasta", "Snacks"];

  const handleSizeChange = (id, field, value) => setSizes(sizes.map(size => size.id === id ? { ...size, [field]: value } : size));
  const handleSetDefault = (id) => setSizes(sizes.map(size => ({ ...size, isDefault: size.id === id })));
  const addSize = () => setSizes([...sizes, { id: Date.now().toString(), name: "", price: "", isDefault: sizes.length === 0 }]);
  const removeSize = (id) => {
    if (sizes.length === 1) return;
    const newSizes = sizes.filter(size => size.id !== id);
    if (!newSizes.find(s => s.isDefault) && newSizes.length > 0) newSizes[0].isDefault = true;
    setSizes(newSizes);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const validSizes = sizes.filter(s => s.name.trim() !== "" && s.price !== "");
    if (validSizes.length === 0) {
      setError("You must add at least one valid size and price.");
      setIsSubmitting(false);
      return;
    }

    const optionGroups = [{
      name: "Size",
      description: "Select your variation",
      required: true,
      choices: validSizes.map(s => ({
        label: s.name,
        price_adjustment: Number(s.price) || 0,
        isDefault: s.isDefault
      }))
    }];

    const newItem = {
      name, category, price: 0, is_featured: false, status: "available", option_groups: optionGroups
    };

    const { error: dbError } = await supabase.from("menu_items").insert([newItem]);

    if (dbError) {
      setError("Failed to save item. Check connection.");
      setIsSubmitting(false);
    } else {
      onSuccess(); // Close modal and refresh parent
    }
  };

  return (
    <div className="p-8 md:p-12">
      <header className="mb-8">
        <h2 className="text-2xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
          Add <span className="text-[#1EBBA3] font-light tracking-widest">Item</span>
        </h2>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-1">
          Create a new product variation
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-bold tracking-widest uppercase border-l-4 border-red-500">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-8">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Category</label>
          <div className="relative">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full appearance-none bg-gray-50 border border-gray-200 text-[#1A1A1A] text-sm font-bold uppercase tracking-widest p-4 hover:border-[#1EBBA3] focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all duration-300 rounded-md cursor-pointer">
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#1EBBA3]">▼</div>
          </div>
        </div>

        <div className="space-y-6 mb-10">
          <div className="relative">
            <input type="text" id="itemName" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="block w-full px-4 py-4 text-sm text-[#1A1A1A] bg-transparent rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[#1EBBA3] peer font-bold placeholder-transparent" placeholder="Item Name" />
            <label htmlFor="itemName" className="absolute text-xs text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-[#1EBBA3] peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-3 uppercase tracking-widest cursor-text">Name</label>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">{name.length}/100</div>
          </div>

          <div className="relative mt-8">
            <textarea id="itemDesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} className="block w-full px-4 py-4 text-sm text-[#1A1A1A] bg-transparent rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[#1EBBA3] peer resize-none placeholder-transparent" placeholder="Description" />
            <label htmlFor="itemDesc" className="absolute text-xs text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-[#1EBBA3] peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-6 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-3 uppercase tracking-widest cursor-text">Description</label>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">{description.length}/300</div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-100">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Variations & Pricing</label>
          <div className="space-y-4">
            {sizes.map((size, index) => (
              <div key={size.id} className="flex flex-col md:flex-row items-center gap-4 group">
                <div className="relative w-full md:flex-1">
                  <input type="text" required value={size.name} onChange={(e) => handleSizeChange(size.id, "name", e.target.value)} maxLength={80} placeholder={index === 0 ? "Smallest size" : "Size"} className="w-full border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-md transition-colors placeholder-gray-300" />
                  <div className="absolute right-2 bottom-1 text-[8px] text-gray-400">{size.name.length}/80</div>
                </div>
                <div className="relative w-full md:w-32 shrink-0">
                  <span className="absolute left-3 top-3 text-gray-400 text-sm">₱</span>
                  <input type="number" required min="0" step="0.01" value={size.price} onChange={(e) => handleSizeChange(size.id, "price", e.target.value)} placeholder="Price" className="w-full border border-gray-300 p-3 pl-8 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-md transition-colors placeholder-gray-300" />
                </div>
                <div className="flex items-center justify-between w-full md:w-auto gap-4 shrink-0 pl-2">
                  <label className="flex items-center cursor-pointer gap-2">
                    <input type="radio" name="defaultSize" checked={size.isDefault} onChange={() => handleSetDefault(size.id)} className="w-4 h-4 accent-[#1EBBA3] cursor-pointer" />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 whitespace-nowrap">Pre-selected</span>
                  </label>
                  <button type="button" onClick={() => removeSize(size.id)} disabled={sizes.length === 1} className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addSize} className="mt-4 text-xs font-bold text-[#1EBBA3] hover:text-[#1A1A1A] underline decoration-2 underline-offset-4 uppercase tracking-widest transition-colors inline-block">Add Size</button>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-100 flex justify-end items-center gap-6">
          <button type="button" onClick={onClose} className="text-xs font-bold text-[#1A1A1A] hover:text-gray-500 uppercase tracking-widest transition-colors underline underline-offset-4">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="bg-[#1EBBA3] text-white px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#159a85] transition-all duration-300 rounded-md shadow-sm disabled:opacity-70 flex items-center gap-2">
            {isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : null}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}