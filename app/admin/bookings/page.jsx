"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

/* =======================
 Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BOOKING_SLOT_HOURS = [10, 14, 18, 22];
const BASE_BOOKING_MINUTES = 3 * 60;
const MAX_EXTENSION_HOURS = 5;
const PAYMENT_HOLD_HOURS = 24;
const EXPIRED_BOOKING_STATUS = "expired";
const BOOKING_TIME_ZONE = "Asia/Manila";
const BOOKING_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clampExtensionHours(value) {
  return Math.max(0, Math.min(MAX_EXTENSION_HOURS, Number(value || 0)));
}

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
function startOfWeek(date, weekStartsOn = 1) {
  // weekStartsOn: 0=Sun, 1=Mon
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function buildSlotHours() {
  return BOOKING_SLOT_HOURS;
}
function labelHour(h) {
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}
function labelBookingSlot(hour) {
  return `${labelHour(hour).replace(" (+1)", "")} - ${labelHour(hour + 3)}`;
}
function editSlotHours(currentHour) {
  const hour = Number(currentHour);
  return BOOKING_SLOT_HOURS.includes(hour)
    ? BOOKING_SLOT_HOURS
    : [...BOOKING_SLOT_HOURS, hour].sort((a, b) => a - b);
}
function computeDateTime(dateISO, hourLike) {
  const [year, month, day] = String(dateISO).split("-").map(Number);
  const h = hourLike % 24;
  const dayAdd = hourLike >= 24 ? 1 : 0;
  return new Date(Date.UTC(year, month - 1, day + dayAdd, h - 8, 0, 0, 0));
}
function computeEndAt(startAt, extensionHours) {
  const totalMinutes = BASE_BOOKING_MINUTES + Number(extensionHours || 0) * 60;
  return new Date(startAt.getTime() + totalMinutes * 60 * 1000);
}
function toManilaOffsetISOString(value) {
  const date = value instanceof Date ? value : new Date(value);
  const manila = new Date(date.getTime() + 8 * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}:00+08:00`;
}
function bookingParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute || 0),
  };
}
function bookingISODate(value) {
  const parts = bookingParts(value);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function bookingDateTime(value, fallback = "-") {
  const parts = bookingParts(value);
  if (!parts) return fallback;
  const hour12 = ((parts.hour + 11) % 12) + 1;
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  return `${parts.year}-${BOOKING_MONTHS[parts.month - 1]}-${String(parts.day).padStart(2, "0")} ${String(hour12).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ${suffix}`;
}
function bookingTime(value, fallback = "-") {
  const parts = bookingParts(value);
  if (!parts) return fallback;
  const hour12 = ((parts.hour + 11) % 12) + 1;
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  return `${hour12}:${String(parts.minute).padStart(2, "0")} ${suffix}`;
}
function isExpiredPaymentHold(booking, now = new Date()) {
  const status = String(booking?.status || "").toLowerCase();
  const paymentStatus = String(booking?.payment_status || "").toLowerCase();
  const hasProof = Boolean(booking?.payment_proof_url);

  if (status !== "pending" || paymentStatus !== "waiting_for_payment" || hasProof) return false;

  const createdAt = new Date(booking?.created_at || 0);
  if (Number.isNaN(createdAt.getTime())) return false;

  return now.getTime() - createdAt.getTime() >= PAYMENT_HOLD_HOURS * 3600000;
}
function withExpiredBookingStatus(booking, now = new Date()) {
  if (!booking) return booking;
  if (booking.status === EXPIRED_BOOKING_STATUS || isExpiredPaymentHold(booking, now)) {
    return { ...booking, status: EXPIRED_BOOKING_STATUS };
  }
  return booking;
}
function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString()}`;
}
function statusPill(status) {
  const map = {
    confirmed: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-blue-100 text-blue-700 border-blue-200",
    expired: "bg-slate-200 text-slate-700 border-slate-300",
    rejected: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled_gc: "bg-yellow-100 text-yellow-700 border-yellow-200",
    cancelled: "bg-slate-100 text-slate-700 border-slate-200",
    cancellation_requested: "bg-orange-100 text-orange-700 border-orange-200",
  };
  return map[status] || "bg-slate-100 text-slate-700 border-slate-200";
}
function niceStatus(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "pending") return "Pending";
  if (status === "expired") return "Expired";
  if (status === "rejected") return "Cancelled";
  if (status === "cancelled_gc") return "Gift Cert";
  if (status === "cancelled") return "Cancelled";
  if (status === "cancellation_requested") return "Cancel Request";
  return String(status || "—");
}
function calendarBookingTone(booking) {
  if (booking.status === "confirmed") return "border-emerald-200 bg-emerald-50/80 hover:border-emerald-400";
  if (booking.status === "cancellation_requested") return "border-orange-200 bg-orange-50/80 hover:border-orange-400";
  if (booking.status === "pending" && booking.payment_status === "submitted") {
    return "border-sky-200 bg-sky-50/80 hover:border-sky-400";
  }
  if (booking.status === "pending" && booking.payment_status === "cash_pending") {
    return "border-amber-200 bg-amber-50/80 hover:border-amber-400";
  }
  if (booking.status === "pending") return "border-blue-200 bg-blue-50/80 hover:border-blue-400";
  return "border-slate-200 bg-slate-50/80 hover:border-slate-400";
}

function calendarPaymentLabel(booking) {
  if (booking.payment_status === "submitted") return booking.payment_method === "QRPH" ? "QRPH proof" : "Proof submitted";
  if (booking.payment_status === "cash_pending") return "Cash pending";
  if (booking.payment_status === "waiting_for_payment") return "Awaiting payment";
  if (booking.payment_status === "approved") return "Payment approved";
  return String(booking.payment_status || "No payment status").replace(/_/g, " ");
}
function safeLower(s) {
  return String(s || "").toLowerCase();
}
function toCSV(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function hourLikeFromStartAt(startAt) {
  // Map 00:00/01:00 to 24/25 so it appears in operating grid.
  const h = bookingParts(startAt)?.hour ?? new Date(startAt).getHours();
  return h < OPERATING_START_HOUR ? h + 24 : h;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* =======================
 Small UI Components
======================= */
function StatCard({ label, value, sub, tone = "slate" }) {
  const toneMap = {
    slate: "border-slate-200",
    blue: "border-blue-200",
    green: "border-green-200",
    red: "border-red-200",
    yellow: "border-yellow-200",
    rose: "border-sky-200",
  };
  return (
    <div className={`bg-white rounded-2xl border ${toneMap[tone]} shadow-sm p-4`}>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-800 mt-1">{value}</p>
      {sub ? <p className="text-xs text-slate-500 mt-1">{sub}</p> : null}
    </div>
  );
}

function SectionTitle({ title, right }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {right || null}
    </div>
  );
}

function BarChart({ title, data, valueFormatter = (v) => v, colorClass = "bg-sky-500" }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value || 0)));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">Last {data.length} days</p>
      </div>
      <div className="mt-4 grid grid-cols-14 gap-1 items-end h-28">
        {data.map((d) => {
          const h = (Number(d.value || 0) / max) * 100;
          return (
            <div key={d.label} className="flex flex-col items-center justify-end gap-1">
              <div
                className={`w-full rounded-md ${colorClass}`}
                style={{ height: `${clamp(h, 3, 100)}%` }}
                title={`${d.label}: ${valueFormatter(d.value)}`}
              />
              <span className="text-[9px] text-slate-500">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutChart({ title, segments }) {
  const total = segments.reduce((a, s) => a + Number(s.value || 0), 0) || 1;
  let acc = 0;
  const stops = segments.map((s) => {
    const v = Number(s.value || 0);
    const start = (acc / total) * 100;
    acc += v;
    const end = (acc / total) * 100;
    return { ...s, start, end };
  });

  const gradient = `conic-gradient(${stops
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ")})`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">Status breakdown</p>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="w-24 h-24 rounded-full" style={{ background: gradient }} />
        <div className="space-y-2 text-sm">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
              <span className="text-slate-700">{s.label}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-700 font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =======================
 Component
======================= */
export default function AdminBookingsDashboard() {
  const [view, setView] = useState("dashboard"); // dashboard | calendar | list

  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [previewImage, setPreviewImage] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { type, booking } or { type, ids }
  const [actionLoading, setActionLoading] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [manualModal, setManualModal] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all"); // all | upcoming | past
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Calendar
  const [weekAnchorISO, setWeekAnchorISO] = useState(() => bookingISODate(new Date()));
  const slotHours = useMemo(() => buildSlotHours(), []);

  const realtimeRef = useRef(null);

  /* =======================
    RULES (centralized)
    - Past bookings: Edit/Approve/Reject disabled
    - Upcoming + Confirmed: Approve/Reject disabled (Edit allowed)
  ======================= */
  const now = new Date();

  const isPastBooking = (b) => new Date(b.start_at) < now;
  const isConfirmedBooking = (b) => b.status === "confirmed";
  const isExpiredBooking = (b) => withExpiredBookingStatus(b, now)?.status === EXPIRED_BOOKING_STATUS;
  const terminalBookingStatuses = new Set(["rejected", "cancelled", "cancelled_gc", EXPIRED_BOOKING_STATUS]);

  const disableEdit = (b) => isPastBooking(b) || isExpiredBooking(b);
  const disableApproveReject = (b) =>
    isPastBooking(b) || isConfirmedBooking(b) || terminalBookingStatuses.has(withExpiredBookingStatus(b, now)?.status);

  function statusUpdatePayload(type, booking) {
    const approving = type === "approve" || type === "approve_bulk";
    if (booking?.status === "cancellation_requested") {
      return approving ? { status: "cancelled_gc" } : { status: "confirmed" };
    }
    const nextStatus = approving ? "confirmed" : "cancelled";
    return approving
      ? { status: nextStatus, payment_status: "approved" }
      : { status: nextStatus };
  }

  async function approveCancellationWithGiftCertificate(bookingId) {
    const res = await fetch("/api/admin/booking-cancellation-gift-certificate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Unable to approve cancellation.");
    return {
      status: json?.booking?.status || "cancelled_gc",
      giftCertificate: json?.giftCertificate || null,
    };
  }

  async function approveBookingAndSendConfirmation(bookingId) {
    const res = await fetch("/api/admin/booking-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Unable to approve booking.");
    return json;
  }

  /* =======================
    Load Data + Realtime
  ======================= */
  async function loadAll() {
    setLoading(true);
    await fetch("/api/bookings/expire-stale", { method: "POST" }).catch(() => null);
    const [{ data: pkgData, error: pkgErr }, { data: bookingData, error: bookErr }] =
      await Promise.all([
        supabase.from("function_room_packages").select("*").order("id", { ascending: true }),
        supabase.from("function_room_bookings").select("*").order("start_at", { ascending: true }),
      ]);

    if (pkgErr) console.error(pkgErr);
    if (bookErr) console.error(bookErr);

    setPackages(pkgData || []);
    setBookings((bookingData || []).map((booking) => withExpiredBookingStatus(booking)));
    setSelectedIds(new Set());
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    try {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }

      const ch = supabase
        .channel("admin-bookings-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "function_room_bookings" },
          (payload) => {
            setBookings((prev) => {
              const next = [...prev];
              const row = payload.new || payload.old;
              const id = row?.id;
              if (!id) return prev;

              const idx = next.findIndex((x) => x.id === id);

              if (payload.eventType === "DELETE") {
                if (idx >= 0) next.splice(idx, 1);
                return next;
              }

              const normalized = withExpiredBookingStatus(payload.new);
              if (idx >= 0) next[idx] = withExpiredBookingStatus({ ...next[idx], ...(payload.new || {}) });
              else next.push(normalized);

              next.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
              return next;
            });
          }
        )
        .subscribe();

      realtimeRef.current = ch;

      return () => {
        if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
      };
    } catch {
      // ignore if realtime not enabled
    }
  }, []);

  /* =======================
    Lookups
  ======================= */
  const pkgById = useMemo(() => {
    const map = new Map();
    for (const p of packages) map.set(Number(p.id), p);
    return map;
  }, [packages]);

  /* =======================
    Analytics
  ======================= */
  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "cancellation_requested").length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const expired = bookings.filter((b) => b.status === EXPIRED_BOOKING_STATUS).length;
    const cancelled = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled_gc" || b.status === "cancelled").length;

    const revenueConfirmed = bookings
      .filter((b) => b.status === "confirmed")
      .reduce((sum, b) => {
        const pkg = pkgById.get(Number(b.package_id));
        return sum + Number(pkg?.rental_fee || 0);
      }, 0);

    const depositRevenue = bookings
      .filter((b) => b.payment_status === "submitted")
      .reduce((sum, b) => sum + Number(b.deposit_amount || 0), 0);

    const next7 = addDays(now, 7);
    const upcoming7 = bookings.filter((b) => {
      const s = new Date(b.start_at);
      return s >= now && s <= next7;
    }).length;

    return { total, pending, confirmed, expired, cancelled, revenueConfirmed, depositRevenue, upcoming7 };
  }, [bookings, pkgById, now]);

  const attentionBookings = useMemo(() => {
    const priority = (booking) => {
      if (booking.status === "cancellation_requested") return 0;
      if (booking.payment_status === "submitted") return 1;
      if (booking.payment_status === "cash_pending") return 2;
      return 3;
    };

    return bookings
      .map((booking) => withExpiredBookingStatus(booking, now))
      .filter((booking) => {
        if (new Date(booking.start_at) < now) return false;
        return (
          booking.status === "cancellation_requested" ||
          booking.payment_status === "submitted" ||
          booking.payment_status === "cash_pending"
        );
      })
      .sort((a, b) => priority(a) - priority(b) || new Date(a.start_at) - new Date(b.start_at))
      .slice(0, 6);
  }, [bookings, now]);

  const nextConfirmedBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status === "confirmed" && new Date(booking.start_at) >= now)
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
        .slice(0, 5),
    [bookings, now]
  );

  const last14DaysCharts = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const iso = toISODate(d);
      days.push({ iso, label: iso.slice(5), count: 0, revenue: 0 });
    }

    const dayMap = new Map(days.map((d) => [d.iso, d]));

    for (const b of bookings) {
      const iso = bookingISODate(b.start_at);
      const bucket = dayMap.get(iso);
      if (!bucket) continue;

      bucket.count += 1;
      if (b.status === "confirmed") {
        const pkg = pkgById.get(Number(b.package_id));
        bucket.revenue += Number(pkg?.rental_fee || 0);
      }
    }

    return {
      bookingsPerDay: days.map((d) => ({ label: d.label, value: d.count })),
      revenuePerDay: days.map((d) => ({ label: d.label, value: d.revenue })),
    };
  }, [bookings, pkgById]);

  const statusSegments = useMemo(() => {
    return [
      { label: "Pending", value: stats.pending, color: "#93C5FD" },
      { label: "Confirmed", value: stats.confirmed, color: "#86EFAC" },
      { label: "Expired", value: stats.expired, color: "#CBD5E1" },
      { label: "Cancelled", value: stats.cancelled, color: "#FDE68A" },
    ];
  }, [stats]);

  /* =======================
    List Filters + Results
  ======================= */
  const filteredBookings = useMemo(() => {
    let data = bookings.map((booking) => withExpiredBookingStatus(booking, now));

    if (q.trim()) {
      const qq = safeLower(q);
      data = data.filter((b) => {
        return (
          safeLower(b.customer_name).includes(qq) ||
          safeLower(b.reference_code).includes(qq) ||
          safeLower(b.event_type).includes(qq) ||
          safeLower(b.email).includes(qq) ||
          safeLower(b.contact_number).includes(qq)
        );
      });
    }

    if (statusFilter !== "all") data = data.filter((b) => b.status === statusFilter);

    if (timeFilter === "upcoming") data = data.filter((b) => new Date(b.start_at) >= now);
    if (timeFilter === "past") data = data.filter((b) => new Date(b.start_at) < now);

    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`);
      data = data.filter((b) => new Date(b.start_at) >= from);
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`);
      data = data.filter((b) => new Date(b.start_at) <= to);
    }

    data.sort((a, b) => new Date(b.start_at) - new Date(a.start_at));
    return data;
  }, [bookings, q, statusFilter, timeFilter, dateFrom, dateTo, now]);

  const bookingSections = useMemo(() => {
    const pending = [];
    const upcoming = [];
    const expiredAndCancelled = [];
    const past = [];
    const cancelledStatuses = new Set(["rejected", "cancelled", "cancelled_gc"]);

    for (const booking of filteredBookings) {
      const normalized = withExpiredBookingStatus(booking, now);
      if (
        normalized.status === EXPIRED_BOOKING_STATUS ||
        cancelledStatuses.has(normalized.status)
      ) {
        expiredAndCancelled.push(normalized);
      } else if (normalized.status === "pending" || normalized.status === "cancellation_requested") {
        pending.push(normalized);
      } else if (new Date(normalized.start_at) < now) {
        past.push(normalized);
      } else {
        upcoming.push(normalized);
      }
    }

    upcoming.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

    return [
      { key: "pending", title: "Pending for Approval", rows: pending },
      { key: "upcoming", title: "Upcoming Bookings", rows: upcoming },
      {
        key: "expired-cancelled",
        title: "Expired & Cancelled Bookings",
        rows: expiredAndCancelled,
      },
      { key: "past", title: "Past Bookings", rows: past },
    ].filter((section) => section.rows.length > 0);
  }, [filteredBookings, now]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelectedIds(new Set(filteredBookings.map((b) => b.id)));
  }
  function clearSelected() {
    setSelectedIds(new Set());
  }

  /* =======================
    Actions
  ======================= */
  async function runStatusUpdate(type, bookingOrIds) {
    setActionLoading(true);

    try {
      // BULK
      if (Array.isArray(bookingOrIds)) {
        const ids = bookingOrIds;

        // ✅ Enforce: skip past + skip confirmed (approve/reject)
        const eligibleIds = ids.filter((id) => {
          const b = bookings.find((x) => x.id === id);
          if (!b) return false;
          return !disableApproveReject(b);
        });

        const skipped = ids.length - eligibleIds.length;

        if (eligibleIds.length === 0) {
          alert("No eligible bookings selected. Past bookings and confirmed bookings cannot be approved/rejected.");
          setActionLoading(false);
          setActionModal(null);
          return;
        }

        const updates = await Promise.all(
          eligibleIds.map(async (id) => {
            const booking = bookings.find((x) => x.id === id);
            if (booking?.status === "cancellation_requested" && type === "approve_bulk") {
              const result = await approveCancellationWithGiftCertificate(id);
              return { id, payload: { status: result.status } };
            }
            if (type === "approve_bulk") {
              const result = await approveBookingAndSendConfirmation(id);
              return {
                id,
                payload: { status: "confirmed", payment_status: "approved" },
                emailError: result.emailSent ? "" : result.emailError,
              };
            }
            const payload = statusUpdatePayload(type, booking);
            const { error } = await supabase
              .from("function_room_bookings")
              .update(payload)
              .eq("id", id);
            if (error) throw error;
            return { id, payload };
          })
        );
        const updateMap = new Map(updates.map((x) => [x.id, x.payload]));
        const emailFailures = updates.filter((x) => x.emailError);

        setBookings((prev) =>
          prev.map((x) => (updateMap.has(x.id) ? { ...x, ...updateMap.get(x.id) } : x))
        );

        clearSelected();

        if (skipped > 0) {
          alert(`Updated ${eligibleIds.length}. Skipped ${skipped} (past/confirmed).`);
        }
        if (emailFailures.length > 0) {
          alert(`${emailFailures.length} booking(s) were approved, but their confirmation email could not be sent.`);
        }
      } else {
        // SINGLE
        const booking = bookingOrIds;

        if (disableApproveReject(booking)) {
          alert("Action not allowed. Past bookings and confirmed bookings cannot be approved/rejected.");
          setActionLoading(false);
          setActionModal(null);
          return;
        }

        const updatePayload = statusUpdatePayload(type, booking);
        if (booking?.status === "cancellation_requested" && type === "approve") {
          const result = await approveCancellationWithGiftCertificate(booking.id);
          setBookings((prev) =>
            prev.map((x) => (x.id === booking.id ? { ...x, status: result.status } : x))
          );
          setActionModal(null);
          return;
        }

        if (type === "approve") {
          const result = await approveBookingAndSendConfirmation(booking.id);
          const confirmedPayload = { status: "confirmed", payment_status: "approved" };
          setBookings((prev) =>
            prev.map((x) => (x.id === booking.id ? { ...x, ...confirmedPayload } : x))
          );
          if (!result.emailSent) {
            alert(`Booking approved, but the confirmation email could not be sent: ${result.emailError}`);
          }
          setActionModal(null);
          return;
        }

        const { error } = await supabase
          .from("function_room_bookings")
          .update(updatePayload)
          .eq("id", booking.id);

        if (error) throw error;

        setBookings((prev) =>
          prev.map((x) => (x.id === booking.id ? { ...x, ...updatePayload } : x))
        );
      }

      setActionModal(null);
    } catch (e) {
      alert(e?.message || "Failed to update status.");
    } finally {
      setActionLoading(false);
    }
  }

  function openEditModal(b) {
    if (disableEdit(b)) return; // ✅ past = locked

    const dateISO = bookingISODate(b.start_at);
    const hour = hourLikeFromStartAt(b.start_at);

    setEditModal({
      booking: b,
      customer_name: b.customer_name || "",
      event_type: b.event_type || "",
      guest_count: b.guest_count || 1,
      contact_number: b.contact_number || "",
      email: b.email || "",
      package_id: Number(b.package_id || ""),
      extension_hours: clampExtensionHours(b.extension_hours),
      dateISO,
      hour: isNaN(hour) ? OPERATING_START_HOUR : hour,
    });
  }

  async function saveAdminUpdate() {
    if (!editModal?.booking) return;

    // extra safety
    if (disableEdit(editModal.booking)) {
      alert("Editing is disabled for past bookings.");
      return;
    }

    setEditLoading(true);
    try {
      const b = editModal.booking;
      const extensionHours = clampExtensionHours(editModal.extension_hours);
      const startAt = computeDateTime(editModal.dateISO, Number(editModal.hour));
      const endAt = computeEndAt(startAt, extensionHours);

      const payload = {
        customer_name: String(editModal.customer_name || "").trim(),
        event_type: String(editModal.event_type || "").trim(),
        guest_count: Number(editModal.guest_count || 1),
        contact_number: String(editModal.contact_number || "").trim(),
        email: String(editModal.email || "").trim(),
        package_id: Number(editModal.package_id),
        extension_hours: extensionHours,
        start_at: toManilaOffsetISOString(startAt),
        end_at: toManilaOffsetISOString(endAt),
        status: "pending",
      };

      const { error } = await supabase.from("function_room_bookings").update(payload).eq("id", b.id);

      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("no_overlap_function_room")) {
          alert("❌ This update overlaps an existing booking. Choose another time.");
        } else {
          alert(error.message);
        }
        return;
      }

      setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...payload } : x)));
      setEditModal(null);
    } catch (e) {
      alert(e?.message || "Something went wrong.");
    } finally {
      setEditLoading(false);
    }
  }

  function openManualModal(prefill = {}) {
    setManualModal({
      customer_name: "",
      event_type: "",
      guest_count: 1,
      contact_number: "",
      email: "",
      package_id: packages[0]?.id || "",
      extension_hours: 0,
      dateISO: prefill.dateISO || bookingISODate(new Date()),
      hour: Number.isFinite(Number(prefill.hour)) ? Number(prefill.hour) : OPERATING_START_HOUR,
      deposit_amount: 0,
      status: "confirmed",
      payment_status: "submitted",
    });
  }

  async function saveManualBooking() {
    if (!manualModal) return;
    const required = [
      ["Customer name", manualModal.customer_name],
      ["Event type", manualModal.event_type],
      ["Contact number", manualModal.contact_number],
      ["Email", manualModal.email],
      ["Package", manualModal.package_id],
      ["Date", manualModal.dateISO],
    ];
    const missing = required.find(([, value]) => String(value || "").trim() === "");
    if (missing) {
      alert(`${missing[0]} is required.`);
      return;
    }

    setManualLoading(true);
    try {
      const extensionHours = clampExtensionHours(manualModal.extension_hours);
      const startAt = computeDateTime(manualModal.dateISO, Number(manualModal.hour));
      const endAt = computeEndAt(startAt, extensionHours);
      const payload = {
        user_id: null,
        member_id: null,
        package_id: Number(manualModal.package_id),
        customer_name: String(manualModal.customer_name || "").trim(),
        event_type: String(manualModal.event_type || "").trim(),
        business_date: manualModal.dateISO,
        start_at: toManilaOffsetISOString(startAt),
        end_at: toManilaOffsetISOString(endAt),
        duration_hours: 3,
        extension_hours: extensionHours,
        guest_count: Number(manualModal.guest_count || 1),
        contact_number: String(manualModal.contact_number || "").trim(),
        email: String(manualModal.email || "").trim(),
        deposit_amount: Number(manualModal.deposit_amount || 0),
        payment_status: manualModal.payment_status || "submitted",
        payment_proof_url: null,
        status: manualModal.status || "confirmed",
      };

      const { data, error } = await supabase.rpc("create_booking", { data: payload });
      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("no_overlap_function_room")) {
          alert("This manual booking overlaps an existing booking. Choose another time.");
        } else {
          alert(error.message);
        }
        return;
      }

      setManualModal(null);
      if (data?.id) {
        setBookings((prev) => [...prev, data].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)));
      } else {
        await loadAll();
      }
    } catch (e) {
      alert(e?.message || "Manual booking failed.");
    } finally {
      setManualLoading(false);
    }
  }

  /* =======================
    Calendar View
  ======================= */
  const weekStart = useMemo(
    () => startOfWeek(new Date(`${weekAnchorISO}T00:00:00`), 1),
    [weekAnchorISO]
  );
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const bookingsInWeek = useMemo(() => {
    const start = new Date(weekStart);
    const end = addDays(start, 7);
    return bookings.filter((b) => {
      const s = new Date(b.start_at);
      return s >= start && s < end;
    });
  }, [bookings, weekStart]);

  const calendarRows = useMemo(() => {
    const hours = new Set(slotHours);
    for (const booking of bookingsInWeek) hours.add(hourLikeFromStartAt(booking.start_at));
    return Array.from(hours).sort((a, b) => a - b);
  }, [bookingsInWeek, slotHours]);

  const calendarWeekStats = useMemo(
    () => ({
      total: bookingsInWeek.length,
      confirmed: bookingsInWeek.filter((booking) => booking.status === "confirmed").length,
      needsReview: bookingsInWeek.filter(
        (booking) =>
          booking.status === "cancellation_requested" ||
          booking.payment_status === "submitted" ||
          booking.payment_status === "cash_pending"
      ).length,
      guests: bookingsInWeek
        .filter((booking) => !["expired", "rejected", "cancelled", "cancelled_gc"].includes(booking.status))
        .reduce((sum, booking) => sum + Number(booking.guest_count || 0), 0),
    }),
    [bookingsInWeek]
  );

  const todayISO = bookingISODate(new Date());

  /* =======================
    Render
  ======================= */
  return (
    <div className="min-h-screen space-y-5 bg-[#f3f0e8] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-[24px] border border-emerald-950/10 bg-[#fffdf8] p-5 shadow-sm md:p-6 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0b6942]">JUJA Admin · Operations</p>
          <h2 className="mt-1 font-serif text-3xl font-medium text-slate-800">Booking operations</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review payments, protect the weekly schedule, and manage customer requests in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openManualModal()}
            className="px-4 py-2 rounded-xl font-bold bg-[#0b6942] text-white text-[11px] uppercase tracking-widest hover:bg-[#095937] active:scale-95"
          >
            Manual Booking
          </button>

          <button
            onClick={loadAll}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
          >
            Refresh
          </button>

          <div className="bg-[#f7f4ec] border border-emerald-950/10 rounded-xl p-1 flex">
            {[
              ["dashboard", "Dashboard"],
              ["calendar", "Calendar"],
              ["list", "List"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`px-3 py-2 rounded-lg text-[11px] uppercase tracking-widest active:scale-95 ${
                  view === k ? "bg-[#153c2c] font-bold text-white" : "text-slate-600 hover:bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full" />
        </div>
      ) : (
        <>
          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Needs attention" value={attentionBookings.length} sub="Payment and cancellation review" tone="blue" />
                <StatCard label="Next 7 days" value={stats.upcoming7} sub="Upcoming room schedule" tone="rose" />
                <StatCard label="Confirmed package value" value={formatPeso(stats.revenueConfirmed)} sub="All confirmed reservations" tone="green" />
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_0.65fr]">
                <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-[#fffdf8] shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-emerald-950/10 px-4 py-3">
                    <div>
                      <h3 className="font-serif text-lg text-slate-800">Review queue</h3>
                      <p className="text-[11px] text-slate-500">Prioritized payment and cancellation work</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600"
                    >
                      Open all
                    </button>
                  </div>

                  {attentionBookings.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">No booking actions need attention.</div>
                  ) : (
                    <div className="divide-y divide-emerald-950/10">
                      {attentionBookings.map((booking) => {
                        const pkg = pkgById.get(Number(booking.package_id));
                        const cancellation = booking.status === "cancellation_requested";
                        const label = cancellation
                          ? "Cancellation request"
                          : booking.payment_status === "submitted"
                            ? "QRPH proof submitted"
                            : "Cash confirmation";
                        return (
                          <div key={booking.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-800">{booking.customer_name}</p>
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-amber-800">{label}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {bookingDateTime(booking.start_at)} · {pkg?.name || `Package ${booking.package_id}`} · {booking.guest_count || 0} guests
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {booking.payment_proof_url ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(booking.payment_proof_url)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600"
                                >
                                  View proof
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setActionModal({ type: "approve", booking })}
                                className="rounded-lg bg-[#0b6942] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white"
                              >
                                {cancellation ? "Approve GC" : booking.payment_status === "cash_pending" ? "Confirm cash" : "Approve & email"}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(booking)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600"
                              >
                                Review details
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-emerald-950/10 bg-[#fffdf8] p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg text-slate-800">Coming up</h3>
                      <p className="text-[11px] text-slate-500">Next confirmed reservations</p>
                    </div>
                    <button type="button" onClick={() => setView("calendar")} className="text-[10px] font-semibold uppercase tracking-widest text-[#0b6942]">Calendar</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {nextConfirmedBookings.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">No upcoming confirmed bookings.</p>
                    ) : nextConfirmedBookings.map((booking) => (
                      <div key={booking.id} className="rounded-xl border border-emerald-950/10 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{booking.customer_name}</p>
                            <p className="mt-1 text-[10px] text-slate-500">{bookingDateTime(booking.start_at)}</p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-800">Confirmed</span>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500">{pkgById.get(Number(booking.package_id))?.name || `Package ${booking.package_id}`} · {booking.guest_count || 0} guests</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <BarChart
                  title="Bookings per day"
                  data={last14DaysCharts.bookingsPerDay}
                  valueFormatter={(v) => `${v} bookings`}
                  colorClass="bg-sky-500"
                />
                <BarChart
                  title="Confirmed revenue per day"
                  data={last14DaysCharts.revenuePerDay}
                  valueFormatter={(v) => formatPeso(v)}
                  colorClass="bg-green-400"
                />
                <DonutChart title="Status distribution" segments={statusSegments} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <SectionTitle title="Revenue summary" />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <StatCard
                      label="Confirmed revenue (est.)"
                      value={formatPeso(stats.revenueConfirmed)}
                      sub="Sum of confirmed package fees"
                      tone="green"
                    />
                    <StatCard
                      label="Deposits submitted"
                      value={formatPeso(stats.depositRevenue)}
                      sub="Sum of deposit_amount where submitted"
                      tone="blue"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <SectionTitle title="Quick actions" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setView("list")}
                      className="px-4 py-2 rounded-xl font-bold bg-white text-white text-[11px] uppercase tracking-widest active:scale-95"
                    >
                      Go to list
                    </button>
                    <button
                      onClick={() => setView("calendar")}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Open calendar
                    </button>
                    <button
                      onClick={() => {
                        const rows = bookings.map((b) => ({
                          id: b.id,
                          reference: b.reference_code,
                          status: b.status,
                          customer_name: b.customer_name,
                          event_type: b.event_type,
                          guest_count: b.guest_count,
                          contact_number: b.contact_number,
                          email: b.email,
                          package_id: b.package_id,
                          extension_hours: b.extension_hours,
                          start_at: b.start_at,
                          end_at: b.end_at,
                          payment_status: b.payment_status,
                          deposit_amount: b.deposit_amount,
                        }));
                        downloadText(`bookings_export_${toISODate(new Date())}.csv`, toCSV(rows));
                      }}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="mt-4 text-xs text-slate-500 leading-relaxed">
                    Rules enforced: past bookings are locked; confirmed upcoming bookings cannot be approve/reject.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CALENDAR */}
          {view === "calendar" && (
            <div className="space-y-4">
              <section className="rounded-[24px] border border-emerald-950/10 bg-[#fffdf8] p-4 shadow-sm md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0b6942]">Manila time</p>
                    <h3 className="mt-1 font-serif text-2xl text-slate-800">
                      {formatDate(toISODate(weekDays[0]))} – {formatDate(toISODate(weekDays[6]))}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">Four standard booking windows with protected one-hour buffers.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWeekAnchorISO(todayISO)}
                      className="rounded-xl border border-[#0b6942]/20 bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#0b6942]"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      aria-label="Previous week"
                      onClick={() => setWeekAnchorISO(toISODate(addDays(weekStart, -7)))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      ←
                    </button>
                    <label className="sr-only" htmlFor="booking-week-anchor">Choose week</label>
                    <input
                      id="booking-week-anchor"
                      type="date"
                      value={weekAnchorISO}
                      onChange={(e) => setWeekAnchorISO(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                    <button
                      type="button"
                      aria-label="Next week"
                      onClick={() => setWeekAnchorISO(toISODate(addDays(weekStart, 7)))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      →
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {[
                    ["Bookings", calendarWeekStats.total],
                    ["Confirmed", calendarWeekStats.confirmed],
                    ["Needs review", calendarWeekStats.needsReview],
                    ["Expected guests", calendarWeekStats.guests],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-emerald-950/10 bg-[#f7f4ec] px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                      <p className="mt-0.5 font-serif text-xl text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500">
                  {[
                    ["bg-emerald-400", "Confirmed"],
                    ["bg-sky-400", "QRPH proof"],
                    ["bg-amber-400", "Cash pending"],
                    ["bg-blue-400", "Awaiting payment"],
                    ["bg-orange-400", "Cancellation request"],
                  ].map(([color, label]) => (
                    <span key={label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
                  ))}
                  <span className="ml-auto">Select an open future slot to create a manual booking.</span>
                </div>
              </section>

              <div className="overflow-x-auto rounded-[24px] border border-emerald-950/10 bg-[#fffdf8] shadow-sm">
                <div className="min-w-[1180px]">
                  <div className="grid border-b border-emerald-950/10 bg-[#f7f4ec]" style={{ gridTemplateColumns: "132px repeat(7, minmax(145px, 1fr))" }}>
                    <div className="flex items-end p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Booking window</p>
                    </div>
                    {weekDays.map((day) => {
                      const dayISO = toISODate(day);
                      const isToday = dayISO === todayISO;
                      const dayCount = bookingsInWeek.filter((booking) => bookingISODate(booking.start_at) === dayISO).length;
                      return (
                        <div key={dayISO} className={`border-l border-emerald-950/10 p-3 ${isToday ? "bg-emerald-50" : ""}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-[#0b6942]" : "text-slate-500"}`}>
                                {day.toLocaleDateString(undefined, { weekday: "short" })}
                              </p>
                              <p className="mt-0.5 font-serif text-lg text-slate-800">{formatDate(dayISO)}</p>
                            </div>
                            <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-[10px] font-semibold ${isToday ? "bg-[#0b6942] text-white" : "bg-white text-slate-500"}`}>
                              {dayCount}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {calendarRows.map((hour) => (
                    <div key={hour} className="grid border-b border-emerald-950/10 last:border-b-0" style={{ gridTemplateColumns: "132px repeat(7, minmax(145px, 1fr))" }}>
                      <div className="bg-[#f7f4ec] p-3">
                        <p className="text-xs font-semibold text-slate-800">{labelBookingSlot(hour)}</p>
                        <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-500">3 hours standard</p>
                      </div>

                      {weekDays.map((day) => {
                        const dayISO = toISODate(day);
                        const isToday = dayISO === todayISO;
                        const cellBookings = bookingsInWeek
                          .filter(
                            (booking) =>
                              bookingISODate(booking.start_at) === dayISO &&
                              hourLikeFromStartAt(booking.start_at) === hour
                          )
                          .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
                        const slotStart = computeDateTime(dayISO, hour);
                        const canCreate = cellBookings.length === 0 && slotStart >= now && BOOKING_SLOT_HOURS.includes(hour);

                        return (
                          <div key={dayISO} className={`min-h-[150px] border-l border-emerald-950/10 p-2 ${isToday ? "bg-emerald-50/40" : "bg-white"}`}>
                            {cellBookings.length > 0 ? (
                              <div className="space-y-2">
                                {cellBookings.slice(0, 2).map((booking) => {
                                  const pkg = pkgById.get(Number(booking.package_id));
                                  const extensionHours = Number(booking.extension_hours || 0);
                                  const locked = disableEdit(booking);
                                  return (
                                    <button
                                      key={booking.id}
                                      type="button"
                                      disabled={locked}
                                      onClick={() => !locked && openEditModal(booking)}
                                      className={`w-full rounded-xl border p-2.5 text-left transition ${calendarBookingTone(booking)} ${locked ? "cursor-not-allowed opacity-60" : "hover:shadow-sm"}`}
                                      title={locked ? "Past booking (locked)" : "Open booking details"}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 truncate text-xs font-semibold text-slate-800">{booking.customer_name || "Unnamed customer"}</p>
                                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${statusPill(booking.status)}`}>
                                          {niceStatus(booking.status)}
                                        </span>
                                      </div>
                                      <p className="mt-1 truncate text-[10px] text-slate-600">{booking.event_type || "Event"} · {booking.guest_count || 0} guests</p>
                                      <p className="mt-1 truncate text-[10px] text-slate-500">{pkg?.name || `Package ${booking.package_id || "—"}`}</p>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        <span className="rounded-md bg-white/80 px-1.5 py-1 text-[8px] font-medium text-slate-600">{bookingTime(booking.start_at)}–{bookingTime(booking.end_at)}</span>
                                        <span className="rounded-md bg-white/80 px-1.5 py-1 text-[8px] font-medium text-slate-600">{calendarPaymentLabel(booking)}</span>
                                        {extensionHours > 0 ? <span className="rounded-md bg-violet-100 px-1.5 py-1 text-[8px] font-semibold text-violet-700">+{extensionHours}h admin</span> : null}
                                      </div>
                                    </button>
                                  );
                                })}
                                {cellBookings.length > 2 ? <p className="px-1 text-[10px] text-slate-500">+{cellBookings.length - 2} more records</p> : null}
                              </div>
                            ) : canCreate ? (
                              <button
                                type="button"
                                onClick={() => openManualModal({ dateISO: dayISO, hour })}
                                className="flex h-full min-h-[130px] w-full items-center justify-center rounded-xl border border-dashed border-emerald-900/15 text-[10px] font-semibold uppercase tracking-widest text-slate-400 transition hover:border-[#0b6942]/40 hover:bg-emerald-50 hover:text-[#0b6942]"
                              >
                                + Manual booking
                              </button>
                            ) : (
                              <div className="flex h-full min-h-[130px] items-center justify-center text-[10px] text-slate-300">No booking</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LIST */}
          {view === "list" && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sticky top-0 z-20">
                <SectionTitle
                  title="Bookings list"
                  right={
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          const rows = filteredBookings.map((b) => ({
                            id: b.id,
                            reference: b.reference_code,
                            status: b.status,
                            customer_name: b.customer_name,
                            event_type: b.event_type,
                            guest_count: b.guest_count,
                            contact_number: b.contact_number,
                            email: b.email,
                            package_id: b.package_id,
                            extension_hours: b.extension_hours,
                            start_at: b.start_at,
                            end_at: b.end_at,
                            payment_status: b.payment_status,
                            deposit_amount: b.deposit_amount,
                          }));
                          downloadText(`bookings_filtered_${toISODate(new Date())}.csv`, toCSV(rows));
                        }}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                      >
                        Export filtered CSV
                      </button>
                    </div>
                  }
                />

                <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-2">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name / ref / contact / email / event"
                    className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="all">All status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="expired">Expired</option>
                    <option value="rejected">Cancelled (old rejected)</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="cancellation_requested">Cancel Request</option>
                    <option value="cancelled_gc">Cancelled (GC)</option>
                  </select>

                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="all">All time</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                  </select>

                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    title="From date"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    title="To date"
                  />
                </div>

                {/* Bulk bar */}
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-slate-500">
                    Showing <b>{filteredBookings.length}</b> results • Selected <b>{selectedCount}</b>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={selectAllFiltered}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearSelected}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Clear
                    </button>

                    <button
                      disabled={selectedCount === 0}
                      onClick={() => setActionModal({ type: "approve_bulk", ids: Array.from(selectedIds) })}
                      className="px-3 py-2 rounded-xl bg-green-500 text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
                    >
                      Approve selected
                    </button>

                    <button
                      disabled={selectedCount === 0}
                      onClick={() => setActionModal({ type: "reject_bulk", ids: Array.from(selectedIds) })}
                      className="px-3 py-2 rounded-xl bg-red-500 text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
                    >
                      Reject selected
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Rule: past bookings locked; confirmed upcoming cannot be approve/reject.
                </div>
              </div>

              {/* Results */}
              {filteredBookings.length === 0 ? (
                <div className="text-slate-500">No bookings found.</div>
              ) : (
                <div className="space-y-6">
                  {bookingSections.map((section) => (
                    <div key={section.key} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                          {section.title}
                        </h3>
                        <span className="text-[11px] text-slate-500">{section.rows.length} booking(s)</span>
                      </div>
                  {section.rows.map((b) => {
                    const pkg = pkgById.get(Number(b.package_id));
                    const pkgName = pkg?.name || `Package #${b.package_id || "—"}`;
                    const fee = pkg?.rental_fee;

                    const expired = isExpiredBooking(b);
                    const past = disableEdit(b);
                    const lockAR = disableApproveReject(b);

                    return (
                      <div
                        key={b.id}
                        className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 transition ${
                          past ? "opacity-75" : "hover:shadow-md"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          {/* LEFT */}
                          <div className="min-w-0 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(b.id)}
                                  onChange={() => toggleSelected(b.id)}
                                />
                                <span className="text-[10px] uppercase tracking-widest text-slate-500">
                                  Select
                                </span>
                              </label>

                              <span className="text-[10px] uppercase tracking-widest text-slate-500">
                                Reference
                              </span>
                              <span className="text-sm font-semibold text-slate-800">
                                {b.reference_code || b.id}
                              </span>

                              <span
                                className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold ${statusPill(
                                  b.status
                                )}`}
                              >
                                {niceStatus(b.status)}
                              </span>

                              {b.payment_status ? (
                                <span className="px-2.5 py-1 rounded-full border text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                                  Payment: {String(b.payment_status).replace(/_/g, " ")}
                                  {b.payment_method ? ` / ${b.payment_method}` : ""}
                                </span>
                              ) : null}
                            </div>

                            {/* DETAILS */}
                            <div className="mt-2 text-[12px] text-slate-600 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                              <p><b>Name:</b> {b.customer_name}</p>
                              <p><b>Event:</b> {b.event_type}</p>
                              <p><b>Guests:</b> {b.guest_count}</p>
                              <p><b>Contact:</b> {b.contact_number}</p>
                              <p><b>Email:</b> {b.email}</p>
                              <p>
                                <b>Package:</b> {pkgName}
                                {fee != null ? ` • ${formatPeso(fee)}` : ""}
                              </p>
                              <p><b>Extension:</b> {Number(b.extension_hours || 0)} hr</p>
                              <p>
                                <b>Schedule:</b> {bookingDateTime(b.start_at)} →{" "}
                                {bookingDateTime(b.end_at)}
                              </p>
                            </div>

                            {/* Hints */}
                            {expired && (
                              <p className="text-[11px] text-slate-500 mt-2">
                                Expired booking - payment proof was not submitted within 24 hours.
                              </p>
                            )}
                            {past && !expired && (
                              <p className="text-[11px] text-slate-500 mt-2">
                                Past booking — Edit/Approve/Reject are disabled.
                              </p>
                            )}
                            {!past && b.status === "confirmed" && (
                              <p className="text-[11px] text-green-600 mt-2">
                                Approved — Approve/Reject disabled.
                              </p>
                            )}
                          </div>

                          {/* RIGHT */}
                          <div className="flex flex-col items-end gap-3">
                            {/* PAYMENT PROOF THUMB */}
                            {b.payment_proof_url ? (
                              <img
                                src={b.payment_proof_url}
                                alt="Payment proof"
                                onClick={() => setPreviewImage(b.payment_proof_url)}
                                className="w-16 h-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-80"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-500">
                                No proof
                              </div>
                            )}

                            {/* ACTIONS */}
                            <div className="flex gap-2 flex-wrap justify-end">
                              <button
                                disabled={past}
                                onClick={() => !past && openEditModal(b)}
                                className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest transition ${
                                  past
                                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                    : "bg-blue-300 font-bold text-white hover:bg-blue-400 active:scale-95"
                                }`}
                              >
                                ✏️ Edit
                              </button>

                              <button
                                disabled={lockAR}
                                onClick={() => !lockAR && setActionModal({ type: "approve", booking: b })}
                                className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest transition ${
                                  lockAR
                                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                    : "bg-green-500 text-white hover:bg-green-600 active:scale-95"
                                }`}
                              >
                                {b.status === "cancellation_requested" ? "Approve Cancel" : "Approve"}
                              </button>

                              <button
                                disabled={lockAR}
                                onClick={() => !lockAR && setActionModal({ type: "reject", booking: b })}
                                className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest transition ${
                                  lockAR
                                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                    : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                                }`}
                              >
                                {b.status === "cancellation_requested" ? "Reject Cancel" : "Reject"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= IMAGE POPUP ================= */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button
                className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
                onClick={() => setPreviewImage(null)}
              >
                ✕
              </button>
            </div>
            <img
              src={previewImage}
              alt="Payment proof preview"
              className="w-full max-h-[80vh] object-contain rounded-2xl border border-white/10 bg-black"
            />
          </div>
        </div>
      )}

      {/* ================= APPROVE/REJECT MODAL ================= */}
      {actionModal && (
        <div className="fixed inset-0 z-[101] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Confirm Action</p>
                <h3 className="text-lg font-semibold text-slate-800">
                  {actionModal.type === "approve" &&
                    (actionModal.booking?.status === "cancellation_requested"
                      ? "Approve Cancellation"
                      : "Approve Booking")}
                  {actionModal.type === "reject" &&
                    (actionModal.booking?.status === "cancellation_requested"
                      ? "Reject Cancellation"
                      : "Reject Booking")}
                  {actionModal.type === "approve_bulk" && "Approve Selected"}
                  {actionModal.type === "reject_bulk" && "Reject Selected"}
                </h3>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !actionLoading && setActionModal(null)}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to{" "}
              <b>{actionModal.type.includes("approve") ? "approve" : "reject"}</b>{" "}
              {actionModal.booking ? "this booking" : "the selected bookings"}?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                disabled={actionLoading}
                onClick={() => {
                  if (actionModal.type === "approve") return runStatusUpdate("approve", actionModal.booking);
                  if (actionModal.type === "reject") return runStatusUpdate("reject", actionModal.booking);
                  if (actionModal.type === "approve_bulk") return runStatusUpdate("approve", actionModal.ids || []);
                  if (actionModal.type === "reject_bulk") return runStatusUpdate("reject", actionModal.ids || []);
                }}
                className={`flex-1 py-3 rounded-xl text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60 ${
                  actionModal.type.includes("approve") ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {actionLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MANUAL BOOKING MODAL ================= */}
      {manualModal && (
        <div className="fixed inset-0 z-[102] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Admin Manual Encoding</p>
                <h3 className="text-lg font-semibold text-slate-800">Create Booking Details</h3>
                <p className="text-xs text-slate-500 mt-1">End time auto-calculates: 3 hours + extension.</p>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !manualLoading && setManualModal(null)}
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Customer Name</label>
                <input
                  value={manualModal.customer_name}
                  onChange={(e) => setManualModal((p) => ({ ...p, customer_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Event Type</label>
                <input
                  value={manualModal.event_type}
                  onChange={(e) => setManualModal((p) => ({ ...p, event_type: e.target.value }))}
                  placeholder="Birthday, meeting, private event"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  value={manualModal.guest_count}
                  onChange={(e) => setManualModal((p) => ({ ...p, guest_count: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Contact Number</label>
                <input
                  value={manualModal.contact_number}
                  onChange={(e) => setManualModal((p) => ({ ...p, contact_number: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={manualModal.email}
                  onChange={(e) => setManualModal((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Deposit Amount</label>
                <input
                  type="number"
                  min={0}
                  value={manualModal.deposit_amount}
                  onChange={(e) => setManualModal((p) => ({ ...p, deposit_amount: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Package</label>
                <select
                  value={manualModal.package_id}
                  onChange={(e) => setManualModal((p) => ({ ...p, package_id: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value="">Select package…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatPeso(p.rental_fee)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={manualModal.dateISO}
                  onChange={(e) => setManualModal((p) => ({ ...p, dateISO: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Start Time</label>
                <select
                  value={manualModal.hour}
                  onChange={(e) => setManualModal((p) => ({ ...p, hour: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {slotHours.map((h) => (
                    <option key={h} value={h}>{labelBookingSlot(h)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Extension Hours</label>
                <select
                  value={manualModal.extension_hours}
                  onChange={(e) => setManualModal((p) => ({ ...p, extension_hours: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {Array.from({ length: MAX_EXTENSION_HOURS + 1 }, (_, hours) => (
                    <option key={hours} value={hours}>{hours}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Status</label>
                <select
                  value={manualModal.status}
                  onChange={(e) => setManualModal((p) => ({ ...p, status: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700">
              {(() => {
                const startAt = computeDateTime(manualModal.dateISO, Number(manualModal.hour));
                const endAt = computeEndAt(startAt, Number(manualModal.extension_hours || 0));
                return <p><b>Computed:</b> {bookingDateTime(startAt)} → {bookingDateTime(endAt)}</p>;
              })()}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setManualModal(null)}
                disabled={manualLoading}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={saveManualBooking}
                disabled={manualLoading}
                className="flex-1 py-3 rounded-xl bg-slate-700 text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                {manualLoading ? "Saving..." : "Create Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADMIN EDIT MODAL ================= */}
      {editModal && (
        <div className="fixed inset-0 z-[102] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Admin Manual Update</p>
                <h3 className="text-lg font-semibold text-slate-800">Update Booking Details</h3>
                <p className="text-xs text-slate-500 mt-1">End time auto-calculates: 3 hours + extension.</p>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !editLoading && setEditModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Customer Name
                </label>
                <input
                  value={editModal.customer_name}
                  onChange={(e) => setEditModal((p) => ({ ...p, customer_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Event Type
                </label>
                <input
                  value={editModal.event_type}
                  onChange={(e) => setEditModal((p) => ({ ...p, event_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Guests
                </label>
                <input
                  type="number"
                  min={1}
                  value={editModal.guest_count}
                  onChange={(e) => setEditModal((p) => ({ ...p, guest_count: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Extension Hours
                </label>
                <select
                  value={editModal.extension_hours}
                  onChange={(e) => setEditModal((p) => ({ ...p, extension_hours: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {Array.from({ length: MAX_EXTENSION_HOURS + 1 }, (_, hours) => (
                    <option key={hours} value={hours}>{hours}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Contact Number
                </label>
                <input
                  value={editModal.contact_number}
                  onChange={(e) => setEditModal((p) => ({ ...p, contact_number: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Email
                </label>
                <input
                  value={editModal.email}
                  onChange={(e) => setEditModal((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Package
                </label>
                <select
                  value={editModal.package_id}
                  onChange={(e) => setEditModal((p) => ({ ...p, package_id: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value="">Select package…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatPeso(p.rental_fee)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editModal.dateISO}
                  onChange={(e) => setEditModal((p) => ({ ...p, dateISO: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                  Start Time
                </label>
                <select
                  value={editModal.hour}
                  onChange={(e) => setEditModal((p) => ({ ...p, hour: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {editSlotHours(editModal.hour).map((h) => (
                    <option key={h} value={h}>
                      {BOOKING_SLOT_HOURS.includes(h)
                        ? labelBookingSlot(h)
                        : `${labelHour(h)} (existing booking time)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview end time */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700">
              {(() => {
                const startAt = computeDateTime(editModal.dateISO, Number(editModal.hour));
                const endAt = computeEndAt(startAt, Number(editModal.extension_hours || 0));
                return (
                  <p>
                    <b>Computed:</b> {bookingDateTime(startAt)} → {bookingDateTime(endAt)}
                  </p>
                );
              })()}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditModal(null)}
                disabled={editLoading}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={saveAdminUpdate}
                disabled={editLoading}
                className="flex-1 py-3 rounded-xl font-bold bg-blue-200 text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                {editLoading ? "Saving..." : "Save Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
