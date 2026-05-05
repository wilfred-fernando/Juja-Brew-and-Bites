"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function BookingTab({ user, member }) {
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    customer_name: member?.customer_name || user?.user_metadata?.full_name || "",
    customer_email: user?.email || "",
    customer_phone: member?.phone || "",
    event_type: "", event_date: "", start_time: "", end_time: "",
    guest_count: "", notes: "",
  });

  useEffect(() => {
    if (user?.id) {
      supabase.from("room_bookings").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
        .then(({ data }) => setBookings(data || []))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        guest_count: parseInt(form.guest_count) || 0,
        status: "Pending",
        user_id: user?.id,
      };
      const { data, error } = await supabase.from("room_bookings").insert([payload]).select();
      if (!error && data) {
        setBookings(prev => [data[0], ...prev]);
        setShowForm(false);
        setSuccess(true);
        setForm(f => ({ ...f, event_type: "", event_date: "", start_time: "", end_time: "", guest_count: "", notes: "" }));
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const statusStyle = {
    Pending:   "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Cancelled: "bg-red-100 text-red-600 border-red-200",
    Completed: "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Book Room</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Function room reservations</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="text-[11px] font-bold uppercase tracking-widest px-5 py-3 rounded-full text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_4px_15px_rgba(252,104,125,0.3)] hover:-translate-y-0.5">
          + Book Now
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-5 flex items-center gap-4 shadow-sm">
          <span className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm">✅</span>
          <div>
            <p className="font-extrabold text-emerald-800 text-[15px]">Submitted!</p>
            <p className="text-emerald-600 text-[12px]">We'll contact you for the deposit.</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="h-24 bg-white rounded-[24px] animate-pulse" />
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-[32px] p-10 border border-dashed border-rose-200 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
            No bookings yet
          </div>
        ) : (
          bookings.map(b => (
            <div key={b.id} className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-extrabold text-slate-800 text-[14px]">{b.event_type}</p>
                  <p className="text-slate-500 text-[11px] font-medium">{b.event_date} · {b.start_time}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[9px] font-normal uppercase tracking-widest border ${statusStyle[b.status] || statusStyle.Pending}`}>
                  {b.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <form onSubmit={submit} className="space-y-4">
              <h3 className="text-xl font-normal text-slate-800 mb-4">Reserve Room</h3>
              <input type="text" placeholder="Event (e.g. Birthday)" required value={form.event_type} onChange={e => setForm({...form, event_type: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <input type="date" required value={form.event_date} onChange={e => setForm({...form, event_date: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <input type="time" required value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
                <input type="time" required value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
              </div>
              <input type="number" placeholder="Guest Count" required value={form.guest_count} onChange={e => setForm({...form, guest_count: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <button type="submit" disabled={submitting} className="w-full py-4 bg-[#FC687D] text-white rounded-full font-normal uppercase tracking-widest text-xs shadow-lg">
                {submitting ? "Sending..." : "Request Booking →"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}