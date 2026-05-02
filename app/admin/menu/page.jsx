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
      
      // Extract unique categories for the tabs
      const uniqueCategories = [...new Set(data.map(item => item.category))];
      setCategories(uniqueCategories);
      
      // Set the first category as active by default
      if (uniqueCategories.length > 0) {
        setActiveCategory(uniqueCategories[0]);
      }
    }
    setIsLoading(false);
  }

  // Filter items based on the active tab
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
          {/* Category Tabs Navigation */}
          <div className="flex overflow-x-auto hide-scrollbar border-b border-gray-200 mb-8 gap-8">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`pb-4 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300 whitespace-nowrap relative ${
                  activeCategory === category
                    ? "text-[#1A1A1A]"
                    : "text-gray-400 hover:text-[#1A1A1A]"
                }`}
              >
                {category}
                {/* Active Tab Underline */}
                {activeCategory === category && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1EBBA3] animate-in fade-in slide-in-from-left-4 duration-300"></div>
                )}
              </button>
            ))}
          </div>

          {/* Active Category Item List */}
          <div 
            key={activeCategory} // Forces re-render animation when tab changes
            className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out"
          >
            {displayedItems.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
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