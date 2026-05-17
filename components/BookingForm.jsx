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

/* =====================================================
 PACKAGE POLICIES (1–6) — Full Details content
(From your BookingFormPage_4 baseline)
===================================================== */
const PACKAGE_POLICIES = {
  1: {
    name: "Package 1",
    room_usage: {
      capacity:
        "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: [
        "Extension maximum of 2 hours:",
        "Option 1: ₱1,000 worth of food & drinks per hour.",
        "Option 2: ₱250 per hour.",
      ],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱3,000 for 3 hours.",
      package_includes: [
        "₱2,500 worth of food & drinks (customizable selection).",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 2500,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱250",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish (max of 2 dish only)",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  2: {
    name: "Package 2",
    room_usage: {
      capacity:
        "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: [
        "Extension maximum of 2 hours:",
        "Option 1: ₱1,500 worth of food & drinks per hour.",
        "Option 2: ₱750 per hour.",
      ],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱7,000 for 3 hours.",
      package_includes: [
        "₱5,500 worth of food & drinks (customizable selection).",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 5500,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱500",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish (max of 2 dish only)",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  3: {
    name: "Package 3",
    room_usage: {
      capacity:
        "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: [
        "Extension maximum of 2 hours:",
        "Option 1: ₱3,000 worth of food & drinks per hour.",
        "Option 2: ₱1,500 per hour.",
      ],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱15,000 for 3 hours.",
      package_includes: [
        "₱12,000 worth of food & drinks (customizable selection).",
        "The entire store will be exclusively reserved for your event during the booking.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 12000,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱1,000",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish (max of 2 dish only)",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  4: {
    name: "Package 4",
    room_usage: {
      capacity:
        "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests: "Additional guests: ₱150 per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱1,000 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱2,500 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
  5: {
    name: "Package 5",
    room_usage: {
      capacity:
        "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests: "Additional guests: ₱150 per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱1,500 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱3,500 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
  6: {
    name: "Package 6",
    room_usage: {
      capacity:
        "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests: "Additional guests: FREE.",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱2,500 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱8,000 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "The entire store will be exclusively reserved for your event during the booking.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
};

/* =======================
 Slot Classification
======================= */
/**
 * Your desired behavior:
 * - Booked: slot start is within booking window (inclusive end hour)
 * - Buffer: only exact buffer slots (start-1h, end+1h)
 * - Closed: slot duration overlaps the booking buffer window (ex: 10AM overlaps 11AM buffer window)
 * - Too soon: 5-hour rule
 * - Closed-hours: exceeds operating end
 */
function classifySlot({ start, end, operatingEnd, minAllowed, bookings }) {
  if (end > operatingEnd) return { available: false, reason: "closed-hours" };
  if (start < minAllowed) return { available: false, reason: "too-soon" };

  const sameHour = (a, b) => a.getTime() === b.getTime();
  const list = bookings || [];

  // 1) BOOKED if start is within booking window
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);

    // inclusive end for hour-based slot labels
    const bEndInclusive = new Date(bEnd.getTime() + 1);

    if (start >= bStart && start < bEndInclusive) {
      return { available: false, reason: "booked" };
    }
  }

  // 2) BUFFER if start is exactly at buffer slots
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);

    const bufferBeforeSlot = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
    const bufferAfterSlot = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

    if (sameHour(start, bufferBeforeSlot) || sameHour(start, bufferAfterSlot)) {
      return { available: false, reason: "buffer" };
    }
  }

  // 3) CLOSED if duration overlaps buffer window
  for (const b of list) {
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    const bufferWindowStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
    const bufferWindowEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

    const overlapsBufferWindow = start < bufferWindowEnd && end > bufferWindowStart;
    if (overlapsBufferWindow) return { available: false, reason: "closed" };
  }

  return { available: true, reason: "available" };
}

export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book | manage

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);

  const [payOpen, setPayOpen] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Manage bookings
  const [myBookings, setMyBookings] = useState([]);
  const [loadingMyBookings, setLoadingMyBookings] = useState(false);

  // Reschedule modal
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedBooking, setReschedBooking] = useState(null);
  const [reschedDateISO, setReschedDateISO] = useState(() => toISODate(new Date()));
  const [reschedHour, setReschedHour] = useState(null);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedBookings, setReschedBookings] = useState([]);

  // Update booking info modal
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

  // Autofill from profile
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

  // Load bookings for availability (pending + confirmed)
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(dateISO, 26);

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

  // Availability slots
  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);
    const operatingEnd = computeDateTime(dateISO, 26);

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);
      const verdict = classifySlot({ start, end, operatingEnd, minAllowed, bookings });
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

  // Load upcoming bookings (Manage)
  useEffect(() => {
    async function fetchMyBookings() {
      if (!user?.id) return;
      setLoadingMyBookings(true);

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("*")
        .eq("user_id", user.id)
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true });

      if (!error) setMyBookings(data || []);
      setLoadingMyBookings(false);
    }
    fetchMyBookings();
  }, [user?.id]);

  // Reschedule conflicts fetch
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

      if (!error) setReschedBookings((data || []).filter((x) => x.id !== reschedBooking?.id));
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
      const verdict = classifySlot({ start, end, operatingEnd, minAllowed, bookings: reschedBookings });
      return { hour: h, label: labelHour(h), ...verdict };
    });
  }, [reschedOpen, reschedBooking, reschedDateISO, reschedBookings, slotHours]);

  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    setPayOpen(true);
  }

  async function confirmPaymentAndSubmit() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    if (!proofFile) return setNotice("Please attach a screenshot of your payment confirmation.");

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

      setPayOpen(false);
      setProofFile(null);
      setProofPreview(null);
      setSelectedHour(null);
      setTab("availability");
      setNotice("✅ Booking saved! Waiting for confirmation.");
    } catch (e) {
      console.error("❌ FULL ERROR:", e);
      alert(e?.message || "Something went wrong");
      setNotice(e?.message || "Something went wrong");
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
          <option value="manage">Manage Booking</option>
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
          {/* ✅ Date selection restored */}
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
                Must be at least {MIN_ADVANCE_HOURS} hours in advance.
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
            Operating hours: <b>10:00 AM – 2:00 AM</b> (next day). Buffer rule:{" "}
            <b>1 hour</b> before & after.
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
                    : s.reason === "buffer"
                    ? "Buffer"
                    : s.reason === "too-soon"
                    ? `Too soon (${MIN_ADVANCE_HOURS}-hour rule)`
                    : "Closed";

                // ✅ your requested statusClass mapping
                const statusClass =
                  s.available ? "text-green-600" :
                  s.reason === "booked" ? "text-red-500 font-semibold" :
                  s.reason === "buffer" ? "text-yellow-500 font-semibold" :
                  "text-slate-400";

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
            packages.map((p) => {
              const pid = Number(p.id);
              const policy = PACKAGE_POLICIES[pid];
              const rfi = policy?.rental_fees_inclusions;

              const roomRentalOnly = rfi?.room_rental_only ?? false;
              const consumableAmt = rfi?.consumable_amount ?? null;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[12px] uppercase tracking-widest text-slate-400">{p.name}</p>

                      {/* price (already without "/ 3 hours") */}
                      <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                        ₱{Number(p.rental_fee).toLocaleString()}
                      </h3>

                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-slate-500">
                          Capacity up to {p.capacity} guests
                        </p>

                        {/* ✅ Restored Consumable / Room Rental Only */}
                        <p className="text-[11px] text-slate-500">
                          {roomRentalOnly ? (
                            "Room Rental Only"
                          ) : (
                            `Consumable: ${formatPeso(consumableAmt || 0)}`
                          )}
                        </p>
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
              );
            })
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

      {/* Manage Booking */}
      {tab === "manage" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800">Manage Booking</h3>
            <p className="text-xs text-slate-500 mt-1">
              Update & Reschedule allowed only if at least <b>{RESCHEDULE_MIN_DAYS} days</b> before booking date.
              Cancellation converts to a gift certificate.
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

              // ✅ Booking status display
              const statusText =
                b.status === "confirmed" ? "✅ Confirmed" :
                b.status === "rejected" ? "❌ Rejected" :
                b.status === "cancelled_gc" ? "🎁 Converted to Gift Cert" :
                b.status === "pending" ? "🕒 Pending" :
                b.status;

              const statusColor =
                b.status === "confirmed" ? "text-green-600" :
                b.status === "rejected" ? "text-red-500" :
                b.status === "cancelled_gc" ? "text-yellow-500" :
                "text-blue-500";

              return (
                <div key={b.id} className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Reference</p>
                      <p className="text-sm font-semibold text-slate-800">{b.reference_code || b.id}</p>

                      <p className="text-xs text-slate-500 mt-1">
                        Date: <b>{b.business_date}</b> • Start: <b>{new Date(b.start_at).toLocaleString()}</b>
                      </p>

                      {/* ✅ status */}
                      <p className={`text-xs mt-2 font-semibold ${statusColor}`}>{statusText}</p>

                      {!allowChange && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Updates & reschedule disabled — must be at least {RESCHEDULE_MIN_DAYS} days before booking.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {/* Update */}
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

                      {/* Reschedule */}
                      <button
                        type="button"
                        disabled={!allowChange}
                        onClick={() => {
                          if (!allowChange) return;
                          setReschedBooking(b);
                          setReschedDateISO(b.business_date);
                          setReschedHour(null);
                          setReschedOpen(true);
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

      {/* Update Booking Info Modal */}
      {editBooking && (
        <div
          className="fixed inset-0 z-[97] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !editLoading && setEditBooking(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                  // enforce 2-day rule on save
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
                      status: "pending",
                    })
                    .eq("id", editBooking.id);

                  if (error) {
                    alert(error.message);
                    setEditLoading(false);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((x) => (x.id === editBooking.id ? editBooking : x))
                  );

                  alert("✅ Booking updated");
                  setEditBooking(null);
                  setEditLoading(false);
                }}
                className="flex-1 py-2 bg-[#FC687D] text-white rounded"
              >
                {editLoading ? "Saving..." : "Save"}
              </button>

              <button onClick={() => setEditBooking(null)} className="flex-1 py-2 bg-gray-200 rounded">
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
                      : s.reason === "buffer"
                      ? "Buffer"
                      : s.reason === "too-soon"
                      ? `Too soon (${MIN_ADVANCE_HOURS}-hour rule)`
                      : "Closed";

                  const statusClass =
                    s.available ? "text-green-600" :
                    s.reason === "booked" ? "text-red-500 font-semibold" :
                    s.reason === "buffer" ? "text-yellow-500 font-semibold" :
                    "text-slate-400";

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
            {(() => {
              const pid = Number(detailsPkg.id);
              const policy = PACKAGE_POLICIES[pid];
              if (!policy) return <p className="text-slate-700">No policy details found.</p>;
              const rfi = policy.rental_fees_inclusions;

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Full Details</p>
                      <h3 className="text-xl md:text-2xl font-semibold text-slate-900 mt-1">{policy.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(false)}
                      className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">1. Room Usage</p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      <li>• {policy.room_usage.capacity}</li>
                      <li>• {policy.room_usage.additional_guests}</li>
                      <li>• {policy.room_usage.rental_duration}</li>
                      {policy.room_usage.extension.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">2. Rental Fees & Inclusions</p>
                    <p className="text-[12px] text-slate-700 mb-3">• {rfi.rental_fee}</p>

                    <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Package Includes</p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      {rfi.package_includes.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>

                    <p className="text-[12px] text-slate-700 mt-3">
                      •{" "}
                      {rfi.room_rental_only ? (
                        <b>Room rental only</b>
                      ) : (
                        <>
                          Consumable: <b>{formatPeso(rfi.consumable_amount)}</b>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="bg-white border border-rose-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-rose-600 mb-2">3. Food & Beverages</p>
                    <p className="text-[12px] text-slate-700 mb-2">• {policy.food_beverages.policy}</p>
                    {policy.food_beverages.corkage.length > 0 && (
                      <ul className="space-y-1 text-[12px] text-slate-700 leading-relaxed ml-3">
                        {policy.food_beverages.corkage.map((x) => (
                          <li key={x}>◦ {x}</li>
                        ))}
                      </ul>
                    )}
                    {policy.food_beverages.notes && (
                      <p className="text-[12px] text-slate-700 mt-3">• {policy.food_beverages.notes}</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}