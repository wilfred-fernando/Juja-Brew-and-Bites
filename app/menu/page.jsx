"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Menu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
        // Filter out the Pastries and Dubai Chewy categories right away
        const filteredData = data.filter(
          (item) => item.category !== "Signature" && item.category !== "Pastries"
        );

        setItems(filteredData);
        
        // Dynamically generate the left-side category list
        const uniqueCategories = [...new Set(filteredData.map((item) => item.category))];
        setCategories(uniqueCategories);
        
        // Set the first available category as active
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
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans pb-20">
      
      {/* Header Section */}
      <header className="bg-[#1A1A1A] text-white py-12 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Juja <span className="text-[#1EBBA3]">Menu</span>
        </h1>
      </header>

      {/* Main Layout: Sidebar + List */}
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-56 shrink-0">
          <div className="md:sticky md:top-8 flex md:flex-col overflow-x-auto hide-scrollbar border-b md:border-b-0 md:border-r border-gray-200 md:pr-4 pb-4 md:pb-0">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap md:whitespace-normal text-left px-4 py-3 text-sm font-semibold uppercase tracking-wide transition-colors duration-200 border-b-2 md:border-b-0 md:border-l-4 rounded-none ${
                  activeCategory === category
                    ? "border-[#1EBBA3] text-[#1A1A1A] bg-gray-50"
                    : "border-transparent text-gray-400 hover:text-[#1A1A1A]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </aside>

        {/* Menu List Content */}
        <main className="flex-1">
          {isLoading ? (
             <div className="flex justify-center py-20">
             <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1EBBA3] rounded-none animate-spin"></div>
           </div>
          ) : (
            <div className="flex flex-col border-t border-gray-100">
              {displayedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {/* Square Image Box (Matches your screenshot) */}
                  <div className="w-24 h-20 bg-[#334155] flex-shrink-0 mr-6 flex items-center justify-center">
                    {/* If you add an image_url column to Supabase later, use an <img> tag here */}
                  </div>

                  {/* Text Details */}
                  <div className="flex flex-col justify-center">
                    <h3 className="text-base font-medium text-[#1A1A1A] uppercase tracking-wide">
                      {item.name}
                    </h3>
                    <span className="text-sm text-gray-600 mt-1">
                      ₱{Number(item.price).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!isLoading && displayedItems.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              No items available.
            </div>
          )}
        </main>

      </div>
    </div>
  );
}