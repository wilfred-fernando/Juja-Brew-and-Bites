"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("function_room_bookings")
        .select("*")
        .order("created_at", { ascending: false });

      setBookings(data || []);
    }

    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Bookings</h1>

      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="bg-white border p-4 rounded-xl">

            <p className="font-bold text-sm">
              {b.reference_code}
            </p>

            <p className="text-xs text-slate-500">
              {b.customer_name}
            </p>

            <p className="text-xs">
              {b.business_date}
            </p>

            
            <p
            className={`text-xs ${
                b.status === "confirmed"
                ? "text-green-500"
                : b.status === "rejected"
                ? "text-red-500"
                : "text-blue-500"
            }`}
            >
            {b.status}
            </p>



            {b.status !== "confirmed" && (
            <button
                onClick={async () => {
                    const { error } = await supabase
                    .from("function_room_bookings")
                    .update({ status: "confirmed" })
                    .eq("id", b.id);

                    if (!error) {
                    // ✅ UPDATE STATE HERE (THIS IS THE LINE YOU ASKED ABOUT)
                    setBookings((prev) =>
                        prev.map((item) =>
                        item.id === b.id
                            ? { ...item, status: "confirmed" }
                            : item
                        )
                    );
                    } else {
                    console.error(error);
                    alert("Failed to update booking");
                    }
                }}
                className="mt-2 px-3 py-1 bg-green-500 text-white rounded text-xs"
                >
                ✅ Approve
                <button
                    onClick={async () => {
                        const { error } = await supabase
                        .from("function_room_bookings")
                        .update({ status: "rejected" })
                        .eq("id", b.id);

                        if (!error) {
                        setBookings((prev) =>
                            prev.map((item) =>
                            item.id === b.id
                                ? { ...item, status: "rejected" }
                                : item
                            )
                        );
                        }
                    }}
                    className="mt-2 ml-2 px-3 py-1 bg-red-500 text-white rounded text-xs"
                    >
                    ❌ Reject
                    </button>

            {b.payment_proof_url && (
              <img
                src={b.payment_proof_url}
                className="mt-2 w-32 rounded"
              />
            )}

          </div>
        ))}
      </div>
    </div>
  );
}