"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AddMenuItem() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Basic Details State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Coffee");
  const [price, setPrice] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);

  // Dynamic Option Groups State
  const [optionGroups, setOptionGroups] = useState([]);

  // Pre-defined categories for the dropdown
  const categories = [
    "Signature", "Chicken", "Rice in a Box", "Rice Meal", "All Day Breakfast", 
    "Coffee", "Non-Coffee", "Signature Drinks", "Frappe", "Milk Tea", 
    "Snacks", "Waffle", "Pasta", "Croffle", "Group Tray"
  ];

  // --- DYNAMIC FORM HANDLERS ---
  const addOptionGroup = () => {
    setOptionGroups([
      ...optionGroups,
      {
        id: Date.now().toString(), // Unique ID for React mapping
        name: "",
        description: "",
        required: true,
        choices: [{ id: Date.now().toString() + "-choice", label: "", price_adjustment: 0 }]
      }
    ]);
  };

  const removeOptionGroup = (groupId) => {
    setOptionGroups(optionGroups.filter(g => g.id !== groupId));
  };

  const updateGroup = (groupId, field, value) => {
    setOptionGroups(optionGroups.map(g => 
      g.id === groupId ? { ...g, [field]: value } : g
    ));
  };

  const addChoice = (groupId) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          choices: [...g.choices, { id: Date.now().toString(), label: "", price_adjustment: 0 }]
        };
      }
      return g;
    }));
  };

  const removeChoice = (groupId, choiceId) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        return { ...g, choices: g.choices.filter(c => c.id !== choiceId) };
      }
      return g;
    }));
  };

  const updateChoice = (groupId, choiceId, field, value) => {
    setOptionGroups(optionGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          choices: g.choices.map(c => c.id === choiceId ? { ...c, [field]: value } : c)
        };
      }
      return g;
    }));
  };

  // --- SUBMIT TO SUPABASE ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage("");

    // Clean up the data to exactly match the JSON structure we established
    const formattedOptionGroups = optionGroups.map(g => ({
      name: g.name,
      description: g.description,
      required: g.required,
      choices: g.choices.map(c => ({
        label: c.label,
        price_adjustment: Number(c.price_adjustment) || 0
      }))
    }));

    const newItem = {
      name,
      category,
      price: Number(price) || 0,
      is_featured: isFeatured,
      status: "available",
      // Only include option_groups if the user actually added some
      option_groups: formattedOptionGroups.length > 0 ? formattedOptionGroups : null
    };

    const { error } = await supabase.from("menu_items").insert([newItem]);

    if (error) {
      console.error("Error saving item:", error);
      alert("Failed to save item. Check the console.");
    } else {
      setSuccessMessage(`${name} has been added to the menu!`);
      // Reset form
      setName("");
      setPrice("");
      setOptionGroups([]);
      setIsFeatured(false);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-[#1A1A1A] font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        
        <header className="mb-8 border-b-4 border-[#1A1A1A] pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">Merchant <span className="text-[#1EBBA3]">Entry</span></h1>
            <p className="text-gray-500 uppercase text-sm font-semibold tracking-wider mt-1">Add New Menu Item</p>
          </div>
        </header>

        {successMessage && (
          <div className="bg-[#1EBBA3] text-white p-4 mb-6 font-bold uppercase tracking-wide">
            ✓ {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* --- BASIC DETAILS CARD --- */}
          <div className="bg-white border border-[#1A1A1A] p-6 shadow-sm rounded-none">
            <h2 className="text-lg font-bold bg-[#1A1A1A] text-white inline-block px-4 py-1 mb-6 uppercase tracking-wider">Item Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Item Name</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 p-3 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-colors rounded-none" 
                  placeholder="e.g. Vanilla Latte"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Category</label>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 p-3 focus:outline-none focus:border-[#1EBBA3] appearance-none rounded-none bg-white"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Base Price (₱)</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full border border-gray-300 p-3 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-colors rounded-none" 
                  placeholder="0.00"
                />
              </div>
            </div>

            <label className="flex items-center mt-6 cursor-pointer group w-max">
              <input 
                type="checkbox" 
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="w-5 h-5 accent-[#1EBBA3] cursor-pointer" 
              />
              <span className="ml-3 text-sm font-bold uppercase tracking-wider text-gray-600 group-hover:text-black transition-colors">
                Mark as Featured Item
              </span>
            </label>
          </div>

          {/* --- OPTION GROUPS BUILDER --- */}
          <div className="bg-white border border-[#1A1A1A] p-6 shadow-sm rounded-none">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-lg font-bold bg-[#1A1A1A] text-white inline-block px-4 py-1 uppercase tracking-wider">Option Groups</h2>
              <button 
                type="button" 
                onClick={addOptionGroup}
                className="bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-white transition-colors rounded-none"
              >
                + Add Group
              </button>
            </div>

            {optionGroups.length === 0 ? (
              <p className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 uppercase tracking-widest text-sm">
                No option groups added. Item will be sold as-is.
              </p>
            ) : (
              <div className="space-y-8">
                {optionGroups.map((group, groupIdx) => (
                  <div key={group.id} className="border border-gray-300 p-4 bg-gray-50 relative group/card">
                    
                    {/* Delete Group Button */}
                    <button 
                      type="button" 
                      onClick={() => removeOptionGroup(group.id)}
                      className="absolute -top-3 -right-3 bg-red-500 text-white w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors rounded-none opacity-0 group-hover/card:opacity-100 shadow-md"
                      title="Delete Option Group"
                    >✕</button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <input 
                          type="text" 
                          required
                          value={group.name}
                          onChange={(e) => updateGroup(group.id, "name", e.target.value)}
                          className="w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-none font-bold placeholder-gray-400" 
                          placeholder="Group Name (e.g., Size)"
                        />
                      </div>
                      <div>
                        <input 
                          type="text" 
                          value={group.description}
                          onChange={(e) => updateGroup(group.id, "description", e.target.value)}
                          className="w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-none placeholder-gray-400" 
                          placeholder="Description (e.g., Cup Size)"
                        />
                      </div>
                    </div>

                    <label className="flex items-center mb-4 cursor-pointer w-max">
                      <input 
                        type="checkbox" 
                        checked={group.required}
                        onChange={(e) => updateGroup(group.id, "required", e.target.checked)}
                        className="w-4 h-4 accent-[#8B5CF6] cursor-pointer" 
                      />
                      <span className="ml-2 text-xs font-bold uppercase tracking-wider text-[#8B5CF6]">
                        Customer must select exactly one option (Radio Button)
                      </span>
                    </label>

                    {/* Choices Builder */}
                    <div className="bg-white border border-gray-200 p-4">
                      <div className="space-y-3">
                        {group.choices.map((choice, choiceIdx) => (
                          <div key={choice.id} className="flex gap-3 items-center">
                            <input 
                              type="text" 
                              required
                              value={choice.label}
                              onChange={(e) => updateChoice(group.id, choice.id, "label", e.target.value)}
                              className="flex-1 border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-none" 
                              placeholder="Choice Label (e.g., Iced R)"
                            />
                            <div className="relative w-32">
                              <span className="absolute left-3 top-2 text-gray-500 text-sm">₱</span>
                              <input 
                                type="number" 
                                min="0" step="0.01"
                                value={choice.price_adjustment}
                                onChange={(e) => updateChoice(group.id, choice.id, "price_adjustment", e.target.value)}
                                className="w-full border border-gray-300 py-2 pr-2 pl-7 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-none" 
                              />
                            </div>
                            <button 
                              type="button" 
                              onClick={() => removeChoice(group.id, choice.id)}
                              disabled={group.choices.length === 1}
                              className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <button 
                        type="button" 
                        onClick={() => addChoice(group.id)}
                        className="mt-4 text-xs font-bold text-[#1EBBA3] hover:text-[#1A1A1A] uppercase tracking-widest transition-colors flex items-center gap-1"
                      >
                        <span>+</span> Add Choice
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-[#1EBBA3] text-white h-16 text-lg font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.99] transition-all rounded-none shadow-md disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving to Database...
              </>
            ) : (
              "Save Menu Item"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}