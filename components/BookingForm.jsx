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