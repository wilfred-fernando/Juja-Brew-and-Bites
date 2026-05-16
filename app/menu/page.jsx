"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function PublicMenuPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function fetchMenu() {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("is_available", true);

      setItems(data || []);
    }

    fetchMenu();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 pb-24">

      <h1 className="text-3xl font-bold mb-6">Our Menu</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="border rounded-xl p-3 bg-white"
          >
            <p className="font-bold text-sm">{item.name}</p>
            <p className="text-xs text-gray-500">
              ₱{item.price}
            </p>
          </div>
        ))}
      </div>

      {/* ✅ CTA to CUSTOMER */}
      <div className="mt-8 text-center">
        <Link
          href="/customer?tab=order"
          className="inline-block px-6 py-3 bg-[#FC687D] text-white rounded-xl font-bold"
        >
          Order Now →
        </Link>
      </div>

    </div>
  );
}