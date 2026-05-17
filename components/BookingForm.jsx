"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* =======================
 Business Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BASE_DURATION_HOURS = 3; // booking duration logic stays 3 hours
const BUFFER_HOURS = 1; // 1 hour gap before & after
const MAX_EXTENSION_HOURS = 2; // extension max 2 hours

// ✅ Booking must be at least 5 hours in advance
const MIN_ADVANCE_HOURS = 5;

// ✅ Manage booking rules
const RESCHEDULE_MIN_DAYS = 2; // reschedule allowed only if >= 2 days before booked date

// Deposit policy
const DEPOSIT_AMOUNT = 1000;

// Put QR image here: public/images/qrph.jpg
const QR_IMAGE_PATH = "/images/qrph.jpg";

// Optional admin notify (if you implement /api/booking-notify)
const ADMIN_EMAIL = "booking@jujabrewandbites.com";

/* =====================================================
 PLAN B: Strip citations + OneDrive/SharePoint URLs
===================================================== */
function stripCitationsAndLinks(text = "") {
  return String(text || "")
    .replace(/\[\d+\]\((https?:\/\/[^)]+)\)/g, "")
    .replace(
      /https?:\/\/(?:1drv\.ms|onedrive\.live\.com|my\.sharepoint\.com|[^/\s]+sharepoint\.com)\S*/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* =======================
 Helpers
======================= */
function formatPeso(n) {
  return `₱${Number(n).toLocaleString()}`;
}
function toISODate(d) {
  return d.toISOString().split("T")[0];
}
function buildSlotHours() {
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

function canReschedule(startAtISO) {
  const now = new Date();
  const start = new Date(startAtISO);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= RESCHEDULE_MIN_DAYS;
}

/**
 * ✅ FIXED conflict rule:
 * Only apply buffer around EXISTING bookings (not around candidate slot).
 * conflict if candidate [start,end] overlaps existing [bStart-buffer, bEnd+buffer]
 */
function hasBookingConflict(candidateStart, candidateEnd, existingBookings) {
  return (existingBookings || []).some((b) => {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);

    const bBlockedStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
    const bBlockedEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

    // overlap check; if candidateEnd == bBlockedStart it's allowed
    return candidateStart < bBlockedEnd && candidateEnd > bBlockedStart;
  });
}

/* =======================
 Component
======================= */
export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book | manage

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  // default date today
  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);

  const [notice, setNotice] = useState(null);
  const [successBooking, setSuccessBooking] = useState(null);

  // Modals
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState(null);
  const [payOpen, setPayOpen] = useState(false);

  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ Manage Bookings
  const [myBookings, setMyBookings] = useState([]);
  const [loadingMyBookings, setLoadingMyBookings] = useState(false);

  // ✅ Reschedule modal
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedBooking, setReschedBooking] = useState(null);
  const [reschedDateISO, setReschedDateISO] = useState(() => toISODate(new Date()));
  const [reschedHour, setReschedHour] = useState(null);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedBookings, setReschedBookings] = useState([]);

  // ✅ Update booking info modal
  const [editBooking, setEditBooking] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Book Now form
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

  // Autofill
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

  // Load bookings for date availability (confirmed + pending)
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(dateISO, 26); // 2AM next day

      const queryStart = new Date(dayStart.getTime() - BUFFER_HOURS * 3600 * 1000).toISOString();
      const queryEnd = new Date(dayEnd.getTime() + BUFFER_HOURS * 3600 * 1000).toISOString();

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

  // ✅ Availability computation with correct "Booked vs Too soon" behavior
  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(dateISO, 26);
      const withinOperating = end <= operatingEnd;
      const meetsAdvanceTime = start >= minAllowed;

      const conflict = hasBookingConflict(start, end, bookings);

      let reason = "";
      if (conflict) reason = "booked";
      else if (!meetsAdvanceTime) reason = "too-soon";
      else if (!withinOperating) reason = "closed";

      const availableNow = withinOperating && meetsAdvanceTime && !conflict;

      return { hour: h, label: labelHour(h), available: availableNow, reason };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  function validateBookingInputs() {
    setNotice(null);

    if (!form.name.trim()) return "Name is required.";
    if (!form.event_type.trim()) return "Event type is required.";
    if (!dateISO) return "Date is required.";
    if (selectedHour == null) return "Time is required.";
    if (!form.package_id) return "Please select a package.";
    if (!form.contact_number.trim()) return "Contact number is required.";
    if (!form.email.trim()) return "Email address is required.";

    const guests = Number(form.guest_count || 0);
    if (!guests || guests < 1) return "No. of guests must be at least 1.";

    const extensionHours = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    if (extensionHours < 0 || extensionHours > MAX_EXTENSION_HOURS) {
      return `Extension must be 0–${MAX_EXTENSION_HOURS} hours.`;
    }

    // 5-hour rule validation
    const now = new Date();
    const selectedStart = computeDateTime(dateISO, selectedHour);
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);

    if (selectedStart < minAllowed) {
      return `Booking must be at least ${MIN_ADVANCE_HOURS} hours in advance.`;
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

  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    setPayOpen(true);
  }

  // Load upcoming bookings for Manage
  useEffect(() => {
    async function fetchMyBookings() {
      if (!user?.id) return;

      setLoadingMyBookings(true);
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["pending", "confirmed"])
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true });

      if (!error) setMyBookings(data || []);
      setLoadingMyBookings(false);
    }

    fetchMyBookings();
  }, [user?.id]);

  // Reschedule: load conflicts for chosen resched date
  useEffect(() => {
    async function fetchReschedConflicts() {
      if (!reschedOpen || !reschedDateISO) return;

      const dayStart = computeDateTime(reschedDateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(reschedDateISO, 26);

      const queryStart = new Date(dayStart.getTime() - BUFFER_HOURS * 3600 * 1000).toISOString();
      const queryEnd = new Date(dayEnd.getTime() + BUFFER_HOURS * 3600 * 1000).toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ["pending", "confirmed"])
        .gte("start_at", queryStart)
        .lte("start_at", queryEnd)
        .order("start_at", { ascending: true });

      if (!error) {
        setReschedBookings((data || []).filter((x) => x.id !== reschedBooking?.id));
      }
    }

    fetchReschedConflicts();
  }, [reschedOpen, reschedDateISO, reschedBooking?.id]);

  const reschedAvailability = useMemo(() => {
    if (!reschedOpen || !reschedBooking) return [];

    const dur = Number(reschedBooking.duration_hours || BASE_DURATION_HOURS);
    const ext = Number(reschedBooking.extension_hours || 0);
    const totalHours = dur + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);

    return slotHours.map((h) => {
      const start = computeDateTime(reschedDateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(reschedDateISO, 26);
      const withinOperating = end <= operatingEnd;
      const meetsAdvanceTime = start >= minAllowed;

      const conflict = hasBookingConflict(start, end, reschedBookings);

      let reason = "";
      if (conflict) reason = "booked";
      else if (!meetsAdvanceTime) reason = "too-soon";
      else if (!withinOperating) reason = "closed";

      return {
        hour: h,
        label: labelHour(h),
        available: withinOperating && meetsAdvanceTime && !conflict,
        reason,
      };
    });
  }, [reschedOpen, reschedBooking, reschedDateISO, reschedBookings, slotHours]);

  async function confirmPaymentAndSubmit() {
    const err = validateBookingInputs();
    if (err) {
      setNotice(err);
      return;
    }

    if (!proofFile) {
      setNotice("Please attach a screenshot of your payment confirmation.");
      return;
    }

    const extensionHours = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const start = computeDateTime(dateISO, selectedHour);
    const end = new Date(start.getTime() + (BASE_DURATION_HOURS + extensionHours) * 3600 * 1000);

    setSubmitting(true);
    setNotice(null);

    try {
      // Upload proof to Supabase Storage: booking_proofs
      const fileExt = (proofFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user?.id || "guest"}/${Date.now()}_${Math.random().toString(16).slice(2)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("booking_proofs")
        .upload(path, proofFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: proofFile.type || "image/jpeg",
        });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from("booking_proofs").getPublicUrl(uploadData.path);
      const proofUrl = pub?.publicUrl || null;

      const payload = {
        user_id: user?.id || null,
        member_id: member?.id || null,
        package_id: Number(form.package_id),
        customer_name: form.name.trim(),
        event_type: form.event_type.trim(),
        business_date: dateISO,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
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

      // RPC insert
      const { data: bookingRow, error: bookErr } = await supabase.rpc("create_booking", { data: payload });
      if (bookErr) throw bookErr;

      try {
        await fetch("/api/booking-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminEmail: ADMIN_EMAIL, bookingId: bookingRow?.id, proofUrl }),
        });
      } catch {}

      setSuccessBooking(bookingRow);
      setPayOpen(false);

      setProofFile(null);
      setProofPreview(null);
      setSelectedHour(null);
      setTab("availability");
    } catch (e) {
      console.error("❌ FULL ERROR:", e);
      alert(e?.message || "Something went wrong");
      setNotice(e?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // ✅ Success screen
  if (successBooking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7] px-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center shadow-lg">
          <h2 className="text-2xl font-bold text-green-600 mb-2">✅ Booking Confirmed</h2>
          <p className="text-sm text-slate-600 mb-4">Your reservation has been received.</p>

          <div className="bg-slate-50 border rounded-xl p-4 text-left text-sm space-y-2">
            <p><b>Reference:</b> {successBooking.reference_code || successBooking.id}</p>
            <p><b>Name:</b> {successBooking.customer_name}</p>
            <p><b>Date:</b> {successBooking.business_date}</p>
            <p><b>Status:</b> {successBooking.status}</p>
          </div>

          <button
            onClick={() => {
              setSuccessBooking(null);
              setTab("availability");
            }}
            className="mt-5 w-full py-3 bg-[#FC687D] text-white rounded-xl"
          >
            Back to Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          {stripCitationsAndLinks(
            `Booking is ${BASE_DURATION_HOURS} hours + optional extension (max ${MAX_EXTENSION_HOURS} hours).`
          )}
        </p>
      </div>

      {/* ✅ Dropdown navigation replacing buttons */}
      <div className="bg-white border border-rose-100 rounded-2xl p-3 shadow-sm max-w-sm">
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
          Select Option
        </label>

        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100"
        >
          <option value="availability">Check Availability</option>
          <option value="packages">Packages</option>
          <option value="book">Book Now</option>
          <option value="manage">My Bookings</option>
        </select>
      </div>

      {notice && (
        <div className="bg-white border border-rose-100 text-slate-700 rounded-xl p-3 text-[12px]">
          {stripCitationsAndLinks(notice)}
        </div>
      )}

      {/* Availability */}
      {tab === "availability" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Select Date</p>
              <input
                type="date"
                value={dateISO}
                min={toISODate(new Date())}
                onChange={(e) => setDateISO(e.target.value)}
                className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {stripCitationsAndLinks(`Must be at least ${MIN_ADVANCE_HOURS} hours in advance.`)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Extension</p>
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
                  onChange={(e) => setForm((f) => ({ ...f, extension_hours: Number(e.target.value) }))}
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
            Operating hours: <b>10:00 AM – 2:00 AM</b> (next day). Buffer rule: <b>1 hour</b> before & after.
          </div>

          {loadingBookings ? (
            <div className="min-h-[120px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availability.map((s) => {
                const status =
                  s.available
                    ? "Available"
                    : s.reason === "booked"
                    ? "Booked"
                    : s.reason === "too-soon"
                    ? `Too soon (${MIN_ADVANCE_HOURS}-hour rule)`
                    : "Closed";

                const statusClass =
                  s.available
                    ? "text-emerald-600"
                    : s.reason === "booked"
                    ? "text-red-500 font-semibold"
                    : "text-slate-400";

                return (
                  <button
                    type="button"
                    key={s.hour}
                    onClick={() => s.available && selectSlot(s.hour)}
                    className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                      s.available
                        ? "bg-[#FFF9FA] border-rose-100 hover:bg-rose-50"
                        : "bg-slate-50 border-slate-200 opacity-70 cursor-not-allowed"
                    }`}
                    disabled={!s.available}
                  >
                    <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                    <p className={`text-[10px] mt-1 ${statusClass}`}>{status}</p>
                  </button>
                );
              })}
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
                  <div className="min-w-0">
                    <p className="text-[12px] uppercase tracking-widest text-slate-400">{p.name}</p>
                    <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                      ₱{Number(p.rental_fee).toLocaleString()}
                    </h3>
                    <div className="mt-2 space-y-1 min-w-0">
                      <p className="text-[11px] text-slate-500">Capacity up to {p.capacity} guests</p>
                    </div>
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
            </div>

            <button
              type="button"
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
                  {p.name} — ₱{Number(p.rental_fee).toLocaleString()} (pax {p.capacity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", "text", "Full name"],
              ["event_type", "Event Type", "text", "Birthday, Gathering, Meeting..."],
              ["contact_number", "Contact Number", "tel", "09XX XXX XXXX"],
              ["email", "Email Address", "email", "name@email.com"],
            ].map(([key, lbl, type, ph]) => (
              <div key={key}>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{lbl}</label>
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
          </div>

          <button
            type="button"
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* Manage bookings */}
      {tab === "manage" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800">Upcoming Bookings</h3>
            <p className="text-xs text-slate-500 mt-1">
              Reschedule allowed only if at least <b>{RESCHEDULE_MIN_DAYS} days</b> before booking date.
              Cancellation will be converted into a gift certificate.
            </p>
          </div>

          {loadingMyBookings ? (
            <div className="min-h-[120px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
            </div>
          ) : myBookings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5 text-slate-500 text-sm">
              No upcoming bookings.
            </div>
          ) : (
            myBookings.map((b) => {
              const allowResched = canReschedule(b.start_at);

              return (
                <div key={b.id} className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Reference</p>
                      <p className="text-sm font-semibold text-slate-800">{b.reference_code || b.id}</p>

                      <p className="text-xs text-slate-500 mt-1">
                        Date: <b>{b.business_date}</b> • Start: <b>{new Date(b.start_at).toLocaleString()}</b>
                      </p>

                      <p className="text-xs mt-1">
                        Status:{" "}
                        <span className={b.status === "confirmed" ? "text-emerald-600 font-semibold" : "text-blue-500 font-semibold"}>
                          {b.status === "confirmed" ? "✅ Confirmed" : "🕒 Pending"}
                        </span>
                      </p>

                      {!allowResched && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Reschedule disabled — must be at least {RESCHEDULE_MIN_DAYS} days before booking date.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {/* ✅ Update booking info (package, guests, event type) */}
                      <button
                        type="button"
                        onClick={() => setEditBooking({ ...b })}
                        className="px-4 py-2 rounded-full bg-blue-500 text-white text-[10px] uppercase tracking-widest active:scale-95"
                      >
                        Update
                      </button>

                      <button
                        type="button"
                        disabled={!allowResched}
                        onClick={() => {
                          setReschedBooking(b);
                          setReschedDateISO(b.business_date);
                          setReschedHour(null);
                          setReschedOpen(true);
                          setNotice(null);
                        }}
                        className={`px-4 py-2 rounded-full text-[10px] uppercase tracking-widest active:scale-95 ${
                          allowResched
                            ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                            : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        Reschedule
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const ok = confirm("Cancel this booking? It will be converted into a gift certificate.");
                          if (!ok) return;

                          const { error } = await supabase
                            .from("function_room_bookings")
                            .update({ status: "cancelled_gc" })
                            .eq("id", b.id);

                          if (error) {
                            setNotice(error.message);
                            return;
                          }

                          setMyBookings((prev) => prev.filter((x) => x.id !== b.id));
                          setNotice("✅ Booking cancelled. It will be converted into a gift certificate.");
                        }}
                        className="px-4 py-2 rounded-full bg-red-500 text-white text-[10px] uppercase tracking-widest active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ✅ Update Booking Info Modal */}
      {editBooking && (
        <div
          className="fixed inset-0 z-[97] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !editLoading && setEditBooking(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Update Booking Info</h3>

            <label className="text-xs text-slate-500">Package</label>
            <select
              value={editBooking.package_id}
              onChange={(e) =>
                setEditBooking((prev) => ({
                  ...prev,
                  package_id: Number(e.target.value),
                }))
              }
              className="w-full mt-1 mb-3 p-2 border rounded"
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label className="text-xs text-slate-500">No. of Guests</label>
            <input
              type="number"
              min={1}
              value={editBooking.guest_count || 1}
              onChange={(e) =>
                setEditBooking((prev) => ({
                  ...prev,
                  guest_count: Number(e.target.value),
                }))
              }
              className="w-full mt-1 mb-3 p-2 border rounded"
            />

            <label className="text-xs text-slate-500">Event Type</label>
            <input
              type="text"
              value={editBooking.event_type || ""}
              onChange={(e) =>
                setEditBooking((prev) => ({
                  ...prev,
                  event_type: e.target.value,
                }))
              }
              className="w-full mt-1 mb-4 p-2 border rounded"
            />

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setEditLoading(true);

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({
                      package_id: editBooking.package_id,
                      guest_count: editBooking.guest_count,
                      event_type: editBooking.event_type,
                    })
                    .eq("id", editBooking.id);

                  if (error) {
                    alert(error.message);
                    setEditLoading(false);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((item) => (item.id === editBooking.id ? editBooking : item))
                  );

                  alert("✅ Booking updated");
                  setEditBooking(null);
                  setEditLoading(false);
                }}
                className="flex-1 py-2 bg-[#FC687D] text-white rounded"
              >
                {editLoading ? "Saving..." : "Save"}
              </button>

              <button
                onClick={() => setEditBooking(null)}
                className="flex-1 py-2 bg-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payOpen && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => !submitting && setPayOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-7 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">Secure Your Booking</h3>
              <button
                type="button"
                onClick={() => !submitting && setPayOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-slate-700">
              <p className="text-sm leading-relaxed">
                {stripCitationsAndLinks(
                  `To secure your booking, a ₱${DEPOSIT_AMOUNT.toLocaleString()} non-refundable fee is required.`
                )}
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Scan QR to Pay</p>

                <img
                  src={QR_IMAGE_PATH}
                  alt="Payment QR Code"
                  className="w-full max-w-[320px] mx-auto rounded-xl border border-slate-200 bg-white"
                />

                <p className="text-[12px] text-slate-700 mt-3">
                  After payment, attach screenshot of your payment confirmation to lock in your reservation!
                </p>

                <input
                  type="file"
                  accept="image/*"
                  className="mt-3 w-full text-sm"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  disabled={submitting}
                />

                {proofPreview && (
                  <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                    <img src={proofPreview} alt="Payment proof preview" className="w-full object-cover" />
                  </div>
                )}

                {!proofFile && (
                  <p className="mt-2 text-[11px] text-rose-500">
                    Please upload your payment proof before submitting.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={confirmPaymentAndSubmit}
                disabled={submitting || !proofFile}
                className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Proof & Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedOpen && reschedBooking && (
        <div
          className="fixed inset-0 z-[96] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => !reschedLoading && setReschedOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">Reschedule Booking</h3>
              <button
                type="button"
                onClick={() => !reschedLoading && setReschedOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Reference: <b>{reschedBooking.reference_code || reschedBooking.id}</b>
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">New Date</label>
                <input
                  type="date"
                  value={reschedDateISO}
                  min={toISODate(new Date())}
                  onChange={(e) => setReschedDateISO(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {reschedAvailability.map((s) => {
                  const status =
                    s.available
                      ? "Available"
                      : s.reason === "booked"
                      ? "Booked"
                      : s.reason === "too-soon"
                      ? `Too soon (${MIN_ADVANCE_HOURS}-hour rule)`
                      : "Closed";

                  const statusClass =
                    s.available
                      ? "text-emerald-600"
                      : s.reason === "booked"
                      ? "text-red-500 font-semibold"
                      : "text-slate-400";

                  return (
                    <button
                      key={s.hour}
                      type="button"
                      disabled={!s.available}
                      onClick={() => s.available && setReschedHour(s.hour)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        reschedHour === s.hour
                          ? "border-[#FC687D] bg-rose-50"
                          : s.available
                          ? "bg-white border-slate-200 hover:bg-slate-50"
                          : "bg-slate-50 border-slate-200 opacity-70 cursor-not-allowed"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                      <p className={`text-[10px] mt-1 ${statusClass}`}>{status}</p>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={reschedLoading || reschedHour == null}
                onClick={async () => {
                  if (reschedHour == null) return;

                  setReschedLoading(true);
                  setNotice(null);

                  const dur = Number(reschedBooking.duration_hours || BASE_DURATION_HOURS);
                  const ext = Number(reschedBooking.extension_hours || 0);

                  const newStart = computeDateTime(reschedDateISO, reschedHour);
                  const newEnd = new Date(newStart.getTime() + (dur + ext) * 3600 * 1000);

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({
                      business_date: reschedDateISO,
                      start_at: newStart.toISOString(),
                      end_at: newEnd.toISOString(),
                      status: "pending",
                    })
                    .eq("id", reschedBooking.id);

                  if (error) {
                    setNotice(error.message);
                    setReschedLoading(false);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((x) =>
                      x.id === reschedBooking.id
                        ? {
                            ...x,
                            business_date: reschedDateISO,
                            start_at: newStart.toISOString(),
                            end_at: newEnd.toISOString(),
                            status: "pending",
                          }
                        : x
                    )
                  );

                  setReschedLoading(false);
                  setReschedOpen(false);
                  setNotice("✅ Booking rescheduled! Waiting for confirmation.");
                }}
                className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
              >
                {reschedLoading ? "Updating…" : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}