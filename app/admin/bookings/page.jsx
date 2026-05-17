"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [previewImage, setPreviewImage] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ================= LOAD BOOKINGS ================= */
  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data } = await supabase
        .from("function_room_bookings")
        .select("*")
        .order("start_at", { ascending: true });

      setBookings(data || []);
      setLoading(false);
    }

    load();
  }, []);

  /* ================= STATUS LABEL ================= */
  function statusBadge(status) {
    if (status === "confirmed")
      return "text-green-600";
    if (status === "pending")
      return "text-blue-500";
    if (status === "rejected")
      return "text-red-500";
    if (status === "cancelled_gc")
      return "text-yellow-500";
    return "text-slate-500";
  }

  /* ================= UI ================= */
  return (
    <div className="space-y-4 p-6">

      <h2 className="text-2xl font-semibold text-slate-800">
        Admin • Bookings
      </h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-slate-500">No bookings found.</div>
      ) : (
        bookings.map((b) => (
          <div
            key={b.id}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex justify-between items-start">

              {/* LEFT SIDE */}
              <div className="space-y-2">

                <p className="text-xs text-slate-400 uppercase">
                  Reference
                </p>
                <p className="font-semibold">
                  {b.reference_code || b.id}
                </p>

                <p className={`text-sm font-semibold ${statusBadge(b.status)}`}>
                  {b.status}
                </p>

                {/* BOOKING DETAILS */}
                <div className="mt-3 text-sm space-y-1 text-slate-600">
                  <div><b>Name:</b> {b.customer_name}</div>
                  <div><b>Event:</b> {b.event_type}</div>
                  <div><b>Guests:</b> {b.guest_count}</div>
                  <div><b>Contact:</b> {b.contact_number}</div>
                  <div><b>Email:</b> {b.email}</div>

                  <div>
                    <b>Schedule:</b>{" "}
                    {new Date(b.start_at).toLocaleString()} →{" "}
                    {new Date(b.end_at).toLocaleTimeString()}
                  </div>
                </div>

              </div>

              {/* RIGHT SIDE */}
              <div className="flex flex-col items-end gap-3">

                {/* ✅ PAYMENT PROOF */}
                {b.payment_proof_url && (
                  <img
                    src={b.payment_proof_url}
                    onClick={() => setPreviewImage(b.payment_proof_url)}
                    className="w-16 h-16 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                  />
                )}

                {/* ✅ ACTION BUTTONS */}
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setActionModal({ type: "approve", booking: b })
                    }
                    className="px-3 py-2 bg-green-500 text-white rounded-lg text-xs"
                  >
                    ✅ Approve
                  </button>

                  <button
                    onClick={() =>
                      setActionModal({ type: "reject", booking: b })
                    }
                    className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs"
                  >
                    ❌ Reject
                  </button>
                </div>

              </div>
            </div>
          </div>
        ))
      )}

      {/* ================= IMAGE POPUP ================= */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            className="max-w-[90%] max-h-[90%] rounded-lg"
          />
        </div>
      )}

      {/* ================= ACTION MODAL ================= */}
      {actionModal && (
        <div className="fixed inset-0 z-[99] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">

            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {actionModal.type === "approve"
                ? "Approve Booking"
                : "Reject Booking"}
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to{" "}
              <b>{actionModal.type}</b> this booking?
            </p>

            <div className="flex gap-2">

              <button
                onClick={() => setActionModal(null)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                Cancel
              </button>

              <button
                disabled={actionLoading}
                onClick={async () => {

                  setActionLoading(true);

                  const newStatus =
                    actionModal.type === "approve"
                      ? "confirmed"
                      : "rejected";

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({ status: newStatus })
                    .eq("id", actionModal.booking.id);

                  if (error) {
                    alert(error.message);
                    setActionLoading(false);
                    return;
                  }

                  // ✅ update UI instantly
                  setBookings((prev) =>
                    prev.map((x) =>
                      x.id === actionModal.booking.id
                        ? { ...x, status: newStatus }
                        : x
                    )
                  );

                  setActionLoading(false);
                  setActionModal(null);
                }}
                className={`flex-1 py-2 text-white rounded-lg text-sm ${
                  actionModal.type === "approve"
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              >
                {actionLoading ? "Processing..." : "Confirm"}
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}