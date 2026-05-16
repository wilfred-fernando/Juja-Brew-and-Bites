"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function PromoPage() {
  const [promos, setPromos] = useState([]);

  useEffect(() => {
    async function fetchPromos() {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true);

      setPromos(data || []);
    }

    fetchPromos();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24">

      <h1 className="text-3xl font-bold mb-6">Promos</h1>

      <div className="space-y-4">
        {promos.map((p) => (
          <div
            key={p.id}
            className="border rounded-xl p-4 bg-white"
          >
            <p className="font-bold">{p.title}</p>
            <p className="text-sm text-gray-500">
              {p.description}
            </p>

            <Link
              href={`/customer?tab=order&promo=${p.code}`}
              className="block mt-3 text-[#FC687D] font-bold text-sm"
            >
              Use Promo →
            </Link>
          </div>
        ))}
      </div>

    </div>
  );
}
