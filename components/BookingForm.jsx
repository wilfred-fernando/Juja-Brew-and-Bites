"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* =======================
   Business Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BASE_DURATION_HOURS = 3; // 3 hours
const BUFFER_HOURS = 1; // 1 hour gap before & after (your rule)
const MAX_EXTENSION_HOURS = 2; // extension max 2 hours
const MIN_ADVANCE_DAYS = 3; // must be at least 3 days in advance

// Deposit policy (current): ₱1,000 non-refundable to confirm booking
const DEPOSIT_AMOUNT = 1000;

// Put QR image here: public/images/qrph.jpg
const QR_IMAGE_PATH = "/images/qrph.jpg";

// Optional admin notify (if you implement /api/booking-notify)
const ADMIN_EMAIL = "booking@jujabrewandbites.com";

/* =====================================================
   PACKAGE POLICIES (1–6) — Full Details content
   (All text extracted/normalized from your guidelines)
===================================================== */
const PACKAGE_POLICIES = {
  1: {
    name: "Package 1",
    room_usage: {
      capacity: "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
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
      capacity: "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
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
      capacity: "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
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
      capacity: "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
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
      capacity: "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
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
      capacity: "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

  // Modals
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState(null);

  const [payOpen, setPayOpen] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // ✅ Book Now form restored
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

  // Availability computation
  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalHours = BASE_DURATION_HOURS + ext;

    return slotHours.map((h) => {
      const start = computeDateTime(dateISO, h);
      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      const operatingEnd = computeDateTime(dateISO, 26); // 2AM next day
      const withinOperating = end <= operatingEnd;

      const blockedStart = new Date(start.getTime() - BUFFER_HOURS * 3600 * 1000);
      const blockedEnd = new Date(end.getTime() + BUFFER_HOURS * 3600 * 1000);

      const hasConflict = bookings.some((b) => {
        const bStart = new Date(b.start_at);
        const bEnd = new Date(b.end_at);

        const bBlockedStart = new Date(bStart.getTime() - BUFFER_HOURS * 3600 * 1000);
        const bBlockedEnd = new Date(bEnd.getTime() + BUFFER_HOURS * 3600 * 1000);

        return intersects(blockedStart, blockedEnd, bBlockedStart, bBlockedEnd);
      });

      return { hour: h, label: labelHour(h), available: withinOperating && !hasConflict };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  function validateBookingInputs() {
    setNotice(null);

    const minDate = toISODate(addDays(new Date(), MIN_ADVANCE_DAYS));
    if (dateISO < minDate) return `Booking must be at least ${MIN_ADVANCE_DAYS} days in advance.`;

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

  async function confirmPaymentAndSubmit() {
    const err = validateBookingInputs();
    if (err) {
      setNotice(err);
      setPayOpen(false);
      return;
    }
    if (!proofFile) return setNotice("Please attach a screenshot of your payment confirmation.");

    const extensionHours = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const start = computeDateTime(dateISO, selectedHour);

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

      // Insert booking
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

      // Optional notify
      try {
        await fetch("/api/booking-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminEmail: ADMIN_EMAIL, bookingId: bookingRow.id, proofUrl }),
        });
      } catch {}

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

  const selectedPolicy = PACKAGE_POLICIES[Number(form.package_id)] || null;

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          Booking is <b>{BASE_DURATION_HOURS} hours</b> + optional extension (max {MAX_EXTENSION_HOURS} hours).
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

      {/* AVAILABILITY */}
      {tab === "availability" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Select Date</p>
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
            Operating hours: <b>10:00 AM – 2:00 AM</b> (next day). Buffer rule: <b>1 hour</b> before &amp; after.
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
                  <p className="text-[10px] text-slate-400 mt-1">{s.available ? "Available" : "Unavailable"}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PACKAGES */}
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
                <div key={p.id} className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[12px] uppercase tracking-widest text-slate-400">{p.name}</p>
                      <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                        ₱{Number(p.rental_fee).toLocaleString()} / 3 hours
                      </h3>

                      {/* ✅ Replace extension line with consumable or room rental only */}
                      {pid >= 1 && pid <= 3 ? (
                        <p className="text-[11px] text-slate-500 mt-2">
                          Capacity up to {p.capacity} guests • Consumable: <b>{formatPeso(consumable)}</b>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 mt-2">
                          Capacity up to {p.capacity} guests • <b>Room rental only</b>
                        </p>
                      )}
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

                  {/* ✅ Removed: inclusions text from package card (as requested) */}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* BOOK NOW (FORM RESTORED) */}
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

          {/* Package selection (✅ remove the long inclusion text here) */}
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

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", "text", "Full name"],
              ["event_type", "Event Type", "text", "Birthday, Gathering, etc."],
              ["contact_number", "Contact Number", "tel", "09XX XXX XXXX"],
              ["email", "Email Address", "email", "name@email.com"],
            ].map(([key, lbl, type, ph]) => (
              <div key={key}>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{lbl}</label>
                <input
                  type={type}
                  value={form[key] ?? ""}
                  placeholder={ph}
                  onChange={(e) => setForm((f) => ({ ...f, [key]:et.value }))}
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
                  onClick={() => setForm((f) => ({ ...f, extend: "yes", extension_hours: f.extension_hours || 1 }))}
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
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* FULL DETAILS MODAL (ALL PACKAGES INCLUDED) */}
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

              if (!policy) {
                return (
                  <div className="text-slate-700">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold">Package Details</h3>
                      <button
                        onClick={() => setDetailsOpen(false)}
                        className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                    <p>No policy details found for this package.</p>
                  </div>
                );
              }

              const rfi = policy.rental_fees_inclusions;

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Full Details</p>
                      <h3 className="text-xl md:text-2xl font-semibold text-slate-900 mt-1">
                        {policy.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => setDetailsOpen(false)}
                      className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 2. ROOM USAGE */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">2. Room Usage</p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      <li>• {policy.room_usage.capacity}</li>
                      <li>• {policy.room_usage.additional_guests}</li>
                      <li>• {policy.room_usage.rental_duration}</li>
                      {policy.room_usage.extension?.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>

                  {/* 3. RENTAL FEES & INCLUSIONS */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                      3. Rental Fees &amp; Inclusions
                    </p>
                    <p className="text-[12px] text-slate-700 mb-3">• {rfi.rental_fee}</p>

                    <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                      Package Includes
                    </p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      {rfi.package_includes.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>

                    <p className="text-[12px] text-slate-700 mt-3">
                      • {rfi.room_rental_only ? <b>Room rental only</b> : <>Consumable: <b>{formatPeso(rfi.consumable_amount)}</b></>}
                    </p>
                  </div>

                  {/* 5. FOOD & BEVERAGES */}
                  <div className="bg-white border border-rose-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-rose-600 mb-2">
                      5. Food &amp; Beverages
                    </p>

                    <p className="text-[12px] text-slate-700 mb-2">• {policy.food_beverages.policy}</p>

                    {policy.food_beverages.corkage?.length > 0 && (
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

      {/* PAYMENT POPUP MODAL */}
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
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">Secure Your Booking</h3>
              <button
                onClick={() => setPayOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-slate-700">
              <p className="text-sm leading-relaxed">
                To secure your booking, a <b>₱{DEPOSIT_AMOUNT.toLocaleString()}</b> non-refundable fee is required.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Scan QR to Pay</p>
                <img
                  src={QR_IMAGE_PATH}
                  alt="Payment QR Code"
                  className="w-full max-w-[320px] mx-auto rounded-xl border border-slate-200 bg-white0"
                />
                <p className="text-[12px] text-slate-700 mt-3">
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
                    <img src={proofPreview} alt="Payment proof preview" className="w-full object-cover" />
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}