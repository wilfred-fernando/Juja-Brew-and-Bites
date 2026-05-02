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

  // Group items by category for the display
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto font-mono">
      <header className="mb-10 border-b-4 border-[#1A1A1A] pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
            MENU <span className="text-[#1EBBA3]">SYSTEM</span>
          </h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
            Global Control Panel
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/add-item" className="bg-[#1A1A1A] text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors rounded-none">
            + New Item
          </Link>
          <button className="border-2 border-[#1A1A1A] text-[#1A1A1A] px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-white transition-colors rounded-none">
            Manage Categories
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="py-20 text-center animate-pulse uppercase text-xs">Accessing Database...</div>
      ) : (
        <div className="space-y-12">
          {Object.keys(groupedItems).map((category) => (
            <section key={category}>
              <div className="flex items-center gap-4 mb-4">
                <h2 className="bg-[#1EBBA3] text-white px-3 py-1 text-xs font-bold uppercase tracking-widest">
                  {category}
                </h2>
                <div className="h-[2px] flex-1 bg-gray-200"></div>
                <span className="text-[10px] text-gray-400 font-bold">{groupedItems[category].length} ITEMS</span>
              </div>

              <div className="bg-white border border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#1A1A1A] text-[10px] uppercase font-bold text-gray-400">
                      <th className="p-4">Item Name</th>
                      <th className="p-4">Base Price</th>
                      <th className="p-4">Options</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {groupedItems[category].map((item) => (
                      <tr key={item.id} className="group hover:bg-[#F9F7F2]">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sm uppercase tracking-tight">{item.name}</span>
                            {item.is_featured && <span className="w-2 h-2 bg-[#1EBBA3]"></span>}
                          </div>
                        </td>
                        <td className="p-4 text-sm">₱{Number(item.price).toFixed(2)}</td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            {item.option_groups?.map((og, idx) => (
                              <span key={idx} className="text-[9px] border border-gray-200 px-1 text-gray-400 uppercase font-bold">
                                {og.name}
                              </span>
                            )) || <span className="text-[9px] text-gray-300 italic">No Options</span>}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button className="text-[10px] font-bold text-gray-400 hover:text-red-600 uppercase transition-colors">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}