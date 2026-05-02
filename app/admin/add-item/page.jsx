"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalItems: 0, featuredItems: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardStats() {
      setIsLoading(true);
      
      // Fetch data directly from Supabase instead of using the broken MenuItem.list()
      const { data, error } = await supabase
        .from("menu_items")
        .select("is_featured");

      if (!error && data) {
        setStats({
          totalItems: data.length,
          featuredItems: data.filter(item => item.is_featured).length
        });
      }
      setIsLoading(false);
    }

    fetchDashboardStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1EBBA3] animate-spin"></div>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8 border-b-4 border-[#1A1A1A] pb-4">
        <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">
          Dashboard <span className="text-[#1EBBA3]">Overview</span>
        </h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Items Card */}
        <div className="bg-white border border-[#1A1A1A] p-6 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Total Menu Items</p>
          <h2 className="text-4xl font-black text-[#1A1A1A]">{stats.totalItems}</h2>
        </div>

        {/* Featured Items Card */}
        <div className="bg-white border border-[#1A1A1A] p-6 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Featured Items</p>
          <h2 className="text-4xl font-black text-[#1EBBA3]">{stats.featuredItems}</h2>
        </div>

        {/* Quick Action Card */}
        <div className="bg-[#1A1A1A] text-white p-6 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Store Status</p>
          <h2 className="text-xl font-bold uppercase text-[#1EBBA3]">Open & Live</h2>
        </div>
      </div>
    </div>
  );
}