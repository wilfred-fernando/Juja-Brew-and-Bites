"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* =======================
   Business Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BASE_DURATION_HOURS = 3; // 3 hours rental duration
const BUFFER_HOURS = 1; // 1 hour gap before & after (your rule)
const MAX_EXTENSION_HOURS = 2; // max extension 2 hours
const MIN_ADVANCE_DAYS = 3; // at least 3 days in advance

// Deposit policy (₱1,000 non-refundable deposit noted in VIP Guidelines_2026) [2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=31079ddc-68b9-45e6-a5fb-8f6ed21b2cd5&cid=933e55cc8541ec41)
const DEPOSIT_AMOUNT = 1000;

// Put QR image here (save as public/images/gcash-qr.jpg)
const QR_IMAGE_PATH = "/images/gcash-qr.jpg";

// Optional admin notification target (only used if you implement /api/booking-notify)
const ADMIN_EMAIL = "booking@jujabrewandbites.com";

/* =========================================
   Extracted Function Room Guidelines (No Links)
   Based on: Function Room Guidelines + VIP Guidelines_2026
========================================= */
const FUNCTION_ROOM_GUIDELINES = {
  reservation_policy: [
    "Reservation must be made at least 3 days in advance.",
    "Advance order is required for food selection.",
    "Reservation is subject to availability.",
    "Deposit is required to confirm the booking.",
  ],
  room_usage: [
    "Rental duration is 3 hours.",
    "Extension is allowed with a maximum of 2 hours (rates depend on package).",
  ],
  rebooking_cancellation: [
    "Reservation fee/deposit is non-refundable.",
    "Rebooking is allowed at least 2 days before the original booking date, subject to availability.",
    "No-show will forfeit the deposit.",
  ],
  conduct_liability: [
    "Guests must behave respectfully and follow house rules.",
    "Smoking, vaping, and illegal substances are prohibited.",
    "Guests are responsible for any damages to the property or equipment during rental.",
  ],
};

/* =======================
   Helpers
======================= */
function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildSlotHours() {
  // 10..23 plus 24..25 (12AM, 1AM next day)
  const hours = [];
  for (let h = OPERATING_START_HOUR; h <= 23; h++) hours.push(h);
  hours.push(24, 25);
  return hours;
}

function labelHour(h) {
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}

function computeDateTime(businessDateISO, hourLike) {
  const base = new Date(`${businessDateISO}T00:00:00`);
  const h = hourLike % 24;
  const dayAdd = hourLike >= 24 ? 1 : 0;

  const dt = new Date(base);
  dt.setDate(dt.getDate() + dayAdd);
  dt.setHours(h, 0, 0, 0);
  return dt;
}

function intersects(aStart, aEnd, bStart, bEnd) {
  // [start, end) overlap
  return aStart < bEnd && aEnd > bStart;
}

/* =======================
   Component
======================= */
export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() =>
    toISODate(addDays(new Date(), MIN_ADVANCE_DAYS))
  );
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);

  // Package Full Details modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState(null);

  // Payment popup modal
  const [payOpen, setPayOpen] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    event_type: "",
    contact_number: "",
    email: "",
    guest_count: 1,
    package_id: "",
    extend: "no",
    extension_hours: 0,
  });

  // Autofill from profile / auth user
  useEffect(() => {
    setForm((f) => ({
      ...f,
      name: f.name || member?.customer_name || "",
      contact_number: f.contact_number || member?.["Phone"] || "",
      email: f.email || member?.["Email"] || user?.email || "",
    }));
  }, [member, user]);

  // Load packages
  useEffect(() => {
    async function fetchPackages() {
      setLoadingPackages(true);
      setNotice(null);

      const { data, error } = await supabase
        .from("function_room_packages")
        .select("*")
        .eq("is_active", true)
        .order("id", { ascending: true });

      if (error) setNotice(error.message);
      else setPackages(data || []);

      setLoadingPackages(false);
    }
    fetchPackages();
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((p) => String(p.id) === String(form.package_id)),
    [packages, form.package_id]
  );

  // Load bookings (pending/confirmed) for the date window (10AM to 2AM next day)
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(dateISO, 26); // 2AM next day

      const queryStart = new Date(
        dayStart.getTime() - BUFFER_HOURS * 3600 * 1000
      ).toISOString();
      const queryEnd = new Date(
        dayEnd.getTime() + BUFFER_HOURS * 3600 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ["pending", "confirmed"])
        .gte("start_at", queryStart)
        .lte("start_at", queryEnd)
        .order("start_at", { ascending: true });

      if (error) {
        setNotice(error.message);
        setBookings([]);
      } else {
        setBookings(data || []);
      }

      setLoadingBookings(false);
    }

    fetchBookingsForDate();
  }, [dateISO]);

  const slotHours = useMemo(() => buildSlotHours(), []);

  // Availability calculation with 1-hour buffer before and after each booking
  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(dateISO, 26); // 2AM next day
      const withinOperating = end <= operatingEnd;

      const blockedStart = new Date(
        start.getTime() - BUFFER_HOURS * 3600 * 1000
      );
      const blockedEnd = new Date(end.getTime() + BUFFER_HOURS * 3600 * 1000);

      const hasConflict = bookings.some((b) => {
        const bStart = new Date(b.start_at);
        const bEnd = new Date(b.end_at);

        const bBlockedStart = new Date(
          bStart.getTime() - BUFFER_HOURS * 3600 * 1000
        );
        const bBlockedEnd = new Date(
          bEnd.getTime() + BUFFER_HOURS * 3600 * 1000
        );

        return intersects(blockedStart, blockedEnd, bBlockedStart, bBlockedEnd);
      });

      return {
        hour: h,
        label: labelHour(h),
        available: withinOperating && !hasConflict,
      };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  function validateBookingInputs() {
    setNotice(null);

    const minDate = toISODate(addDays(new Date(), MIN_ADVANCE_DAYS));
    if (dateISO < minDate) {
      return `Booking must be at least ${MIN_ADVANCE_DAYS} days in advance.`;
    }

    if (!form.name.trim()) return "Name is required.";
    if (!form.event_type.trim()) return "Event type is required.";
    if (!dateISO) return "Date is required.";
    if (selectedHour == null) return "Time is required.";
    if (!form.package_id) return "Please select a package.";
    if (!form.contact_number.trim()) return "Contact number is required.";
    if (!form.email.trim()) return "Email address is required.";

    const guests = Number(form.guest_count || 0);
    if (!guests || guests < 1) return "No. of guests must be at least 1.";

    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    if (extensionHours < 0 || extensionHours > MAX_EXTENSION_HOURS) {
      return `Extension must be 0–${MAX_EXTENSION_HOURS} hours.`;
    }

    return null;
  }

  function selectSlot(h) {
    setSelectedHour(h);
    setTab("book");
    setNotice(null);
  }

  // Proof preview
  useEffect(() => {
    if (!proofFile) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  // Book Now => open payment popup
  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) {
      setNotice(err);
      return;
    }
    setPayOpen(true);
  }

  async function confirmPaymentAndSubmit() {
    const err = validateBookingInputs();
    if (err) {
      setNotice(err);
      setPayOpen(false);
      return;
    }

    if (!proofFile) {
      setNotice("Please attach a screenshot of your payment confirmation.");
      return;
    }

    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    const start = computeDateTime(dateISO, selectedHour);

    setSubmitting(true);
    setNotice(null);

    try {
      // 1) Upload proof to Supabase Storage bucket: booking_proofs
      const fileExt = (proofFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user?.id || "guest"}/${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("booking_proofs")
        .upload(path, proofFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: proofFile.type || "image/jpeg",
        });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage
        .from("booking_proofs")
        .getPublicUrl(uploadData.path);

      const proofUrl = pub?.publicUrl || null;

      // 2) Insert booking
      const payload = {
        user_id: user?.id || null,
        member_id: member?.id || null,
        package_id: Number(form.package_id),

        customer_name: form.name.trim(),
        event_type: form.event_type.trim(),

        business_date: dateISO,
        start_at: start.toISOString(),
        duration_hours: BASE_DURATION_HOURS,
        extension_hours: extensionHours,

        guest_count: Number(form.guest_count),
        contact_number: form.contact_number.trim(),
        email: form.email.trim(),

        deposit_amount: DEPOSIT_AMOUNT,
        payment_status: "submitted",
        payment_proof_url: proofUrl,

        status: "pending",
      };

      const { data: bookingRow, error: bookErr } = await supabase
        .from("function_room_bookings")
        .insert([payload])
        .select()
        .single();

      if (bookErr) throw bookErr;

      // 3) Optional admin notify endpoint (implement separately if you want)
      try {
        await fetch("/api/booking-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail: ADMIN_EMAIL,
            bookingId: bookingRow.id,
            customerName: payload.customer_name,
            eventType: payload.event_type,
            businessDate: payload.business_date,
            timeLabel: labelHour(selectedHour),
            packageId: payload.package_id,
            guestCount: payload.guest_count,
            contactNumber: payload.contact_number,
            customerEmail: payload.email,
            extensionHours: payload.extension_hours,
            depositAmount: payload.deposit_amount,
            proofUrl: proofUrl,
          }),
        });
      } catch {
        // ignore notify errors
      }

      setNotice("✅ Booking saved! Payment proof submitted.");
      setPayOpen(false);
      setProofFile(null);
      setProofPreview(null);
      setSelectedHour(null);
      setTab("availability");
    } catch (e) {
      setNotice(e?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          Booking is <b>{BASE_DURATION_HOURS} hours</b> + optional extension (max{" "}
          {MAX_EXTENSION_HOURS} hours).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {[
          { id: "availability", label: "Check Availability" },
          { id: "packages", label: "Packages" },
          { id: "book", label: "Book Now" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] md:text-[11px] uppercase tracking-widest border transition-all active:scale-95 ${
              tab === t.id
                ? "bg-[#FC687D] text-white border-[#FC687D]"
                : "bg-white text-slate-500 border-rose-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="bg-white border border-rose-100 text-slate-700 rounded-xl p-3 text-[12px]">
          {notice}
        </div>
      )}

      {/* Availability */}
      {tab === "availability" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Select Date
              </p>
              <input
                type="date"
                value={dateISO}
                min={toISODate(addDays(new Date(), MIN_ADVANCE_DAYS))}
                onChange={(e) => setDateISO(e.target.value)}
                className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Must be at least {MIN_ADVANCE_DAYS} days in advance.
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Extension
              </p>
              <div className="mt-2 flex items-center gap-2 justify-end">
                <select
                  value={form.extend}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      extend: e.target.value,
                      extension_hours: e.target.value === "yes" ? f.extension_hours : 0,
                    }))
                  }
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>

                <select
                  value={form.extension_hours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, extension_hours: Number(e.target.value) }))
                  }
                  disabled={form.extend !== "yes"}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value={0}>0 hr</option>
                  <option value={1}>1 hr</option>
                  <option value={2}>2 hr</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Operating hours: <b>10:00 AM – 2:00 AM</b> (next day). Buffer rule:{" "}
            <b>1 hour</b> before &amp; after.
          </div>

          {loadingBookings ? (
            <div className="min-h-[120px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availability.map((s) => (
                <button
                  key={s.hour}
                  onClick={() => s.available && selectSlot(s.hour)}
                  className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                    s.available
                      ? "bg-[#FFF9FA] border-rose-100 hover:bg-rose-50"
                      : "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                  }`}
                  disabled={!s.available}
                >
                  <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {s.available ? "Available" : "Unavailable"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages */}
      {tab === "packages" && (
        <div className="space-y-3">
          {loadingPackages ? (
            <div className="min-h-[120px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
            </div>
          ) : (
            packages.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-slate-400">
                      {p.name}
                    </p>
                    <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                      ₱{Number(p.rental_fee).toLocaleString()} / 3 hours
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Capacity up to {p.capacity} guests • Extension max{" "}
                      {p.extension_max_hours ?? 2} hours
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsPkg(p);
                        setDetailsOpen(true);
                      }}
                      className="px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-[10px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Full Details
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, package_id: String(p.id) }));
                        setTab("book");
                      }}
                      className="px-4 py-2 rounded-full bg-[#FC687D] text-white text-[10px] uppercase tracking-widest active:scale-95"
                    >
                      Choose
                    </button>
                  </div>
                </div>

                {p.inclusions && (
                  <p className="text-[12px] text-slate-700 mt-3 leading-relaxed">
                    {p.inclusions}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Book Now */}
      {tab === "book" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Selected</p>
              <p className="text-[12px] text-slate-800 mt-1">
                Date: <b>{dateISO}</b> • Time:{" "}
                <b>{selectedHour != null ? labelHour(selectedHour) : "Not selected"}</b>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Duration: {BASE_DURATION_HOURS} hours
                {form.extend === "yes" && Number(form.extension_hours) > 0
                  ? ` + ${form.extension_hours} hour(s) extension`
                  : ""}
              </p>
            </div>

            <button
              onClick={() => setTab("availability")}
              className="px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[10px] uppercase tracking-widest active:scale-95"
            >
              Pick Time
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
              Package Selection
            </label>
            <select
              value={form.package_id}
              onChange={(e) => setForm((f) => ({ ...f, package_id: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
            >
              <option value="">Select package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₱{Number(p.rental_fee).toLocaleString()} (cap {p.capacity})
                </option>
              ))}
            </select>

            {selectedPackage?.inclusions && (
              <p className="text-[11px] text-slate-500 mt-2">{selectedPackage.inclusions}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", "text", "Full name"],
              ["event_type", "Event Type (Birthday/Gathering/Meeting)", "text", "Birthday"],
              ["contact_number", "Contact Number", "tel", "09XX XXX XXXX"],
              ["email", "Email Address", "email", "name@email.com"],
            ].map(([key, lbl, type, ph]) => (
              <div key={key}>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                  {lbl}
                </label>
                <input
                  type={type}
                  value={form[key] ?? ""}
                  placeholder={ph}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>
            ))}

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                No. of Guests
              </label>
              <input
                type="number"
                min={1}
                value={form.guest_count}
                onChange={(e) => setForm((f) => ({ ...f, guest_count: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Going to extend?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, extend: "no", extension_hours: 0 }))}
                  className={`px-4 py-2 rounded-xl text-[11px] border active:scale-95 ${
                    form.extend === "no"
                      ? "bg-[#FC687D] text-white border-[#FC687D]"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  No
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      extend: "yes",
                      extension_hours: f.extension_hours || 1,
                    }))
                  }
                  className={`px-4 py-2 rounded-xl text-[11px] border active:scale-95 ${
                    form.extend === "yes"
                      ? "bg-[#FC687D] text-white border-[#FC687D]"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  Yes
                </button>

                <select
                  value={form.extension_hours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, extension_hours: Number(e.target.value) }))
                  }
                  disabled={form.extend !== "yes"}
                  className="ml-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value={0}>0 hr</option>
                  <option value={1}>1 hr</option>
                  <option value={2}>2 hr</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* Full Details Modal */}
      {detailsOpen && detailsPkg && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Package Details</p>
                <h3 className="text-xl md:text-2xl font-semibold text-slate-900 mt-1">
                  {detailsPkg.name}
                </h3>
                <p className="text-[12px] text-slate-600 mt-1">
                  ₱{Number(detailsPkg.rental_fee).toLocaleString()} • 3 hours • Capacity up to{" "}
                  {detailsPkg.capacity} guests
                </p>
              </div>

              <button
                onClick={() => setDetailsOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Inclusions</p>
                <p className="text-[13px] text-slate-700 leading-relaxed">
                  {detailsPkg.inclusions || "—"}
                </p>
              </div>

              <div className="bg-white border border-rose-100 rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-rose-600 mb-2">
                  Function Room Guidelines
                </p>

                <div className="space-y-3 text-[12px] text-slate-700 leading-relaxed">
                  <div>
                    <p className="font-semibold text-slate-800">Reservation Policy</p>
                    <ul className="mt-1 space-y-1">
                      {FUNCTION_ROOM_GUIDELINES.reservation_policy.map((t) => (
                        <li key={t}>• {t}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800">Room Usage</p>
                    <ul className="mt-1 space-y-1">
                      {FUNCTION_ROOM_GUIDELINES.room_usage.map((t) => (
                        <li key={t}>• {t}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800">Rebooking &amp; Cancellations</p>
                    <ul className="mt-1 space-y-1">
                      {FUNCTION_ROOM_GUIDELINES.rebooking_cancellation.map((t) => (
                        <li key={t}>• {t}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800">Conduct &amp; Liability</p>
                    <ul className="mt-1 space-y-1">
                      {FUNCTION_ROOM_GUIDELINES.conduct_liability.map((t) => (
                        <li key={t}>• {t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, package_id: String(detailsPkg.id) }));
                    setDetailsOpen(false);
                    setTab("book");
                  }}
                  className="flex-1 py-3 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest hover:bg-rose-500 active:scale-95"
                >
                  Choose This Package
                </button>

                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Popup Modal */}
      {payOpen && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setPayOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-7 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">
                Secure Your Booking
              </h3>
              <button
                onClick={() => setPayOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-slate-700">
              <p className="text-sm leading-relaxed">
                To secure your booking, a{" "}
                <b>₱{DEPOSIT_AMOUNT.toLocaleString()}</b> non-refundable fee is required.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                  Scan QR to Pay
                </p>
                <img
                  src={QR_IMAGE_PATH}
                  alt="Payment QR Code"
                  className="w-full max-w-[320px] mx-auto rounded-xl border border-slate-200 bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-2">
                  Place your QR image at <b>public/images/gcash-qr.jpg</b>.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-slate-800">
                  After payment, attach screenshot of your payment confirmation to lock in your reservation!
                </p>

                <input
                  type="file"
                  accept="image/*"
                  className="mt-3 w-full text-sm"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                />

                {proofPreview && (
                  <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                    <img
                      src={proofPreview}
                      alt="Payment proof preview"
                      className="w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={confirmPaymentAndSubmit}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Proof & Confirm Booking"}
              </button>

              <p className="text-[10px] text-slate-400">
                Payment proof will be stored. Admin notification is optional via `/api/booking-notify`.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}