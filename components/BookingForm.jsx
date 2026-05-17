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
const MIN_ADVANCE_HOURS = 5; // must be at least 5 hours in advance

// ✅ Manage booking rules
const RESCHEDULE_MIN_DAYS = 2; // reschedule/update allowed only if >= 2 days before booked date

const DEPOSIT_AMOUNT = 1000;
const QR_IMAGE_PATH = "/images/qrph.jpg";
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
function canChangeBooking(startAtISO) {
  const now = new Date();
  const start = new Date(startAtISO);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= RESCHEDULE_MIN_DAYS;
}

/**
 * ✅ Slot classification that matches your expectation:
 * - "booked": slot start is inside actual booking window
 * - "buffer": slot start is within 1 hour BEFORE/AFTER booking (inclusive end for after-buffer)
 * - "closed": slot duration overlaps booking window even if start is outside booking/buffer (ex: 10AM overlaps 12-3)
 * - "too-soon": violates 5-hour rule
 * - "closed-hours": exceeds operating hours
 * - "available": ok
 */
function classifySlot({ start, end, operatingEnd, minAllowed, bookings }) {
  // operating hours check first
  if (end > operatingEnd) return { available: false, reason: "closed-hours" };

  // 5-hour rule
  if (start < minAllowed) return { available: false, reason: "too-soon" };

  const list = bookings || [];

  // 1) BOOKED if start falls inside actual booking window
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    if (start >= bStart && start < bEnd) {
      return { available: false, reason: "booked" };
    }
  }

  // 2) BUFFER if start falls inside buffer windows (before or after)
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    const bufferStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
    const bufferEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

    // before buffer: [bufferStart, bStart)
    if (start >= bufferStart && start < bStart) {
      return { available: false, reason: "buffer" };
    }

    // after buffer: (bEnd, bufferEnd]  (inclusive end so 4PM shows as buffer for 3PM end)
    if (start > bEnd && start <= bufferEnd) {
      return { available: false, reason: "buffer" };
    }
  }

  // 3) CLOSED if the duration overlaps actual booking window (but start wasn’t in booked/buffer)
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);

    // overlap check
    const overlapsBooking = start < bEnd && end > bStart;
    if (overlapsBooking) {
      return { available: false, reason: "closed" };
    }
  }

  // 4) BUFFER if duration overlaps buffer window (rare but safe)
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    const bufferStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
    const bufferEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

    const overlapsBuffer = start < bufferEnd && end > bufferStart;
    if (overlapsBuffer) {
      return { available: false, reason: "buffer" };
    }
  }

  return { available: true, reason: "available" };
}

function reasonLabel(reason) {
  if (reason === "available") return "Available";
  if (reason === "booked") return "Booked";
  if (reason === "buffer") return "Buffer";
  if (reason === "closed") return "Closed";
  if (reason === "too-soon") return `Too soon (${MIN_ADVANCE_HOURS}-hour rule)`;
  if (reason === "closed-hours") return "Closed";
  return "Closed";
}

function reasonClass(reason) {
  if (reason === "available") return "text-emerald-600";
  if (reason === "booked") return "text-red-500 font-semibold";
  if (reason === "buffer") return "text-amber-600 font-semibold";
  if (reason === "too-soon") return "text-slate-400";
  return "text-slate-400";
}

/* =======================
 Component
======================= */
export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book | manage

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);

  const [notice, setNotice] = useState(null);
  const [successBooking, setSuccessBooking] = useState(null);

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

  // Load bookings for date availability (pending+confirmed)
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

  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);
    const operatingEnd = computeDateTime(dateISO, 26);

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const verdict = classifySlot({
        start,
        end,
        operatingEnd,
        minAllowed,
        bookings,
      });

      return { hour: h, label: labelHour(h), ...verdict };
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

  // Reschedule conflicts for date
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
    const operatingEnd = computeDateTime(reschedDateISO, 26);

    return slotHours.map((h) => {
      const start = computeDateTime(reschedDateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const verdict = classifySlot({
        start,
        end,
        operatingEnd,
        minAllowed,
        bookings: reschedBookings,
      });

      return { hour: h, label: labelHour(h), ...verdict };
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

      {/* ✅ Dropdown navigation */}
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
              {availability.map((s) => (
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
                  <p className={`text-[10px] mt-1 ${reasonClass(s.reason)}`}>
                    {reasonLabel(s.reason)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages (unchanged UI assumed from your project; keep yours if already customized) */}
      {tab === "packages" && (
        <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
          <p className="text-sm text-slate-600">
            (Keep your existing Packages rendering here — unchanged)
          </p>
        </div>
      )}

      {/* Book Now (unchanged UI assumed from your project; keep yours if already customized) */}
      {tab === "book" && (
        <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
          <p className="text-sm text-slate-600">
            (Keep your existing Book Now form rendering here — unchanged)
          </p>
        </div>
      )}

      {/* Manage Bookings */}
      {tab === "manage" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800">Upcoming Bookings</h3>
            <p className="text-xs text-slate-500 mt-1">
              Reschedule & Update allowed only if at least <b>{RESCHEDULE_MIN_DAYS} days</b> before booking date.
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
              const allowChange = canChangeBooking(b.start_at);

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

                      {!allowChange && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Updates & reschedule disabled — must be at least {RESCHEDULE_MIN_DAYS} days before booking date.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {/* ✅ Update booking info (allowed only ≥2 days) */}
                      <button
                        type="button"
                        disabled={!allowChange}
                        onClick={() => allowChange && setEditBooking({ ...b })}
                        className={`px-4 py-2 rounded-full text-[10px] uppercase tracking-widest active:scale-95 ${
                          allowChange
                            ? "bg-blue-500 text-white"
                            : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        ✏️ Update
                      </button>

                      {/* ✅ Reschedule (allowed only ≥2 days) */}
                      <button
                        type="button"
                        disabled={!allowChange}
                        onClick={() => {
                          if (!allowChange) return;
                          setReschedBooking(b);
                          setReschedDateISO(b.business_date);
                          setReschedHour(null);
                          setReschedOpen(true);
                          setNotice(null);
                        }}
                        className={`px-4 py-2 rounded-full text-[10px] uppercase tracking-widest active:scale-95 ${
                          allowChange
                            ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                            : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        Reschedule
                      </button>

                      {/* Cancel */}
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

            <p className="text-[11px] text-slate-500 mb-3">
              Allowed only if booking is at least {RESCHEDULE_MIN_DAYS} days away.
            </p>

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
                  // Enforce 2-day rule on save
                  if (!canChangeBooking(editBooking.start_at)) {
                    alert(`Updates are only allowed at least ${RESCHEDULE_MIN_DAYS} days before the booking.`);
                    return;
                  }

                  setEditLoading(true);

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({
                      package_id: editBooking.package_id,
                      guest_count: editBooking.guest_count,
                      event_type: editBooking.event_type,
                      status: "pending", // optional: send back to pending for re-approval
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
                {reschedAvailability.map((s) => (
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
                    <p className={`text-[10px] mt-1 ${reasonClass(s.reason)}`}>{reasonLabel(s.reason)}</p>
                  </button>
                ))}
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