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
const RESCHEDULE_MIN_DAYS = 2; // can reschedule only if >= 2 days before booked date

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
function intersects(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}
function canReschedule(startAtISO) {
  const now = new Date();
  const start = new Date(startAtISO);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= RESCHEDULE_MIN_DAYS;
}

/* =======================
 Component
======================= */
export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book | manage
  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  // ✅ Default date can be today now (time rule handles 5 hours)
  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);

  // ✅ Success confirmation (FIXED: must be top-level hook)
  const [successBooking, setSuccessBooking] = useState(null);

  // Modals
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState(null);
  const [payOpen, setPayOpen] = useState(false);

  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ Manage bookings
  const [myBookings, setMyBookings] = useState([]);
  const [loadingMyBookings, setLoadingMyBookings] = useState(false);

  // Reschedule modal state
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedBooking, setReschedBooking] = useState(null);
  const [reschedDateISO, setReschedDateISO] = useState(() => toISODate(new Date()));
  const [reschedHour, setReschedHour] = useState(null);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedBookings, setReschedBookings] = useState([]);

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

  // Load packages from Supabase
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

  // Load bookings for availability
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

  // ✅ Availability computation with 5-hour rule + reason
  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(dateISO, 26); // 2AM next day
      const withinOperating = end <= operatingEnd;

      const meetsAdvanceTime = start >= minAllowed;

      const hasConflict = bookings.some((b) => {
      const bStart = new Date(b.start_at);
      const bEnd = new Date(b.end_at);

      // ✅ Apply buffer ONLY to existing bookings
      const bBlockedStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
      const bBlockedEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

      // ✅ DO NOT buffer the new slot
      return start < bBlockedEnd && end > bBlockedStart;
    });

      let reason = "";
      if (hasConflict) reason = "booked";
      else if (!meetsAdvanceTime) reason = "too-soon";
      else if (!withinOperating) reason = "closed";

      const availableNow = withinOperating && !hasConflict && meetsAdvanceTime;

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

    // ✅ 5-hour rule validation based on selected date + slot
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

  // Load upcoming bookings for manage tab
  useEffect(() => {
    async function fetchMyBookings() {
      if (!user?.id) return;
      setLoadingMyBookings(true);

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, reference_code, business_date, start_at, end_at, status, package_id, duration_hours, extension_hours, payment_proof_url")
        .eq("user_id", user.id)
        .in("status", ["pending", "confirmed"])
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true });

      if (!error) setMyBookings(data || []);
      setLoadingMyBookings(false);
    }

    fetchMyBookings();
  }, [user?.id]);

  // Fetch reschedule conflicts
  useEffect(() => {
    async function fetchBookingsForReschedDate() {
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

      const filtered = (data || []).filter((b) => b.id !== reschedBooking?.id);
      if (!error) setReschedBookings(filtered);
    }

    fetchBookingsForReschedDate();
  }, [reschedOpen, reschedDateISO, reschedBooking?.id]);

  const reschedAvailability = useMemo(() => {
    if (!reschedOpen) return [];

    const dur = Number(reschedBooking?.duration_hours || BASE_DURATION_HOURS);
    const ext = Number(reschedBooking?.extension_hours || 0);
    const totalHours = dur + ext;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);

    return slotHours.map((h) => {
      const start = computeDateTime(reschedDateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(reschedDateISO, 26);
      const withinOperating = end <= operatingEnd;

      const meetsAdvanceTime = start >= minAllowed;

      const blockedStart = new Date(start.getTime() - BUFFER_HOURS * 3600 * 1000);
      const blockedEnd = new Date(end.getTime() + BUFFER_HOURS * 3600 * 1000);

      const hasConflict = reschedBookings.some((b) => {
        const bStart = new Date(b.start_at);
        const bEnd = new Date(b.end_at);
        const bBlockedStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
        const bBlockedEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);
        return intersects(blockedStart, blockedEnd, bBlockedStart, bBlockedEnd);
      });

      let reason = "";
      if (hasConflict) reason = "booked";
      else if (!meetsAdvanceTime) reason = "too-soon";
      else if (!withinOperating) reason = "closed";

      return {
        hour: h,
        label: labelHour(h),
        available: withinOperating && meetsAdvanceTime && !hasConflict,
        reason,
      };
    });
  }, [reschedOpen, reschedDateISO, reschedBookings, slotHours, reschedBooking?.duration_hours, reschedBooking?.extension_hours]);

  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    setPayOpen(true);
  }

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

      // ✅ Use RPC create_booking (as in your current file)
      const { data: bookingRow, error: bookErr } = await supabase.rpc("create_booking", { data: payload });
      if (bookErr) throw bookErr;

      // Optional notify route
      try {
        await fetch("/api/booking-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminEmail: ADMIN_EMAIL, bookingId: bookingRow?.id, proofUrl }),
        });
      } catch {
        // ignore notify failure
      }

      setSuccessBooking(bookingRow);
      setPayOpen(false);

      // reset booking form
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

      {/* Tabs */}
      <div className="w-full max-w-xs">
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
          Select Option
        </label>

        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          className="w-full bg-white border border-rose-100 rounded-xl px-3 py-3 text-sm text-slate-700"
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
            packages.map((p) => {
              const pid = Number(p.id);
              const policy = PACKAGE_POLICIES[pid];
              const consumable = policy?.rental_fees_inclusions?.consumable_amount ?? null;
              const roomRentalOnly = policy?.rental_fees_inclusions?.room_rental_only ?? false;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[12px] uppercase tracking-widest text-slate-400">{p.name}</p>

                      {/* ✅ Removed "/ 3 hours" display */}
                      <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                        ₱{Number(p.rental_fee).toLocaleString()}
                      </h3>

                      <div className="mt-2 space-y-1 min-w-0">
                        <p className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                          Capacity up to {p.capacity} guests
                        </p>
                        <p className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                          {roomRentalOnly ? (
                            <>
                              <span className="sm:hidden">Room-only</span>
                              <span className="hidden sm:inline">Room rental only</span>
                            </>
                          ) : (
                            <>
                              <span className="sm:hidden">Cons: {formatPeso(consumable)}</span>
                              <span className="hidden sm:inline">Consumable: {formatPeso(consumable)}</span>
                            </>
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
                  onChange={(e) => setForm((f) => ({ ...f, extension_hours: Number(e.target.value) }))}
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
            type="button"
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* ✅ Manage Bookings merged into Booking tab */}
      {tab === "manage" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6">
            <h3 className="text-lg md:text-xl font-semibold text-slate-800">Upcoming Bookings</h3>
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
            <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 text-slate-500 text-sm">
              No upcoming bookings.
            </div>
          ) : (
            myBookings.map((b) => {
              const allowResched = canReschedule(b.start_at);

              return (
                <div key={b.id} className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Reference</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {b.reference_code || b.id}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        Date: <b>{b.business_date}</b> • Start:{" "}
                        <b>{new Date(b.start_at).toLocaleString()}</b>
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
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                      2. Rental Fees & Inclusions
                    </p>
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

      {/* ✅ Reschedule Modal */}
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

      {/* Payment Popup Modal */}
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
    </div>
  );
}