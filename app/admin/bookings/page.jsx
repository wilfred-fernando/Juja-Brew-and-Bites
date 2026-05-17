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

      <div className="space-y-4">
        {bookings.map((b) => (
          <div key={b.id} className="bg-white border p-4 rounded-xl shadow-sm">

            {/* ✅ Reference */}
            <p className="font-bold text-sm">
              {b.reference_code || "No Ref"}
            </p>

            {/* ✅ Customer */}
            <p className="text-xs text-slate-500">
              {b.customer_name}
            </p>

            {/* ✅ Date */}
            <p className="text-xs">
              {b.business_date}
            </p>

            {/* ✅ STATUS (COLOR + LABEL) */}
            <p
              className={`text-xs mt-1 ${
                b.status === "confirmed"
                  ? "text-green-500"
                  : b.status === "rejected"
                  ? "text-red-500"
                  : "text-blue-500"
              }`}
            >
              {b.status === "confirmed" && "✅ Confirmed"}
              {b.status === "rejected" && "❌ Rejected"}
              {b.status === "pending" && "🕒 Pending"}
            </p>

            {/* ✅ PAYMENT PROOF IMAGE */}
            {b.payment_proof_url && (
              <img
                src={b.payment_proof_url}
                alt="Proof"
                className="mt-2 w-full max-w-xs rounded border"
              />
            )}

            {/* ✅ ACTION BUTTONS */}
            <div className="mt-3 flex gap-2">

              {/* ✅ APPROVE */}
              {b.status !== "confirmed" && (
                <button
                  onClick={async () => {
                    const { error } = await supabase
                      .from("function_room_bookings")
                      .update({ status: "confirmed" })
                      .eq("id", b.id);

                    if (!error) {
                      setBookings((prev) =>
                        prev.map((item) =>
                          item.id === b.id
                            ? { ...item, status: "confirmed" }
                            : item
                        )
                      );
                    } else {
                      console.error(error);
                      alert("Failed to approve booking");
                    }
                  }}
                  className="px-3 py-1 bg-green-500 text-white rounded text-xs"
                >
                  ✅ Approve
                </button>
              )}

              {/* ✅ REJECT */}
              {b.status !== "rejected" && (
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
                    } else {
                      console.error(error);
                      alert("Failed to reject booking");
                    }
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-xs"
                >
                  ❌ Reject
                </button>
              )}

            </div>

          </div>
        ))}
      </div>
    </div>
  );
}