"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

/* =======================
 Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BASE_BOOKING_MINUTES = 2 * 60 + 59; // 2h59m
const MAX_EXTENSION_HOURS = 2;

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
  const hours = [];
  for (let h = OPERATING_START_HOUR; h <= 23; h++) hours.push(h);
  hours.push(24, 25); // 12AM+1, 1AM+1
  return hours;
}
function labelHour(h) {
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}
function computeDateTime(dateISO, hourLike) {
  const base = new Date(`${dateISO}T00:00:00`);
  const dt = new Date(base);
  if (hourLike >= 24) dt.setDate(dt.getDate() + 1);
  dt.setHours(hourLike % 24, 0, 0, 0);
  return dt;
}
function computeEndAt(startAt, extensionHours) {
  const totalMinutes = BASE_BOOKING_MINUTES + Number(extensionHours || 0) * 60;
  return new Date(startAt.getTime() + totalMinutes * 60 * 1000);
}
function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString()}`;
}
function statusPill(status) {
  const map = {
    confirmed: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-blue-100 text-blue-700 border-blue-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    cancelled_gc: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
  return map[status] || "bg-slate-100 text-slate-700 border-slate-200";
}
function niceStatus(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled_gc") return "Gift Cert";
  return String(status || "—");
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
  const d = new Date(startAt);
  const h = d.getHours();
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
    rose: "border-rose-200",
  };
  return (
    <div className={`bg-white rounded-2xl border ${toneMap[tone]} shadow-sm p-4`}>
      <p className="text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
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

function BarChart({ title, data, valueFormatter = (v) => v, colorClass = "bg-rose-400" }) {
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
              <span className="text-[9px] text-slate-400">{d.label}</span>
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
              <span className="text-slate-400">•</span>
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

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all"); // all | upcoming | past
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Calendar
  const [weekAnchorISO, setWeekAnchorISO] = useState(() => toISODate(new Date()));
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

  const disableEdit = (b) => isPastBooking(b);
  const disableApproveReject = (b) => isPastBooking(b) || isConfirmedBooking(b);

  /* =======================
    Load Data + Realtime
  ======================= */
  async function loadAll() {
    setLoading(true);
    const [{ data: pkgData, error: pkgErr }, { data: bookingData, error: bookErr }] =
      await Promise.all([
        supabase.from("function_room_packages").select("*").order("id", { ascending: true }),
        supabase.from("function_room_bookings").select("*").order("start_at", { ascending: true }),
      ]);

    if (pkgErr) console.error(pkgErr);
    if (bookErr) console.error(bookErr);

    setPackages(pkgData || []);
    setBookings(bookingData || []);
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

              if (idx >= 0) next[idx] = { ...next[idx], ...(payload.new || {}) };
              else next.push(payload.new);

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
    const pending = bookings.filter((b) => b.status === "pending").length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const rejected = bookings.filter((b) => b.status === "rejected").length;
    const cancelled = bookings.filter((b) => b.status === "cancelled_gc").length;

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

    return { total, pending, confirmed, rejected, cancelled, revenueConfirmed, depositRevenue, upcoming7 };
  }, [bookings, pkgById, now]);

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
      const start = new Date(b.start_at);
      const iso = toISODate(start);
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
      { label: "Rejected", value: stats.rejected, color: "#FCA5A5" },
      { label: "Cancelled", value: stats.cancelled, color: "#FDE68A" },
    ];
  }, [stats]);

  /* =======================
    List Filters + Results
  ======================= */
  const filteredBookings = useMemo(() => {
    let data = [...bookings];

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
    const newStatus = type === "approve" ? "confirmed" : "rejected";

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

        const { error } = await supabase
          .from("function_room_bookings")
          .update({ status: newStatus })
          .in("id", eligibleIds);

        if (error) throw error;

        setBookings((prev) =>
          prev.map((x) => (eligibleIds.includes(x.id) ? { ...x, status: newStatus } : x))
        );

        clearSelected();

        if (skipped > 0) {
          alert(`Updated ${eligibleIds.length}. Skipped ${skipped} (past/confirmed).`);
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

        const { error } = await supabase
          .from("function_room_bookings")
          .update({ status: newStatus })
          .eq("id", booking.id);

        if (error) throw error;

        setBookings((prev) =>
          prev.map((x) => (x.id === booking.id ? { ...x, status: newStatus } : x))
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

    const start = new Date(b.start_at);
    const dateISO = toISODate(start);
    const hour = hourLikeFromStartAt(start);

    setEditModal({
      booking: b,
      customer_name: b.customer_name || "",
      event_type: b.event_type || "",
      guest_count: b.guest_count || 1,
      contact_number: b.contact_number || "",
      email: b.email || "",
      package_id: Number(b.package_id || ""),
      extension_hours: Number(b.extension_hours || 0),
      dateISO,
      hour: isNaN(hour) ? start.getHours() : hour,
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
      const startAt = computeDateTime(editModal.dateISO, Number(editModal.hour));
      const endAt = computeEndAt(startAt, Number(editModal.extension_hours || 0));

      const payload = {
        customer_name: String(editModal.customer_name || "").trim(),
        event_type: String(editModal.event_type || "").trim(),
        guest_count: Number(editModal.guest_count || 1),
        contact_number: String(editModal.contact_number || "").trim(),
        email: String(editModal.email || "").trim(),
        package_id: Number(editModal.package_id),
        extension_hours: Number(editModal.extension_hours || 0),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
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

  /* =======================
    Render
  ======================= */
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Admin</p>
          <h2 className="text-2xl font-semibold text-slate-800">Booking Dashboard</h2>
          <p className="text-xs text-slate-500 mt-1">
            Base booking: 2h 59m • Extension max {MAX_EXTENSION_HOURS}h • Calendar + Analytics + Bulk actions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
          >
            Refresh
          </button>

          <div className="bg-white border border-slate-200 rounded-xl p-1 flex">
            {[
              ["dashboard", "Dashboard"],
              ["calendar", "Calendar"],
              ["list", "List"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`px-3 py-2 rounded-lg text-[11px] uppercase tracking-widest active:scale-95 ${
                  view === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
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
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
        </div>
      ) : (
        <>
          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Bookings" value={stats.total} sub="All records" />
                <StatCard label="Pending" value={stats.pending} sub="Needs action" tone="blue" />
                <StatCard label="Confirmed" value={stats.confirmed} sub="Approved" tone="green" />
                <StatCard label="Next 7 days" value={stats.upcoming7} sub="Upcoming load" tone="rose" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <BarChart
                  title="Bookings per day"
                  data={last14DaysCharts.bookingsPerDay}
                  valueFormatter={(v) => `${v} bookings`}
                  colorClass="bg-rose-400"
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
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[11px] uppercase tracking-widest active:scale-95"
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <SectionTitle
                  title="Weekly calendar"
                  right={
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setWeekAnchorISO(toISODate(addDays(new Date(`${weekAnchorISO}T00:00:00`), -7)))
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                      >
                        Prev
                      </button>
                      <input
                        type="date"
                        value={weekAnchorISO}
                        onChange={(e) => setWeekAnchorISO(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
                      />
                      <button
                        onClick={() =>
                          setWeekAnchorISO(toISODate(addDays(new Date(`${weekAnchorISO}T00:00:00`), 7)))
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                      >
                        Next
                      </button>
                    </div>
                  }
                />
                <p className="text-xs text-slate-500 mt-2">
                  Click a booking to edit — <b>past bookings are locked</b>.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="grid" style={{ gridTemplateColumns: "110px repeat(7, minmax(0, 1fr))" }}>
                  <div className="p-3 border-b border-slate-200 bg-slate-50">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Time</p>
                  </div>
                  {weekDays.map((d) => (
                    <div key={toISODate(d)} className="p-3 border-b border-slate-200 bg-slate-50">
                      <p className="text-[11px] font-semibold text-slate-800">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </p>
                      <p className="text-[10px] text-slate-500">{formatDate(toISODate(d))}</p>
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div className="grid" style={{ gridTemplateColumns: "110px repeat(7, minmax(0, 1fr))" }}>
                  {/* Time column */}
                  <div className="border-r border-slate-200">
                    {slotHours.map((h) => (
                      <div key={h} className="h-16 px-3 flex items-center border-b border-slate-200 bg-white">
                        <p className="text-xs text-slate-600 font-medium">{labelHour(h)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {weekDays.map((day) => {
                    const dayISO = toISODate(day);
                    const dayBookings = bookingsInWeek.filter(
                      (b) => toISODate(new Date(b.start_at)) === dayISO
                    );

                    const byHour = new Map();
                    for (const b of dayBookings) {
                      const startH = hourLikeFromStartAt(b.start_at);
                      const list = byHour.get(startH) || [];
                      list.push(b);
                      byHour.set(startH, list);
                    }

                    return (
                      <div key={dayISO} className="relative">
                        {slotHours.map((h) => {
                          const cellBookings = (byHour.get(h) || []).sort(
                            (a, b) => new Date(a.start_at) - new Date(b.start_at)
                          );

                          return (
                            <div key={h} className="h-16 border-b border-slate-200 px-2 py-2">
                              {cellBookings.slice(0, 2).map((b) => {
                                const pkg = pkgById.get(Number(b.package_id));
                                const ext = Number(b.extension_hours || 0);
                                const durMin = BASE_BOOKING_MINUTES + ext * 60;
                                const spanRows = clamp(Math.ceil(durMin / 60), 1, 5);

                                const locked = disableEdit(b); // ✅ past => locked

                                return (
                                  <button
                                    key={b.id}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => !locked && openEditModal(b)}
                                    className={`w-full text-left rounded-xl border px-2 py-2 mb-1 transition ${
                                      locked
                                        ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                                        : b.status === "pending"
                                        ? "bg-blue-50 border-blue-200 hover:shadow-sm"
                                        : b.status === "confirmed"
                                        ? "bg-green-50 border-green-200 hover:shadow-sm"
                                        : b.status === "rejected"
                                        ? "bg-red-50 border-red-200 hover:shadow-sm"
                                        : "bg-slate-50 border-slate-200 hover:shadow-sm"
                                    }`}
                                    title={locked ? "Past booking (locked)" : "Click to edit"}
                                    style={{ minHeight: `${Math.min(spanRows, 2) * 28}px` }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] font-semibold text-slate-800 truncate">
                                        {b.customer_name || "—"}
                                      </p>
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full border ${statusPill(b.status)}`}
                                      >
                                        {niceStatus(b.status)}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-1 truncate">
                                      {pkg?.name || `Package #${b.package_id || "—"}`} • {b.guest_count || 0} pax
                                    </p>
                                  </button>
                                );
                              })}

                              {cellBookings.length > 2 ? (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  +{cellBookings.length - 2} more
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
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
                    <option value="rejected">Rejected</option>
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
                <div className="space-y-3">
                  {filteredBookings.map((b) => {
                    const pkg = pkgById.get(Number(b.package_id));
                    const pkgName = pkg?.name || `Package #${b.package_id || "—"}`;
                    const fee = pkg?.rental_fee;

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
                                <span className="text-[10px] uppercase tracking-widest text-slate-400">
                                  Select
                                </span>
                              </label>

                              <span className="text-[10px] uppercase tracking-widest text-slate-400">
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

                              {b.payment_status === "submitted" ? (
                                <span className="px-2.5 py-1 rounded-full border text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                                  Payment: submitted
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
                                <b>Schedule:</b> {formatDateTime(b.start_at)} →{" "}
                                {formatDateTime(b.end_at)}
                              </p>
                            </div>

                            {/* Hints */}
                            {past && (
                              <p className="text-[11px] text-slate-400 mt-2">
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
                              <div className="w-16 h-16 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
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
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
                                }`}
                              >
                                ✏️ Edit
                              </button>

                              <button
                                disabled={lockAR}
                                onClick={() => !lockAR && setActionModal({ type: "approve", booking: b })}
                                className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest transition ${
                                  lockAR
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-green-500 text-white hover:bg-green-600 active:scale-95"
                                }`}
                              >
                                ✅ Approve
                              </button>

                              <button
                                disabled={lockAR}
                                onClick={() => !lockAR && setActionModal({ type: "reject", booking: b })}
                                className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest transition ${
                                  lockAR
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                                }`}
                              >
                                ❌ Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Confirm Action</p>
                <h3 className="text-lg font-semibold text-slate-800">
                  {actionModal.type === "approve" && "Approve Booking"}
                  {actionModal.type === "reject" && "Reject Booking"}
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

      {/* ================= ADMIN EDIT MODAL ================= */}
      {editModal && (
        <div className="fixed inset-0 z-[102] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Admin Manual Update</p>
                <h3 className="text-lg font-semibold text-slate-800">Update Booking Details</h3>
                <p className="text-xs text-slate-500 mt-1">End time auto-calculates: 2h59 + extension.</p>
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
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Customer Name
                </label>
                <input
                  value={editModal.customer_name}
                  onChange={(e) => setEditModal((p) => ({ ...p, customer_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Event Type
                </label>
                <input
                  value={editModal.event_type}
                  onChange={(e) => setEditModal((p) => ({ ...p, event_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
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
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Extension Hours
                </label>
                <select
                  value={editModal.extension_hours}
                  onChange={(e) => setEditModal((p) => ({ ...p, extension_hours: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Contact Number
                </label>
                <input
                  value={editModal.contact_number}
                  onChange={(e) => setEditModal((p) => ({ ...p, contact_number: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Email
                </label>
                <input
                  value={editModal.email}
                  onChange={(e) => setEditModal((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
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
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
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
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Start Time
                </label>
                <select
                  value={editModal.hour}
                  onChange={(e) => setEditModal((p) => ({ ...p, hour: Number(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                >
                  {slotHours.map((h) => (
                    <option key={h} value={h}>
                      {labelHour(h)}
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
                    <b>Computed:</b> {formatDateTime(startAt)} → {formatDateTime(endAt)}
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
                className="flex-1 py-3 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
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
