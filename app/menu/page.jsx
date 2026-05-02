"use client";

import { useState, useEffect } from "react";
import { menuCategories, getMenuItems } from "../api/entities";

export default function Menu() {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Signature");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the menu items when the page loads
  useEffect(() => {
    getMenuItems().then((data) => {
      setItems(data);
      setIsLoading(false);
    });
  }, []);

  // Filter the items based on the selected tab
  const displayedItems = items.filter(
    (item) => item.category === activeCategory
  );

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-[#1A1A1A] font-sans pb-20">
      {/* Header Section */}
      <header className="bg-[#1A1A1A] text-white py-16 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Our <span className="text-[#1EBBA3]">Menu</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Explore our extensive selection of fresh bakes, hot meals, and signature drinks.
        </p>
      </header>

      {/* Tab Navigation (Square & Scrollable for Mobile) */}
      <nav className="border-b border-gray-300 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto hide-scrollbar">
          {menuCategories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`whitespace-nowrap px-8 py-4 font-semibold transition-colors duration-200 border-b-4 rounded-none ${
                activeCategory === category
                  ? "border-[#1EBBA3] text-[#1EBBA3] bg-gray-50"
                  : "border-transparent text-gray-500 hover:text-[#1A1A1A] hover:bg-gray-50"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </nav>

      {/* Menu Grid */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-[#1EBBA3] rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <button className="bg-[#1A1A1A] text-white px-6 py-2 text-sm font-bold hover:bg-[#1EBBA3] transition-colors rounded-none">
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Empty State Guard */}
        {!isLoading && displayedItems.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            No items found in this category.
          </div>
        )}
      </main>
    </div>
  );
}