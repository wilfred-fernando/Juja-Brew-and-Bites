"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const OPERATING_START_HOUR = 10; // 10AM
const OPERATING_END_HOUR_NEXT_DAY = 2; // 2AM next day (closing)
const BASE_DURATION_HOURS = 3; // booking is good for 3 hours [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
const BUFFER_HOURS = 1; // 1 hour gap before & after (your rule)
const MAX_EXTENSION_HOURS = 2; // per guidelines max extension of 2 hours [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)

function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function buildSlotHours() {
  // Business date slots: 10..23 plus 24..25 (12AM, 1AM next day)
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

export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    event_type: "",
    contact_number: "",
    email: "",
    guest_count: 1,
    package_id: "",
    extend: "no", // yes/no
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

  // Fetch bookings for the business window: 10AM business day -> 2AM next day
  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR); // 10AM
      const dayEnd = computeDateTime(dateISO, 26); // 2AM next day = hour 26

      // widen query window slightly so UI can calculate buffer conflicts reliably
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

      // operating end boundary = 2AM next day
      const operatingEnd = computeDateTime(dateISO, 26);
      const withinOperating = end <= operatingEnd;

      // apply buffer (1h before & after)
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

    if (!form.name.trim()) return setNotice("Name is required.");
    if (!form.event_type.trim()) return setNotice("Event type is required.");
    if (!dateISO) return setNotice("Date is required.");
    if (selectedHour == null) return setNotice("Time is required.");
    if (!form.package_id) return setNotice("Please select a package.");
    if (!form.contact_number.trim()) return setNotice("Contact number is required.");
    if (!form.email.trim()) return setNotice("Email address is required.");

    const guests = Number(form.guest_count || 0);
    if (!guests || guests < 1) return setNotice("No. of guests must be at least 1.");

    const extensionHours =
      form.extend === "yes" ? Number(form.extension_hours || 0) : 0;

    if (extensionHours < 0 || extensionHours > MAX_EXTENSION_HOURS) {
      return setNotice(`Extension must be 0–${MAX_EXTENSION_HOURS} hours.`);
    }

    // Compute start_at
    const start = computeDateTime(dateISO, selectedHour);

    // Optional UI validation vs package capacity (soft check)
    if (selectedPackage?.capacity && guests > Number(selectedPackage.capacity)) {
      // not blocking, but warning
      setNotice(
        `Note: Guests exceed package capacity (${selectedPackage.capacity}). Please confirm with staff.`
      );
    }

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

      guest_count: guests,
      contact_number: form.contact_number.trim(),
      email: form.email.trim(),

      status: "pending",
      // end_at + blocked_range are best computed by DB trigger if you created it
    };

    setSubmitting(true);
    const { error } = await supabase
      .from("function_room_bookings")
      .insert([payload]);

    setSubmitting(false);

    if (error) {
      // If you added the exclusion constraint, this is the friendly overlap message:
      if (String(error.message || "").toLowerCase().includes("overlap")) {
        setNotice("That time just got booked. Please pick another slot.");
      } else {
        setNotice(error.message);
      }
      return;
    }

    setNotice("✅ Booking request submitted!");
    setSelectedHour(null);
    setTab("availability");

    // refresh bookings
    setDateISO((d) => d);
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          Booking duration is 3 hours + optional extension (per hour). [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
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
                      Capacity up to {p.capacity} guests • Extension max {p.extension_max_hours} hours [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
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
                    Includes food &amp; drinks worth ₱{Number(p.included_food_value).toLocaleString()} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
                  </p>
                )}

                <div className="mt-3 space-y-1 text-[12px] text-slate-700 leading-relaxed">
                  {p.extension_option1 && <p>⏱ {p.extension_option1} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)</p>}
                  {p.extension_option2 && <p>⏱ {p.extension_option2} [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)</p>}
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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Selected
              </p>
              <p className="text-[12px] text-slate-800 mt-1">
                Date: <b>{dateISO}</b>{" "}
                • Time: <b>{selectedHour != null ? labelHour(selectedHour) : "Not selected"}</b>
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
            {selectedPackage?.inclusions && (
              <p className="text-[11px] text-slate-500 mt-2">{selectedPackage.inclusions}</p>
            )}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Event (Birthday / Gathering / Meeting)
              </label>
              <input
                value={form.event_type}
                onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="Birthday, gathering, meeting…"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">Contact Number</label>
              <input
                value={form.contact_number}
                onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="09XX XXX XXXX"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">Email Address</label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                placeholder="name@email.com"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">No. of Guests</label>
              <input
                type="number"
                min={1}
                value={form.guest_count}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guest_count: Number(e.target.value) }))
                }
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
              <p className="text-[11px] text-slate-500 mt-2">
                Extension maximum is 2 hours (package rules). [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
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
            Booking is 3 hours by default and subject to availability. [1](https://onedrive.live.com/?id=f843ae32-d8e7-471e-ac6b-6df8c2be2e65&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com/?id=59bf9663-3984-4de8-8ac9-768f0de4f497&cid=933e55cc8541ec41&web=1)
          </p>
        </div>
      )}
    </div>
  );
}