"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function manilaMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-01`;
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthGrid(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addUtcDays(monthStart, -mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => addUtcDays(gridStart, index));
  return {
    year,
    month,
    days,
    startISO: isoDate(days[0]),
    endISO: isoDate(addUtcDays(days[days.length - 1], 1)),
  };
}

function moveMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  return isoDate(new Date(Date.UTC(year, month - 1 + delta, 1)));
}

function monthTitle(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function timeLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function BookingCalendarModal({ open, onClose, onError }) {
  const [monthKey, setMonthKey] = useState(manilaMonthKey);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const grid = useMemo(() => monthGrid(monthKey), [monthKey]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    supabase
      .rpc("list_pos_booking_calendar", {
        p_start_date: grid.startISO,
        p_end_date: grid.endISO,
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          onError?.(error.message);
          setBookings([]);
          return;
        }
        setBookings(Array.isArray(data) ? data : []);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, grid.startISO, grid.endISO]);

  const bookingsByDate = useMemo(() => {
    const grouped = new Map();
    bookings.forEach((booking) => {
      const key = String(booking.business_date || "");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(booking);
    });
    return grouped;
  }, [bookings]);

  const stats = useMemo(
    () => {
      const monthPrefix = monthKey.slice(0, 7);
      const monthBookings = bookings.filter((booking) => String(booking.business_date || "").startsWith(monthPrefix));
      return {
        total: monthBookings.length,
        confirmed: monthBookings.filter((booking) => booking.status === "confirmed").length,
        pending: monthBookings.filter((booking) => booking.status === "pending").length,
      };
    },
    [bookings, monthKey]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#FC687D]">View Only</p>
            <h2 className="text-xl font-black text-slate-800">Booking Calendar</h2>
            <p className="mt-1 text-xs text-slate-500">Pending and confirmed function-room bookings only.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonthKey(moveMonth(monthKey, -1))} className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-lg text-slate-600" aria-label="Previous month">←</button>
            <button type="button" onClick={() => setMonthKey(manilaMonthKey())} className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-bold uppercase tracking-wider text-[#FC687D]">Today</button>
            <button type="button" onClick={() => setMonthKey(moveMonth(monthKey, 1))} className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-lg text-slate-600" aria-label="Next month">→</button>
            <button type="button" onClick={onClose} className="ml-1 h-9 w-9 rounded-full bg-slate-100 text-xs font-bold text-slate-500" aria-label="Close calendar">X</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h3 className="text-lg font-black text-slate-800">{monthTitle(monthKey)}</h3>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Bookings {stats.total}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">Confirmed {stats.confirmed}</span>
            <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-700">Pending {stats.pending}</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-50 p-3">
          <div className="min-w-[980px] overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100">
              {WEEKDAYS.map((day) => <div key={day} className="border-l border-slate-200 px-2 py-2 text-center text-[10px] font-bold tracking-widest text-slate-500 first:border-l-0">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {grid.days.map((day) => {
                const dayISO = isoDate(day);
                const rows = bookingsByDate.get(dayISO) || [];
                const currentMonth = day.getUTCMonth() + 1 === grid.month;
                return (
                  <div key={dayISO} className={`min-h-32 border-b border-l border-slate-200 p-2 first:border-l-0 ${currentMonth ? "bg-white" : "bg-slate-50/80"}`}>
                    <div className={`mb-2 text-xs font-bold ${currentMonth ? "text-slate-700" : "text-slate-300"}`}>{day.getUTCDate()}</div>
                    <div className="space-y-1.5">
                      {rows.map((booking) => (
                        <div key={booking.id} className={`rounded-lg border p-2 ${booking.status === "confirmed" ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50"}`}>
                          <div className="flex items-start justify-between gap-1">
                            <p className="truncate text-[10px] font-bold text-slate-800">{booking.customer_name || "Unnamed customer"}</p>
                            <span className={`shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase ${booking.status === "confirmed" ? "bg-emerald-200 text-emerald-800" : "bg-sky-200 text-sky-800"}`}>{booking.status}</span>
                          </div>
                          <p className="mt-1 text-[9px] font-semibold text-slate-600">{timeLabel(booking.start_at)}–{timeLabel(booking.end_at)}</p>
                          <p className="mt-0.5 truncate text-[9px] text-slate-500">{booking.package_name} · {booking.guest_count || 0} guests</p>
                          <p className="mt-0.5 truncate text-[8px] text-slate-400">{booking.event_type || "Event"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {loading ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40"><div className="h-9 w-9 animate-spin rounded-full border-4 border-rose-100 border-t-[#FC687D]" /></div> : null}
        </div>
      </div>
    </div>
  );
}
