"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
      
      // Extract unique categories for the dropdown
      const uniqueCategories = [...new Set(data.map(item => item.category))];
      setCategories(uniqueCategories);
      
      // Set the first category as active by default
      if (uniqueCategories.length > 0) {
        setActiveCategory(uniqueCategories[0]);
      }
    }
    setIsLoading(false);
  }

  // Filter items based on the active dropdown selection
  const displayedItems = items.filter(item => item.category === activeCategory);

  return (
    <div className="max-w-6xl mx-auto font-mono">
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
          <Link 
            href="/admin/add-item" 
            className="group relative px-6 py-3 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(30,187,163,0.3)] hover:-translate-y-0.5 rounded-sm"
          >
            <div className="absolute inset-0 bg-[#1EBBA3] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            <span className="relative z-10 flex items-center gap-2">
              <span>+</span> New Item
            </span>
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="py-32 flex justify-center items-center">
           <div className="w-8 h-8 border-2 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-full"></div>
        </div>
      ) : (
        <>
          {/* Custom Styled Dropdown Filter */}
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
                {/* Custom Teal Dropdown Arrow */}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#1EBBA3]">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>
            
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-sm">
              {displayedItems.length} Items Listed
            </span>
          </div>

          {/* Active Category Item List */}
          <div 
            key={activeCategory} 
            className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out"
          >
            {displayedItems.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-lg">
                No items in this category.
              </div>
            ) : (
              displayedItems.map((item) => (
                <div 
                  key={item.id} 
                  className="group relative flex items-center justify-between p-5 bg-white border border-gray-100 rounded-lg transition-all duration-300 ease-out hover:border-transparent hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 overflow-hidden"
                >
                  {/* Hover Accent Line */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1EBBA3] opacity-0 -translate-x-full group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out"></div>

                  {/* Item Info */}
                  <div className="flex items-center gap-5 pl-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm uppercase tracking-wide text-[#1A1A1A] group-hover:text-[#1EBBA3] transition-colors duration-300">
                          {item.name}
                        </span>
                        {item.is_featured && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1EBBA3] shadow-[0_0_8px_rgb(30,187,163,0.6)]"></span>
                        )}
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

                  {/* Price and Actions */}
                  <div className="flex items-center gap-8">
                    <span className="text-sm font-bold text-[#1A1A1A]">
                      ₱{Number(item.price).toFixed(2)}
                    </span>
                    
                    {/* Actions reveal smoothly on hover */}
                    <div className="flex gap-3 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out">
                      <button className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-100 rounded-sm uppercase tracking-widest transition-colors duration-200">
                        Edit
                      </button>
                      <button className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-sm uppercase tracking-widest transition-colors duration-200">
                        Remove
                      </button>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}