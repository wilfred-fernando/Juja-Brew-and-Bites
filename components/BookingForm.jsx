"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function BookingForm() {
  const [loading, setLoading] = useState(false);

  // Calculate the minimum date (3 days from now)
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  const minDateString = minDate.toISOString().split("T")[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const details = Object.fromEntries(formData);

    const { error } = await supabase
      .from("function_room_bookings")
      .insert([{
        customer_name: details.name,
        event_type: details.event,
        package_selected: details.package,
        guest_count: parseInt(details.guests),
        booking_date: details.date,
        start_time: details.time,
        contact_number: details.contact,
        email: details.email,
        status: "pending" // Customers start as pending until deposit is verified
      }]);

    setLoading(false);
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Booking request sent! Please wait for our team to contact you for the 50% deposit.");
      e.target.reset();
    }
  };

  return (
    <section className="py-12 px-6 bg-[#FFF5F7]">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-[32px] shadow-sm border border-rose-50">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Reserve the Function Room</h2>
          <p className="text-slate-500 text-sm mt-2">Bookings must be made at least 3 days in advance.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Full Name</label>
              <input name="name" placeholder="Name" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Event Type</label>
              <input name="event" placeholder="e.g. Birthday, Meeting" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Select Package</label>
              <select name="package" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all appearance-none">
                <option value="">Choose a Package</option>
                <option value="Package 1">Package 1 (Up to 15 pax)</option>
                <option value="Package 2">Package 2 (Up to 30 pax)</option>
                <option value="Package 3">Package 3 (Up to 60 pax)</option>
                <option value="Package 4">Package 4 (No Food - 15 pax)</option>
                <option value="Package 5">Package 5 (No Food - 30 pax)</option>
                <option value="Package 6">Package 6 (No Food - 60 pax)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Expected Guests</label>
              <input name="guests" type="number" placeholder="Guest Count" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Date</label>
              <input name="date" type="date" min={minDateString} required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Start Time</label>
              <input name="time" type="time" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Contact Number</label>
              <input name="contact" placeholder="09XX XXX XXXX" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 ml-1">Email Address</label>
              <input name="email" type="email" placeholder="email@example.com" required className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-rose-200 transition-all" />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 bg-[#FC687D] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 transition-all shadow-lg shadow-rose-100 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Request Reservation"}
          </button>
        </form>
      </div>
    </section>
  );
}

// ─── BOOKING TAB ──────────────────────────────────────────────────────────────
function BookingTab({ user, member }) {
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
      } else {
         alert("Failed to submit booking. Check your table policies.");
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
        <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-5 flex items-center gap-4 animate-in slide-in-from-top-2 shadow-sm">
          <span className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm">✅</span>
          <div>
            <p className="font-extrabold text-emerald-800 text-[15px]">Booking Submitted!</p>
            <p className="text-emerald-600 text-[13px] font-medium mt-0.5">We'll confirm your reservation within 24 hours.</p>
          </div>
        </div>
      )}

      <div className="rounded-[32px] p-6 border border-rose-50 bg-white shadow-sm flex gap-5 items-center">
        <div className="w-16 h-16 rounded-full bg-[#FFF9FA] border border-rose-100 flex items-center justify-center text-3xl flex-shrink-0">🎪</div>
        <div>
          <p className="font-extrabold text-slate-800 text-[15px]">The Function Room</p>
          <p className="text-slate-500 text-[11px] mt-1 font-medium leading-relaxed">Perfect for birthdays, team outings & corporate events.</p>
          <p className="text-[#FC687D] text-[10px] font-bold uppercase tracking-widest mt-2 bg-rose-50 inline-block px-3 py-1 rounded-full border border-rose-100">🕙 10AM – 2AM</p>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="h-24 bg-white rounded-[24px] animate-pulse" />
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-[32px] p-10 border border-dashed border-rose-200 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
            No bookings yet.
          </div>
        ) : (
          bookings.map(b => (
            <div key={b.id} className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-extrabold text-slate-800 text-[15px]">{b.event_type}</p>
                  <p className="text-slate-500 text-xs font-medium">{b.event_date} · {b.start_time}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusStyle[b.status]}`}>
                  {b.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 animate-in slide-in-from-bottom-full duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <form onSubmit={submit} className="space-y-5">
              <h3 className="text-xl font-extrabold text-slate-800 mb-2">Reserve Room</h3>
              <input type="text" placeholder="Event Type" required value={form.event_type} onChange={e => setForm({...form, event_type: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <input type="date" required value={form.event_date} onChange={e => setForm({...form, event_date: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <input type="time" required value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
                <input type="time" required value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
              </div>
              <input type="number" placeholder="Guests" required value={form.guest_count} onChange={e => setForm({...form, guest_count: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <button type="submit" className="w-full py-4 bg-[#FC687D] text-white rounded-full font-bold uppercase tracking-widest text-xs">Submit Booking →</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ user, member, setTab, onLogout }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-[32px] border border-rose-50 shadow-sm p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-3xl">👤</div>
          <div>
            <p className="font-extrabold text-slate-800 text-lg">{user?.email}</p>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Juja Member</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full py-4 rounded-full bg-slate-50 text-slate-500 font-bold text-[13px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] transition-all">
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── MAIN CUSTOMER PAGE ───────────────────────────────────────────────────────
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      setUser(session.user);
      try {
        const { data } = await supabase.from("loyalty_members").select("*").eq("user_id", session.user.id).single();
        if (data) setMember(data);
      } catch (e) { console.warn("No loyalty member found"); }
      setLoading(false);
    }
    loadData();
  }, [router]);

  if (loading) return <div className="min-h-screen bg-[#FFF5F7]" />;

  return (
    <div className="min-h-screen pb-28 pt-20 bg-[#FFF5F7]">
      <TopHeader user={user} onLogout={() => { supabase.auth.signOut(); router.push("/login"); }} />
      <div className="max-w-md mx-auto px-5 py-4">
        {tab === "home"    && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order"   && <OrderTab user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} member={member} setTab={setTab} onLogout={() => { supabase.auth.signOut(); router.push("/login"); }} />}
      </div>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}