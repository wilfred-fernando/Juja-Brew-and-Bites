"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

export default function AddItem() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form State
  const [category, setCategory] = useState("Cookies");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sizes, setSizes] = useState([
    { id: "1", name: "", price: "", isDefault: true }
  ]);

  // Pre-defined categories
  const categories = [
    "Signature", "Cookies", "Pastries", "Coffee", "Non-Coffee", 
    "Frappe", "Rice Meal", "Pasta", "Snacks"
  ];

  // --- SIZE MANAGEMENT LOGIC ---
  const handleSizeChange = (id, field, value) => {
    setSizes(sizes.map(size => 
      size.id === id ? { ...size, [field]: value } : size
    ));
  };

  const handleSetDefault = (id) => {
    setSizes(sizes.map(size => ({
      ...size,
      isDefault: size.id === id
    })));
  };

  const addSize = () => {
    setSizes([...sizes, { 
      id: Date.now().toString(), 
      name: "", 
      price: "", 
      isDefault: sizes.length === 0 
    }]);
  };

  const removeSize = (id) => {
    if (sizes.length === 1) return; // Prevent deleting the last size
    const newSizes = sizes.filter(size => size.id !== id);
    // If we deleted the default, make the first remaining one default
    if (!newSizes.find(s => s.isDefault) && newSizes.length > 0) {
      newSizes[0].isDefault = true;
    }
    setSizes(newSizes);
  };

  // --- SUBMIT TO SUPABASE ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    // Filter out empty sizes
    const validSizes = sizes.filter(s => s.name.trim() !== "" && s.price !== "");

    if (validSizes.length === 0) {
      setError("You must add at least one valid size and price.");
      setIsSubmitting(false);
      return;
    }

    // Format the sizes exactly how our public menu expects option_groups
    const optionGroups = [{
      name: "Size",
      description: "Select your variation",
      required: true,
      choices: validSizes.map(s => ({
        label: s.name,
        // The size acts as the total absolute price, so we pass it as the adjustment
        price_adjustment: Number(s.price) || 0,
        isDefault: s.isDefault
      }))
    }];

    const newItem = {
      name,
      category,
      price: 0, // Base price is 0, the size price_adjustment takes over
      is_featured: false,
      status: "available",
      option_groups: optionGroups
    };

    const { error: dbError } = await supabase.from("menu_items").insert([newItem]);

    if (dbError) {
      console.error(dbError);
      setError("Failed to save item. Check connection.");
      setIsSubmitting(false);
    } else {
      router.push("/admin/menu");
    }
  };

  return (
    <div className="max-w-3xl mx-auto font-mono pb-20">
      
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
          Add <span className="text-[#1EBBA3] font-light tracking-widest">Item</span>
        </h1>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-2">
          Create a new product variation
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold tracking-widest uppercase border-l-4 border-red-500">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 md:p-10">
        
        {/* Category Selector */}
        <div className="mb-8">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">
            Category Assignment
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 text-[#1A1A1A] text-sm font-bold uppercase tracking-widest p-4 hover:border-[#1EBBA3] focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all duration-300 rounded-md cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#1EBBA3]">
              ▼
            </div>
          </div>
        </div>

        {/* Floating Label Style Inputs (Matched from Image) */}
        <div className="space-y-6 mb-10">
          {/* Name Input */}
          <div className="relative">
            <input
              type="text"
              id="itemName"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="block w-full px-4 py-4 text-sm text-[#1A1A1A] bg-transparent rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[#1EBBA3] peer font-bold placeholder-transparent"
              placeholder="Item Name"
            />
            <label
              htmlFor="itemName"
              className="absolute text-xs text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-[#1EBBA3] peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-3 uppercase tracking-widest cursor-text"
            >
              Name
            </label>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">
              {name.length}/100
            </div>
          </div>

          {/* Description Input */}
          <div className="relative mt-8">
            <textarea
              id="itemDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              className="block w-full px-4 py-4 text-sm text-[#1A1A1A] bg-transparent rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[#1EBBA3] peer resize-none placeholder-transparent"
              placeholder="Description"
            />
            <label
              htmlFor="itemDesc"
              className="absolute text-xs text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-[#1EBBA3] peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-6 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-3 uppercase tracking-widest cursor-text"
            >
              Description
            </label>
            <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">
              {description.length}/300
            </div>
          </div>
        </div>

        {/* Dynamic Sizes Section */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
            Variations & Pricing
          </label>

          <div className="space-y-4">
            {sizes.map((size, index) => (
              <div key={size.id} className="flex flex-col md:flex-row items-center gap-4 group">
                
                {/* Size Name */}
                <div className="relative w-full md:flex-1">
                  <input
                    type="text"
                    required
                    value={size.name}
                    onChange={(e) => handleSizeChange(size.id, "name", e.target.value)}
                    maxLength={80}
                    placeholder={index === 0 ? "Smallest size" : "Size"}
                    className="w-full border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-md transition-colors placeholder-gray-300"
                  />
                  <div className="absolute right-2 bottom-1 text-[8px] text-gray-400">{size.name.length}/80</div>
                </div>

                {/* Price */}
                <div className="relative w-full md:w-32 shrink-0">
                  <span className="absolute left-3 top-3 text-gray-400 text-sm">₱</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={size.price}
                    onChange={(e) => handleSizeChange(size.id, "price", e.target.value)}
                    placeholder="Price"
                    className="w-full border border-gray-300 p-3 pl-8 text-sm focus:outline-none focus:border-[#1EBBA3] rounded-md transition-colors placeholder-gray-300"
                  />
                </div>

                {/* Pre-selected Radio & Delete */}
                <div className="flex items-center justify-between w-full md:w-auto gap-4 shrink-0 pl-2">
                  <label className="flex items-center cursor-pointer gap-2">
                    <input
                      type="radio"
                      name="defaultSize"
                      checked={size.isDefault}
                      onChange={() => handleSetDefault(size.id)}
                      className="w-4 h-4 accent-[#1EBBA3] cursor-pointer"
                    />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 whitespace-nowrap">
                      Pre-selected
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => removeSize(size.id)}
                    disabled={sizes.length === 1}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-2"
                  >
                    {/* Trash Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Size Button */}
          <button
            type="button"
            onClick={addSize}
            className="mt-4 text-xs font-bold text-[#1EBBA3] hover:text-[#1A1A1A] underline decoration-2 underline-offset-4 uppercase tracking-widest transition-colors inline-block"
          >
            Add Size
          </button>
        </div>

        {/* Action Footer */}
        <div className="mt-12 pt-6 border-t border-gray-100 flex justify-end items-center gap-6">
          <Link 
            href="/admin/menu"
            className="text-xs font-bold text-[#1A1A1A] hover:text-gray-500 uppercase tracking-widest transition-colors underline underline-offset-4"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-[#1EBBA3] text-white px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#159a85] transition-all duration-300 rounded-md shadow-sm disabled:opacity-70 flex items-center gap-2"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : null}
            Save
          </button>
        </div>

      </form>
    </div>
  );
}