"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const OPERATING_START_HOUR = 10;
const BASE_DURATION_HOURS = 3;
const BUFFER_HOURS = 1;
const MAX_EXTENSION_HOURS = 2;

const DEPOSIT_AMOUNT = 1000; // ₱1,000 non-refundable fee (per your rule) [1](https://onedrive.live.com/?id=b611d747-f510-449d-92fe-356dfe0e7611&cid=933e55cc8541ec41&web=1)
const QR_IMAGE_PATH = "/images/gcash-qr.jpg"; // put [Gcash QR.jpg](https://onedrive.live.com/?id=03dd12cf-433c-4f31-8310-7768b023f9b7&cid=933e55cc8541ec41&web=1&EntityRepresentationId=0a342549-72a5-436e-a307-f4de0c1be808) here [2](https://onedrive.live.com/?id=03dd12cf-433c-4f31-8310-7768b023f9b7&cid=933e55cc8541ec41&web=1)

// Admin email (use a real email address)
const ADMIN_EMAIL = "booking@jujabrewandbites.com"; // adjust if needed

function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function buildSlotHours() {
  const hours = [];
  for (let h = OPERATING_START_HOUR; h <= 23; h++) hours.push(h);
  hours.push(24, 25); // 12AM, 1AM next day
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

export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);

  // PAYMENT MODAL STATE
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

  // Autofill from loyalty profile / auth user
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

  // Fetch bookings for the business window (10AM -> 2AM next day)
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, 10);
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

      return {
        hour: h,
        label: labelHour(h),
        available: withinOperating && !hasConflict,
      };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  function selectSlot(h) {
    setSelectedHour(h);
    setTab("book");
    setNotice(null);
  }

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

    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    if (extensionHours < 0 || extensionHours > MAX_EXTENSION_HOURS) {
      return `Extension must be 0–${MAX_EXTENSION_HOURS} hours.`;
    }

    return null;
  }

  // Click Book Now -> open payment popup
  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) {
      setNotice(err);
      return;
    }
    setPayOpen(true);
  }

  // Upload proof + create booking + email admin
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
      // 1) Upload screenshot to Supabase Storage
      const ext = proofFile.name.split(".").pop() || "jpg";
      const path = `${user?.id || "guest"}/${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

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

      // 2) Create booking record
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

        status: "pending",
        deposit_amount: DEPOSIT_AMOUNT,
        payment_status: "submitted",
        payment_proof_url: proofUrl,
      };

      const { data: bookingRow, error: bookErr } = await supabase
        .from("function_room_bookings")
        .insert([payload])
        .select()
        .single();

      if (bookErr) throw bookErr;

      // 3) Call server route to email admin (with screenshot)
      const res = await fetch("/api/booking-notify", {
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

      if (!res.ok) {
        // booking is saved even if email fails; show notice
        const t = await res.text();
        setNotice(`✅ Booking saved. (Email notify failed: ${t})`);
      } else {
        setNotice("✅ Booking saved and payment proof sent to admin!");
      }

      // reset UI
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

  // Preview uploaded image
  useEffect(() => {
    if (!proofFile) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          Booking duration is 3 hours + optional extension.
        </p>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {[
          { id: "availability", label: "Check Availability" },
          { id: "packages", label: "Check Packages" },
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
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Select Date
              </p>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
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
            Operating hours: 10:00 AM – 2:00 AM (next day). Buffer rule: 1 hour before &amp; after every booking.
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

      {/* PACKAGES */}
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
                      Capacity up to {p.capacity} guests • Extension max {p.extension_max_hours} hours
                    </p>
                  </div>

                  <button
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
            ))
          )}
        </div>
      )}

      {/* BOOK NOW */}
      {tab === "book" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Selected
              </p>
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

          {/* Package */}
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
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", "text", "Full name"],
              ["event_type", "Event (Birthday/Gathering/Meeting)", "text", "Birthday"],
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
                    setForm((f) => ({ ...f, extend: "yes", extension_hours: f.extension_hours || 1 }))
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
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* PAYMENT POPUP MODAL */}
      {payOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setPayOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-7 max-h-[90vh] overflow-y-auto"
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
                <b>₱{DEPOSIT_AMOUNT.toLocaleString()}</b> non-refundable fee is required. [1](https://onedrive.live.com/?id=b611d747-f510-449d-92fe-356dfe0e7611&cid=933e55cc8541ec41&web=1)
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                  Scan QR to Pay
                </p>
                {QR_IMAGE_PATH}
                <p className="text-[10px] text-slate-400 mt-2">
                  (QR image from [Gcash QR.jpg](https://onedrive.live.com/?id=03dd12cf-433c-4f31-8310-7768b023f9b7&cid=933e55cc8541ec41&web=1&EntityRepresentationId=0a342549-72a5-436e-a307-f4de0c1be808) placed in <b>public/images/gcash-qr.jpg</b>) [2](https://onedrive.live.com/?id=03dd12cf-433c-4f31-8310-7768b023f9b7&cid=933e55cc8541ec41&web=1)
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
                    {proofPreview} alt="Payment proof preview" className="w-full object-cover" />
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
                This will send your screenshot to admin for booking notification.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}