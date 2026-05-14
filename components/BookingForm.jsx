"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const OPERATING_START_HOUR = 10; // 10AM
const OPERATING_END_HOUR_NEXT_DAY = 2; // 2AM next day
const BASE_DURATION_HOURS = 3; // per guideline [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
const BUFFER_HOURS = 1; // your rule

function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Business-day slots:
 * date selected is the "business_date".
 * Slots from 10:00 of business_date through 01:00 of next day (hour 25),
 * presented as hourly starts.
 */
function buildSlotHours() {
  // 10..23 plus 24..25 (12AM, 1AM next day)
  const hours = [];
  for (let h = 10; h <= 23; h++) hours.push(h);
  hours.push(24, 25);
  return hours;
}

function labelHour(h) {
  // h can be 10..25
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}

function computeStartAt(businessDateISO, hourLike) {
  // hourLike can be 10..25
  const base = new Date(`${businessDateISO}T00:00:00`);
  const h = hourLike % 24;
  const dayAdd = hourLike >= 24 ? 1 : 0;
  const dt = new Date(base);
  dt.setDate(dt.getDate() + dayAdd);
  dt.setHours(h, 0, 0, 0);
  return dt;
}

function intersects(aStart, aEnd, bStart, bEnd) {
  // [start, end) overlap check
  return aStart < bEnd && aEnd > bStart;
}

export default function BookingTab({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedHour, setSelectedHour] = useState(null);

  // booking form state
  const [form, setForm] = useState({
    name: "",
    event_type: "",
    contact_number: "",
    email: "",
    city: "",
    guest_count: 1,
    package_id: "",
    extend: "no", // yes/no
    extension_hours: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  // Prefill from loyalty profile
  useEffect(() => {
    setForm((f) => ({
      ...f,
      name: f.name || member?.customer_name || "",
      contact_number: f.contact_number || member?.["Phone"] || "",
      email: f.email || member?.["Email"] || user?.email || "",
      city: f.city || member?.["City"] || "",
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

      if (!error && data) setPackages(data);
      setLoadingPackages(false);
    }
    fetchPackages();
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((p) => String(p.id) === String(form.package_id)),
    [packages, form.package_id]
  );

  // Fetch bookings in the business-day window (10AM to 2AM next day)
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeStartAt(dateISO, 10);
      const dayEnd = computeStartAt(dateISO, 26); // 2AM next day = hour 26

      // widen by buffer so UI can detect conflicts near edges
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

  // Compute availability for each slot hour for current selections
  const availability = useMemo(() => {
    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    return slotHours.map((h) => {
      const start = computeStartAt(dateISO, h);

      // total event duration
      const totalHours = BASE_DURATION_HOURS + extensionHours;

      const end = new Date(start.getTime() + totalHours * 3600 * 1000);

      // operating end = 2AM next day
      const operatingEnd = computeStartAt(dateISO, 26);
      // enforce end not beyond 2AM next day
      const withinOperating = end <= operatingEnd;

      // buffer window for overlap checking
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
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  function selectSlot(h) {
    setSelectedHour(h);
    setTab("book");
    setNotice(null);
  }

  async function submitBooking() {
    setNotice(null);

    // basic validation
    if (!form.name.trim()) return setNotice("Name is required.");
    if (!form.event_type.trim()) return setNotice("Event type is required.");
    if (!dateISO) return setNotice("Date is required.");
    if (selectedHour == null) return setNotice("Time is required.");
    if (!form.package_id) return setNotice("Please select a package.");
    if (!form.contact_number.trim()) return setNotice("Contact number is required.");
    if (!form.email.trim()) return setNotice("Email address is required.");
    if (!form.guest_count || Number(form.guest_count) < 1)
      return setNotice("Guest count must be at least 1.");

    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    if (extensionHours < 0 || extensionHours > 2) {
      return setNotice("Extension must be 0–2 hours.");
    }

    // compute start_at
    const start = computeStartAt(dateISO, selectedHour);
    const payload = {
      user_id: user?.id || null,
      member_id: member?.id || null,
      package_id: Number(form.package_id),

      customer_name: form.name.trim(),
      event_type: form.event_type.trim(),
      contact_number: form.contact_number.trim(),
      email: form.email.trim(),

      guest_count: Number(form.guest_count),
      business_date: dateISO,

      start_at: start.toISOString(),
      extension_hours: extensionHours,
      duration_hours: BASE_DURATION_HOURS, // 3 hours per guideline [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
      status: "pending",
      // end_at and blocked_range are computed by DB trigger
    };

    setSubmitting(true);

    const { data, error } = await supabase
      .from("function_room_bookings")
      .insert([payload])
      .select()
      .single();

    setSubmitting(false);

    if (error) {
      // If overlap constraint hits, show user-friendly message
      if (String(error.message || "").toLowerCase().includes("no_overlap_function_room")) {
        setNotice("That time just got booked. Please pick another slot.");
      } else {
        setNotice(error.message);
      }
      return;
    }

    setNotice("✅ Booking request submitted!");
    // refresh bookings
    setSelectedHour(null);
    // force re-fetch by updating date state to itself
    setDateISO((d) => d);
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          3 hours per booking + optional extension (per hour)
        </p>
      </div>

      {/* sub tabs */}
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
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Select Date</p>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
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
            Operating hours: 10:00 AM – 2:00 AM (next day). Buffer rule: 1 hour before/after every booking.
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
                      Capacity: up to {p.capacity} guests • Extension max: {p.extension_max_hours} hours [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
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

                {p.included_food_value != null && (
                  <p className="text-[12px] text-slate-700 mt-3">
                    Includes food &amp; drinks worth ₱{Number(p.included_food_value).toLocaleString()} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
                  </p>
                )}

                <div className="mt-3 space-y-1 text-[12px] text-slate-700 leading-relaxed">
                  {p.extension_option1 && <p>⏱ {p.extension_option1} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)</p>}
                  {p.extension_option2 && <p>⏱ {p.extension_option2} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)</p>}
                  {p.inclusions && <p>🎉 {p.inclusions}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* BOOK NOW */}
      {tab === "book" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Selected</p>
              <p className="text-[12px] text-slate-800 mt-1">
                Date: <b>{dateISO}</b>
                {selectedHour != null ? (
                  <>
                    {" "}• Time: <b>{labelHour(selectedHour)}</b>
                  </>
                ) : (
                  <> • Time: <b>Not selected</b></>
                )}
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

          {/* Package selection */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
              Package
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

            {selectedPackage && (
              <p className="text-[11px] text-slate-500 mt-2">
                {selectedPackage.inclusions}
              </p>
            )}
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Event Type
              </label>
              <input
                value={form.event_type}
                onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="Birthday, gathering, meeting…"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Contact Number
              </label>
              <input
                value={form.contact_number}
                onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="09XX XXX XXXX"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Email Address
              </label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="name@email.com"
              />
            </div>

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
                City (optional)
              </label>
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="e.g. QC"
              />
            </div>

            <div className="md:col-span-2">
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
              <p className="text-[11px] text-slate-500 mt-2">
                Base duration is 3 hours; extension is up to 2 hours (depends on package policy). [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
              </p>
            </div>
          </div>

          <button
            onClick={submitBooking}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Book Now"}
          </button>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Notes: Booking is subject to availability. Some packages include specific rules and fees. [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=3a1d8df4-22b8-41c6-87ee-74156b1201e7&cid=933e55cc8541ec41)
          </p>
        </div>
      )}
    </div>
  );
}