"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
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

    if (!error && data) setItems(data);
    setIsLoading(false);
  }

  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto font-mono">
      {/* High-End Header */}
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
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
        <div className="space-y-16">
          {Object.keys(groupedItems).map((category) => (
            <section key={category} className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
              
              {/* Minimalist Category Header */}
              <div className="flex items-center gap-6 mb-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#1A1A1A]">
                  {category}
                </h2>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-200 to-transparent"></div>
                <span className="text-xs text-gray-400 font-medium tracking-widest">
                  {groupedItems[category].length} ITEMS
                </span>
              </div>

              {/* High-End List Container */}
              <div className="flex flex-col gap-3">
                {groupedItems[category].map((item) => (
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
                            <span key={idx} className="text-[9px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-sm uppercase font-semibold tracking-wider">
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
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}