"use client";
import { useState } from "react";

export default function Settings() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    store_name: "Juja 주자 Brew & Bites",
    address: "36D Visayas Ave., Pasong Tamo, Quezon City",
    phone: "0939-9228383",
    store_hours: "10:00 AM – 12:00 MN",
    function_room_hours: "10:00 AM – 2:00 AM",
    delivery_fee: "150",
    min_order: "0",
  });

  const save = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-20">
      {saved && <div className="fixed top-6 right-6 z-[100] bg-slate-600 text-white text-[11px] font-bold uppercase tracking-widest px-6 py-4 rounded-full shadow-lg flex items-center gap-2"><span>✓</span> Settings saved!</div>}

      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">Store <span className="text-slate-700">Settings</span></h1>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Configure your store information</p>
      </header>

      <form onSubmit={save} className="space-y-6">
        <div className="bg-white rounded-3xl border border-sky-50 shadow-sm p-8 md:p-10 space-y-6">
          <h2 className="font-bold text-slate-700 text-xs uppercase tracking-[0.2em] mb-4">Store Information</h2>
          {[
            ["store_name","Store Name","Juja 주자 Brew & Bites"],
            ["address","Address","36D Visayas Ave., Pasong Tamo, Quezon City"],
            ["phone","Phone Number","0939-9228383"],
            ["store_hours","Store Hours","10:00 AM – 12:00 MN"],
            ["function_room_hours","Function Room Hours","10:00 AM – 2:00 AM"],
          ].map(([key,label,placeholder]) => (
            <div key={key}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">{label}</label>
              <input value={settings[key]} onChange={e=>setSettings(s=>({...s,[key]:e.target.value}))} placeholder={placeholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-sky-50 shadow-sm p-8 md:p-10 space-y-6">
          <h2 className="font-bold text-slate-700 text-xs uppercase tracking-[0.2em] mb-4">Order Settings</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Delivery Fee (₱)</label>
              <input type="number" value={settings.delivery_fee} onChange={e=>setSettings(s=>({...s,delivery_fee:e.target.value}))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Minimum Order (₱)</label>
              <input type="number" value={settings.min_order} onChange={e=>setSettings(s=>({...s,min_order:e.target.value}))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button type="submit" className="px-10 py-4 bg-slate-400/78 text-white text-[11px] font-normal uppercase tracking-widest rounded-full hover:bg-slate-300 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)]">
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}