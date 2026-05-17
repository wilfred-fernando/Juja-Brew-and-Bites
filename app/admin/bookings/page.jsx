"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* =======================
 Rules
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BASE_BOOKING_MINUTES = 2 * 60 + 59; // 2h59m
const MAX_EXTENSION_HOURS = 2;

/* =======================
 Helpers
======================= */
function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function buildSlotHours() {
  const hours = [];
  for (let h = OPERATING_START_HOUR; h <= 23; h++) hours.push(h);
  hours.push(24, 25); // 12AM+1, 1AM+1
  return hours;
}

function labelHour(h) {
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}

function computeDateTime(dateISO, hourLike) {
  const base = new Date(`${dateISO}T00:00:00`);
  const dt = new Date(base);
  if (hourLike >= 24) dt.setDate(dt.getDate() + 1);
  dt.setHours(hourLike % 24, 0, 0, 0);
  return dt;
}

function computeEndAt(startAt, extensionHours) {
  const totalMinutes = BASE_BOOKING_MINUTES + Number(extensionHours || 0) * 60;
  return new Date(startAt.getTime() + totalMinutes * 60 * 1000);
}

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString()}`;
}

function statusBadge(status) {
  if (status === "confirmed") return "text-green-600";
  if (status === "pending") return "text-blue-500";
  if (status === "rejected") return "text-red-500";
  if (status === "cancelled_gc") return "text-yellow-600";
  return "text-slate-500";
}

function niceStatus(status) {
  if (status === "confirmed") return "✅ Confirmed";
  if (status === "pending") return "🕒 Pending";
  if (status === "rejected") return "❌ Rejected";
  if (status === "cancelled_gc") return "🎁 Converted to Gift Cert";
  return String(status || "—");
}

/* =======================
 Component
======================= */
export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Image preview
  const [previewImage, setPreviewImage] = useState(null);

  // Approve/Reject confirmation modal
  const [actionModal, setActionModal] = useState(null);
  // { type: "approve"|"reject", booking }
  const [actionLoading, setActionLoading] = useState(false);

  // Admin manual update modal
  const [editModal, setEditModal] = useState(null);
  // { booking, dateISO, hour, ...editable fields }
  const [editLoading, setEditLoading] = useState(false);

  const slotHours = useMemo(() => buildSlotHours(), []);

  // package lookup map
  const pkgById = useMemo(() => {
    const map = new Map();
    for (const p of packages) map.set(Number(p.id), p);
    return map;
  }, [packages]);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    async function loadAll() {
      setLoading(true);

      const [{ data: pkgData }, { data: bookingData }] = await Promise.all([
        supabase
          .from("function_room_packages")
          .select("*")
          .order("id", { ascending: true }),
        supabase
          .from("function_room_bookings")
          .select("*")
          .order("start_at", { ascending: true }),
      ]);

      setPackages(pkgData || []);
      setBookings(bookingData || []);
      setLoading(false);
    }

    loadAll();
  }, []);

  /* ================= ACTION HANDLERS ================= */
  async function runStatusUpdate(type, booking) {
    setActionLoading(true);

    const newStatus = type === "approve" ? "confirmed" : "rejected";

    const { error } = await supabase
      .from("function_room_bookings")
      .update({ status: newStatus })
      .eq("id", booking.id);

    if (error) {
      alert(error.message);
      setActionLoading(false);
      return;
    }

    setBookings((prev) =>
      prev.map((x) => (x.id === booking.id ? { ...x, status: newStatus } : x))
    );

    setActionLoading(false);
    setActionModal(null);
  }

  function openEditModal(b) {
    const start = new Date(b.start_at);
    const dateISO = toISODate(start);

    // determine hour slot (supports +1 day labels too)
    const hour = start.getHours() + (start.getDate() !== new Date(`${dateISO}T00:00:00`).getDate() ? 24 : 0);

    setEditModal({
      booking: b,
      customer_name: b.customer_name || "",
      event_type: b.event_type || "",
      guest_count: b.guest_count || 1,
      contact_number: b.contact_number || "",
      email: b.email || "",
      package_id: Number(b.package_id || ""),
      extension_hours: Number(b.extension_hours || 0),
      dateISO,
      hour: isNaN(hour) ? start.getHours() : hour,
    });
  }

  async function saveAdminUpdate() {
    if (!editModal?.booking) return;
    setEditLoading(true);

    try {
      const b = editModal.booking;

      const startAt = computeDateTime(editModal.dateISO, Number(editModal.hour));
      const endAt = computeEndAt(startAt, Number(editModal.extension_hours || 0));

      const payload = {
        customer_name: editModal.customer_name.trim(),
        event_type: editModal.event_type.trim(),
        guest_count: Number(editModal.guest_count || 1),
        contact_number: editModal.contact_number.trim(),
        email: editModal.email.trim(),
        package_id: Number(editModal.package_id),
        extension_hours: Number(editModal.extension_hours || 0),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        // Optional: send back to pending to re-check/confirm after edits
        status: "pending",
      };

      const { error } = await supabase
        .from("function_room_bookings")
        .update(payload)
        .eq("id", b.id);

      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("no_overlap_function_room")) {
          alert("❌ This update overlaps an existing booking. Please choose another time.");
        } else {
          alert(error.message);
        }
        setEditLoading(false);
        return;
      }

      setBookings((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, ...payload } : x))
      );

      setEditLoading(false);
      setEditModal(null);
    } catch (e) {
      alert(e?.message || "Something went wrong.");
      setEditLoading(false);
    }
  }

  /* ================= UI ================= */
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Admin</p>
          <h2 className="text-2xl font-semibold text-slate-800">Bookings</h2>
          <p className="text-xs text-slate-500 mt-1">
            Base booking: 2h 59m • Buffer is UI-only • Extension max {MAX_EXTENSION_HOURS}h
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-slate-500">No bookings found.</div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const pkg = pkgById.get(Number(b.package_id));
            const pkgName = pkg?.name || `Package #${b.package_id || "—"}`;
            const fee = pkg?.rental_fee;

            return (
              <div
                key={b.id}
                className="bg-white border border-rose-50 rounded-[28px] shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* LEFT */}
                  <div className="min-w-0 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">
                      Reference
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {b.reference_code || b.id}
                    </p>

                    <p className={`text-xs font-semibold ${statusBadge(b.status)}`}>
                      {niceStatus(b.status)}
                    </p>

                    {/* DETAILS */}
                    <div className="mt-2 text-[12px] text-slate-600 space-y-1">
                      <p><b>Name:</b> {b.customer_name}</p>
                      <p><b>Event:</b> {b.event_type}</p>
                      <p><b>Guests:</b> {b.guest_count}</p>
                      <p><b>Contact:</b> {b.contact_number}</p>
                      <p><b>Email:</b> {b.email}</p>

                      <p>
                        <b>Package:</b> {pkgName}
                        {fee != null ? ` • ${formatPeso(fee)}` : ""}
                      </p>

                      <p>
                        <b>Extension:</b> {Number(b.extension_hours || 0)} hr
                      </p>

                      <p>
                        <b>Schedule:</b>{" "}
                        {new Date(b.start_at).toLocaleString()} →{" "}
                        {new Date(b.end_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* RIGHT */}
                  <div className="flex flex-col items-end gap-3">
                    {/* PAYMENT PROOF THUMB */}
                    {b.payment_proof_url ? (
                      <img
                        src={b.payment_proof_url}
                        alt="Payment proof"
                        onClick={() => setPreviewImage(b.payment_proof_url)}
                        className="w-16 h-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-80"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                        No proof
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => openEditModal(b)}
                        className="px-3 py-2 rounded-xl bg-blue-500 text-white text-[10px] uppercase tracking-widest active:scale-95"
                      >
                        ✏️ Update Details
                      </button>

                      <button
                        onClick={() => setActionModal({ type: "approve", booking: b })}
                        className="px-3 py-2 rounded-xl bg-green-500 text-white text-[10px] uppercase tracking-widest active:scale-95"
                      >
                        ✅ Approve
                      </button>

                      <button
                        onClick={() => setActionModal({ type: "reject", booking: b })}
                        className="px-3 py-2 rounded-xl bg-red-500 text-white text-[10px] uppercase tracking-widest active:scale-95"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= IMAGE POPUP ================= */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
                onClick={() => setPreviewImage(null)}
              >
                ✕
              </button>
            </div>
            <img
              src={previewImage}
              alt="Payment proof preview"
              className="w-full max-h-[80vh] object-contain rounded-2xl border border-white/10 bg-black"
            />
          </div>
        </div>
      )}

      {/* ================= APPROVE/REJECT CONFIRM MODAL ================= */}
      {actionModal && (
        <div className="fixed inset-0 z-[101] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] border border-rose-50 shadow-sm p-6 w-full max-w-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Confirm Action
                </p>
                <h3 className="text-lg font-semibold text-slate-800">
                  {actionModal.type === "approve" ? "Approve Booking" : "Reject Booking"}
                </h3>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !actionLoading && setActionModal(null)}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to <b>{actionModal.type}</b> this booking?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                disabled={actionLoading}
                onClick={() => runStatusUpdate(actionModal.type, actionModal.booking)}
                className={`flex-1 py-3 rounded-xl text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60 ${
                  actionModal.type === "approve" ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {actionLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADMIN MANUAL UPDATE MODAL ================= */}
      {editModal && (
        <div className="fixed inset-0 z-[102] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-[28px] border border-rose-50 shadow-sm p-6 w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Admin Manual Update
                </p>
                <h3 className="text-lg font-semibold text-slate-800">
                  Update Booking Details
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  End time auto-calculates: 2h59 + extension.
                </p>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !editLoading && setEditModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Customer Name
                </label>
                <input
                  value={editModal.customer_name}
                  onChange={(e) => setEditModal((p) => ({ ...p, customer_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Event Type
                </label>
                <input
                  value={editModal.event_type}
                  onChange={(e) => setEditModal((p) => ({ ...p, event_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Guests
                </label>
                <input
                  type="number"
                  min={1}
                  value={editModal.guest_count}
                  onChange={(e) => setEditModal((p) => ({ ...p, guest_count: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Extension Hours
                </label>
                <select
                  value={editModal.extension_hours}
                  onChange={(e) => setEditModal((p) => ({ ...p, extension_hours: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Contact Number
                </label>
                <input
                  value={editModal.contact_number}
                  onChange={(e) => setEditModal((p) => ({ ...p, contact_number: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Email
                </label>
                <input
                  value={editModal.email}
                  onChange={(e) => setEditModal((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Package
                </label>
                <select
                  value={editModal.package_id}
                  onChange={(e) => setEditModal((p) => ({ ...p, package_id: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value="">Select package…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatPeso(p.rental_fee)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editModal.dateISO}
                  onChange={(e) => setEditModal((p) => ({ ...p, dateISO: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Start Time
                </label>
                <select
                  value={editModal.hour}
                  onChange={(e) => setEditModal((p) => ({ ...p, hour: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {slotHours.map((h) => (
                    <option key={h} value={h}>
                      {labelHour(h)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview end time */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700">
              {(() => {
                const startAt = computeDateTime(editModal.dateISO, Number(editModal.hour));
                const endAt = computeEndAt(startAt, Number(editModal.extension_hours || 0));
                return (
                  <p>
                    <b>Computed:</b>{" "}
                    {startAt.toLocaleString()} → {endAt.toLocaleString()}
                  </p>
                );
              })()}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditModal(null)}
                disabled={editLoading}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                onClick={saveAdminUpdate}
                disabled={editLoading}
                className="flex-1 py-3 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                {editLoading ? "Saving..." : "Save Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}