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
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        setIsLoading(true);
        
        // REPLACEMENT: Fetching directly from Supabase to avoid the "MenuItem.list" crash
        const { data, error: sbError } = await supabase
          .from("menu_items")
          .select("is_featured");

        if (sbError) throw sbError;

        if (data) {
          setStats({
            totalItems: data.length,
            featuredItems: data.filter(item => item.is_featured).length
          });
        }
      } catch (err) {
        console.error("Dashboard Load Error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-none"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border-l-4 border-red-500 text-red-700 font-bold uppercase tracking-widest text-xs">
        System Error: {error}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-8 border-b-4 border-[#1A1A1A] pb-4">
        <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">
          Dashboard <span className="text-[#1EBBA3]">Overview</span>
        </h1>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
          Real-time Menu Statistics
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Items Card */}
        <div className="bg-white border border-[#1A1A1A] p-8 shadow-sm rounded-none">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Total Menu Items</p>
          <h2 className="text-5xl font-black text-[#1A1A1A]">{stats.totalItems}</h2>
        </div>

        {/* Featured Items Card */}
        <div className="bg-white border border-[#1A1A1A] p-8 shadow-sm rounded-none">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Featured Items</p>
          <h2 className="text-5xl font-black text-[#1EBBA3]">{stats.featuredItems}</h2>
        </div>

        {/* Store Status Card */}
        <div className="bg-[#1A1A1A] text-white p-8 shadow-sm rounded-none flex flex-col justify-between">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Store Status</p>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#1EBBA3] animate-pulse"></div>
            <h2 className="text-xl font-bold uppercase tracking-widest text-[#1EBBA3]">Live & Active</h2>
          </div>
        </div>
      </div>
    </div>
  );
}