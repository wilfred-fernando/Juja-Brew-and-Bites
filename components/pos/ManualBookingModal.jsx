"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const START_HOURS = Array.from({ length: 13 }, (_, index) => 10 + index);
const MAX_EXTENSION_HOURS = 5;
const BASE_BOOKING_MINUTES = 180;

function manilaDateISO(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function labelHour(hour) {
  const normalized = Number(hour) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  return `${((normalized + 11) % 12) + 1}:00 ${suffix}`;
}

function computeDateTime(dateISO, hour) {
  const [year, month, day] = String(dateISO).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(hour) - 8, 0, 0, 0));
}

function toManilaOffsetISOString(value) {
  const date = value instanceof Date ? value : new Date(value);
  const manila = new Date(date.getTime() + 8 * 3600000);
  const pad = (number) => String(number).padStart(2, "0");
  return `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}:00+08:00`;
}

function formatPreview(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "Select a valid date and time";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function initialForm() {
  return {
    customer_name: "",
    event_type: "",
    guest_count: 1,
    contact_number: "",
    email: "",
    package_id: "",
    extension_hours: 0,
    dateISO: manilaDateISO(),
    hour: 10,
    deposit_amount: 0,
    status: "confirmed",
  };
}

export default function ManualBookingModal({ open, cashierName, onClose, onCreated, onError }) {
  const [form, setForm] = useState(initialForm);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm());
    let active = true;
    setPackageLoading(true);
    supabase
      .from("function_room_packages")
      .select("id, name, rental_fee, capacity")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          onError?.(error.message);
          return;
        }
        const rows = data || [];
        setPackages(rows);
        setForm((current) => ({ ...current, package_id: rows[0]?.id || "" }));
      })
      .finally(() => active && setPackageLoading(false));
    return () => {
      active = false;
    };
  }, [open]);

  const schedule = useMemo(() => {
    const start = computeDateTime(form.dateISO, form.hour);
    const end = new Date(start.getTime() + (BASE_BOOKING_MINUTES + Number(form.extension_hours || 0) * 60) * 60000);
    return { start, end };
  }, [form.dateISO, form.hour, form.extension_hours]);

  if (!open) return null;

  async function saveBooking() {
    const required = [
      ["Customer name", form.customer_name],
      ["Event type", form.event_type],
      ["Contact number", form.contact_number],
      ["Email", form.email],
      ["Package", form.package_id],
      ["Date", form.dateISO],
    ];
    const missing = required.find(([, value]) => !String(value || "").trim());
    if (missing) return onError?.(`${missing[0]} is required.`);
    if (schedule.start < new Date()) return onError?.("Manual bookings must start in the future.");

    setLoading(true);
    try {
      const payload = {
        user_id: null,
        member_id: null,
        package_id: Number(form.package_id),
        customer_name: String(form.customer_name).trim(),
        event_type: String(form.event_type).trim(),
        business_date: form.dateISO,
        start_at: toManilaOffsetISOString(schedule.start),
        end_at: toManilaOffsetISOString(schedule.end),
        duration_hours: 3,
        extension_hours: Number(form.extension_hours || 0),
        guest_count: Math.max(1, Number(form.guest_count || 1)),
        contact_number: String(form.contact_number).trim(),
        email: String(form.email).trim(),
        deposit_amount: Math.max(0, Number(form.deposit_amount || 0)),
        payment_status: "submitted",
        payment_method: null,
        payment_proof_url: null,
        status: form.status,
        created_via: "pos",
      };
      const { data, error } = await supabase.rpc("create_manual_booking", { data: payload });
      if (error) throw error;
      onCreated?.(data);
      onClose?.();
    } catch (error) {
      const message = String(error?.message || "Manual booking failed.");
      onError?.(
        message.includes("overlaps") || message.includes("no_overlap_function_room")
          ? "This manual booking overlaps an existing booking or its one-hour buffer."
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" onClick={() => !loading && onClose?.()}>
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#FC687D]">POS Manual Booking</p>
            <h2 className="text-lg font-black text-slate-800">Create Function Room Booking</h2>
            <p className="mt-1 text-xs text-slate-500">Created by {cashierName || "current POS account"}. Start times are selectable per hour.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => onClose?.()} className="h-9 w-9 rounded-full bg-slate-50 text-sm font-bold text-slate-500 disabled:opacity-50">X</button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer Name"><input value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} className="field" /></Field>
          <Field label="Event Type"><input value={form.event_type} onChange={(e) => setForm((p) => ({ ...p, event_type: e.target.value }))} placeholder="Birthday, meeting, private event" className="field" /></Field>
          <Field label="Guests"><input type="number" min={1} value={form.guest_count} onChange={(e) => setForm((p) => ({ ...p, guest_count: Number(e.target.value) }))} className="field" /></Field>
          <Field label="Contact Number"><input value={form.contact_number} onChange={(e) => setForm((p) => ({ ...p, contact_number: e.target.value }))} className="field" /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="field" /></Field>
          <Field label="Deposit Amount"><input type="number" min={0} value={form.deposit_amount} onChange={(e) => setForm((p) => ({ ...p, deposit_amount: Number(e.target.value) }))} className="field" /></Field>
          <Field label="Package" wide>
            <select disabled={packageLoading} value={form.package_id} onChange={(e) => setForm((p) => ({ ...p, package_id: Number(e.target.value) }))} className="field">
              <option value="">{packageLoading ? "Loading packages..." : "Select package"}</option>
              {packages.map((item) => <option key={item.id} value={item.id}>{item.name} — ₱{Number(item.rental_fee || 0).toLocaleString("en-PH")}</option>)}
            </select>
          </Field>
          <Field label="Start Date"><input type="date" min={manilaDateISO()} value={form.dateISO} onChange={(e) => setForm((p) => ({ ...p, dateISO: e.target.value }))} className="field" /></Field>
          <Field label="Start Time (Hourly)"><select value={form.hour} onChange={(e) => setForm((p) => ({ ...p, hour: Number(e.target.value) }))} className="field">{START_HOURS.map((hour) => <option key={hour} value={hour}>{labelHour(hour)}</option>)}</select></Field>
          <Field label="Extension Hours"><select value={form.extension_hours} onChange={(e) => setForm((p) => ({ ...p, extension_hours: Number(e.target.value) }))} className="field">{Array.from({ length: MAX_EXTENSION_HOURS + 1 }, (_, hours) => <option key={hours} value={hours}>{hours}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="field"><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select></Field>
        </div>

        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-slate-600">
          <b>Schedule:</b> {formatPreview(schedule.start)} – {formatPreview(schedule.end)}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={loading} onClick={() => onClose?.()} className="h-11 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-500 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={loading || packageLoading} onClick={saveBooking} className="h-11 flex-1 rounded-xl bg-[#FC687D] text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{loading ? "Saving..." : "Create Booking"}</button>
        </div>
      </div>
      <style jsx>{`
        :global(.field) { width: 100%; border: 1px solid rgb(226 232 240); border-radius: 0.75rem; background: rgb(248 250 252); padding: 0.7rem 0.75rem; font-size: 0.875rem; color: rgb(30 41 59); }
      `}</style>
    </div>
  );
}

function Field({ label, wide = false, children }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}
