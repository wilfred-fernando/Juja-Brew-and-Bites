"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminMenuBuilder() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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
    }
    setIsLoading(false);
  }

  async function deleteItem(id, name) {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", id);

      if (error) {
        alert("Error deleting item");
      } else {
        setItems(items.filter((item) => item.id !== id));
      }
    }
  }

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header with Search and Add Action */}
      <header className="mb-8 border-b-4 border-[#1A1A1A] pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">
            Menu <span className="text-[#1EBBA3]">Builder</span>
          </h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
            Manage your items and options
          </p>
        </div>

        <div className="flex gap-4 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="SEARCH ITEMS..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-300 px-4 py-2 text-xs uppercase tracking-widest focus:outline-none focus:border-[#1EBBA3] w-full md:w-64 rounded-none"
          />
          <Link 
            href="/admin/add-item" 
            className="bg-[#1EBBA3] text-white px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-[#1A1A1A] transition-colors whitespace-nowrap rounded-none shadow-sm"
          >
            + Add Item
          </Link>
        </div>
      </header>

      {/* Items Table/List */}
      <div className="bg-white border border-[#1A1A1A] shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1A1A1A] text-white text-[10px] uppercase tracking-[0.2em]">
              <th className="p-4 font-bold">Item Details</th>
              <th className="p-4 font-bold">Category</th>
              <th className="p-4 font-bold">Price</th>
              <th className="p-4 font-bold">Options</th>
              <th className="p-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan="5" className="p-20 text-center">
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-[#1EBBA3] animate-spin mx-auto"></div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-20 text-center text-gray-400 uppercase tracking-widest text-xs">
                  No items found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-10 bg-[#334155] shrink-0 flex items-center justify-center text-[10px] text-white font-bold">
                        IMG
                      </div>
                      <div>
                        <p className="font-bold text-[#1A1A1A] uppercase text-sm tracking-wide">{item.name}</p>
                        {item.is_featured && <span className="text-[9px] bg-[#1EBBA3] text-white px-1.5 py-0.5 font-bold uppercase tracking-tighter">Featured</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {item.category}
                  </td>
                  <td className="p-4 text-sm font-bold text-[#1A1A1A]">
                    ₱{Number(item.price).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span className="text-[10px] font-bold text-gray-400 border border-gray-200 px-2 py-1 uppercase">
                      {item.option_groups ? `${item.option_groups.length} Groups` : 'No Options'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => deleteItem(item.id, item.name)}
                        className="text-gray-400 hover:text-red-600 p-2 transition-colors uppercase text-[10px] font-bold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}