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

  // Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  
  // Tracks the user's selected choices { "Size": { label: "HOT (R)", price_adjustment: 10 } }
  const [selectedChoices, setSelectedChoices] = useState({});

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
        const filteredData = data.filter(
          (item) => item.category !== "Signature" && item.category !== "Pastries"
        );

        setItems(filteredData);
        
        const uniqueCategories = [...new Set(filteredData.map((item) => item.category))];
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

  // --- MODAL & OPTION LOGIC ---
  const openModal = (item) => {
    setSelectedItem(item);
    setQuantity(1);
    
    // Automatically select the first choice for "Required" groups
    const defaultChoices = {};
    if (item.option_groups && Array.isArray(item.option_groups)) {
      item.option_groups.forEach(group => {
        if (group.required && group.choices && group.choices.length > 0) {
          defaultChoices[group.name] = group.choices[0];
        }
      });
    }
    setSelectedChoices(defaultChoices);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setSelectedChoices({});
  };

  const handleOptionSelect = (groupName, choice) => {
    setSelectedChoices(prev => ({
      ...prev,
      [groupName]: choice
    }));
  };

  // Calculate final price: (Base Price + Sum of Selected Adjustments) * Quantity
  const calculateTotal = () => {
    if (!selectedItem) return 0;
    let optionsTotal = 0;
    
    Object.values(selectedChoices).forEach(choice => {
      if (choice && choice.price_adjustment) {
        optionsTotal += Number(choice.price_adjustment);
      }
    });

    return ((Number(selectedItem.price) + optionsTotal) * quantity).toFixed(2);
  };

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans pb-20 relative">
      
      <header className="bg-[#1A1A1A] text-white py-12 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Juja <span className="text-[#1EBBA3]">Menu</span>
        </h1>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
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

        {/* Menu Grid */}
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
                  onClick={() => openModal(item)}
                  className="flex items-center py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="w-24 h-20 bg-[#334155] flex-shrink-0 mr-6 flex items-center justify-center"></div>
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
        </main>
      </div>

      {/* --- DYNAMIC POPUP MODAL --- */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md flex flex-col rounded-none shadow-2xl overflow-hidden max-h-[90vh]">
            
            <div className="relative h-64 bg-[#334155] flex items-center justify-center">
              <button 
                onClick={closeModal}
                className="absolute top-4 left-4 bg-black/50 text-white w-10 h-10 flex items-center justify-center hover:bg-black/80 transition-colors rounded-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold uppercase tracking-wide text-[#1A1A1A]">
                  {selectedItem.name}
                </h2>
                <span className="text-lg text-gray-700">
                  ₱{Number(selectedItem.price).toFixed(2)}
                </span>
              </div>

              {/* DYNAMIC OPTION GROUPS MAPPING */}
              {selectedItem.option_groups && Array.isArray(selectedItem.option_groups) && (
                <div className="space-y-6">
                  {selectedItem.option_groups.map((group, groupIdx) => (
                    <div key={groupIdx} className="border-t border-gray-200 pt-4">
                      
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h3 className="font-bold text-[#1A1A1A] text-sm tracking-widest uppercase">{group.name}</h3>
                          <p className="text-xs text-gray-400 uppercase">{group.description}</p>
                        </div>
                        {group.required && (
                          <span className="bg-[#8B5CF6] text-white text-[10px] font-bold px-2 py-1 rounded-none uppercase tracking-wider">
                            Required
                          </span>
                        )}
                      </div>

                      <div className="space-y-3 mt-4">
                        {group.choices.map((choice, choiceIdx) => {
                          // Check if this specific choice is currently selected in state
                          const isSelected = selectedChoices[group.name]?.label === choice.label;

                          return (
                            <label key={choiceIdx} className="flex items-center justify-between cursor-pointer group">
                              <div className="flex items-center">
                                {/* Use Radio for required (single select), could adapt for checkboxes if multiple allowed */}
                                <input 
                                  type="radio" 
                                  name={`group-${group.name}`} 
                                  checked={isSelected}
                                  onChange={() => handleOptionSelect(group.name, choice)}
                                  className="w-4 h-4 accent-[#1EBBA3]" 
                                />
                                <span className={`ml-3 text-sm group-hover:text-black ${isSelected ? 'text-black font-semibold' : 'text-gray-700'}`}>
                                  {choice.label}
                                </span>
                              </div>
                              <span className="text-sm text-gray-500">
                                {choice.price_adjustment > 0 ? `+ ₱${choice.price_adjustment.toFixed(2)}` : '+ ₱0.00'}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-4 items-center">
              <div className="flex items-center border border-gray-300 bg-white h-12 w-32 justify-between">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-black transition-colors"
                >
                  −
                </button>
                <span className="font-bold text-[#1A1A1A] text-sm">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-black transition-colors"
                >
                  +
                </button>
              </div>

              <button className="flex-1 bg-[#1EBBA3] text-white h-12 font-bold text-sm tracking-wider uppercase hover:brightness-110 transition-all active:scale-[0.98] rounded-none">
                Add to basket • ₱{calculateTotal()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}