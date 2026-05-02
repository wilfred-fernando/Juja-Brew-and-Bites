"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase (Ensure your .env.local has these variables set)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Menu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Signature");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the menu items directly from Supabase
  useEffect(() => {
    async function fetchMenuFromSupabase() {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("id", { ascending: true });

      if (error) {
        console.error("Error fetching menu:", error);
      } else if (data) {
        setItems(data);
        
        // Dynamically generate the category list based on the database items
        const uniqueCategories = [...new Set(data.map((item) => item.category))];
        setCategories(uniqueCategories);
        
        if (uniqueCategories.length > 0 && !uniqueCategories.includes(activeCategory)) {
          setActiveCategory(uniqueCategories[0]);
        }
      }
      
      setIsLoading(false);
    }

    fetchMenuFromSupabase();
  }, [activeCategory]);

  const displayedItems = items.filter(
    (item) => item.category === activeCategory
  );

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-[#1A1A1A] font-sans pb-20">
      {/* Header Section */}
      <header className="bg-[#1A1A1A] text-white py-16 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Juja <span className="text-[#1EBBA3]">Menu</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Explore our extensive selection of fresh bakes, hot meals, and signature drinks.
        </p>
      </header>

      {/* Main Layout: Sidebar + Grid */}
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-10">
        
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="md:sticky md:top-24 flex md:flex-col overflow-x-auto hide-scrollbar border-b md:border-b-0 md:border-r border-gray-300 md:pr-6 pb-4 md:pb-0">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap md:whitespace-normal text-left px-6 py-4 font-semibold transition-colors duration-200 border-b-4 md:border-b-0 md:border-l-4 rounded-none ${
                  activeCategory === category
                    ? "border-[#1EBBA3] text-[#1EBBA3] bg-gray-50 md:bg-transparent"
                    : "border-transparent text-gray-500 hover:text-[#1A1A1A] hover:bg-gray-50 md:hover:bg-transparent"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </aside>

        {/* Menu Grid Content */}
        <main className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-[#1EBBA3] rounded-none animate-spin"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {displayedItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-gray-200 p-6 flex flex-col justify-between hover:shadow-lg transition-shadow rounded-none"
                >
                  <div>
                    {item.is_featured && (
                      <span className="text-xs font-bold text-[#1EBBA3] uppercase tracking-wider mb-2 block">
                        Featured
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
                      {item.name}
                    </h3>
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-700">
                      ₱{item.price}
                    </span>
                    <button className="bg-[#1A1A1A] text-white px-6 py-2 text-sm font-bold hover:bg-[#1EBBA3] transition-colors rounded-none shadow-sm hover:-translate-y-0.5">
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Empty State Guard */}
          {!isLoading && displayedItems.length === 0 && (
            <div className="text-center py-20 text-gray-500 border border-gray-200 bg-white">
              No items found in this category.
            </div>
          )}
        </main>

      </div>
    </div>
  );
}