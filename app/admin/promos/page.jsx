"use client";

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const defaultVoucherCampaignForm = {
  code: "WELCOME-VOUCHER",
  title: "Welcome voucher",
  reward_text: "B1T1 16oz Cheesecake Milk Tea (Welcome Voucher)",
  reward_type: "welcome",
  voucher_prefix: "WELCOME",
  validity_days: "15",
  starts_at: "2026-01-01",
  ends_at: "2026-08-31",
  is_active: true,
  auto_create_on_signup: true,
  auto_create_on_link: true,
};

function mapPromo(row) {
  return {
    ...row,
    discount: Number(row.discount_value ?? row.discount ?? 0),
    type: row.discount_type || row.type || "fixed",
    min_order: Number(row.min_order || 0),
    active: row.is_active ?? row.active ?? true,
  };
}

function promoValueLabel(promo) {
  const discount = Number(promo.discount || 0);
  if (discount <= 0) return "Public promo";
  return promo.type === "percent" ? `${discount}% OFF` : `PHP ${discount.toLocaleString("en-PH")} OFF`;
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function campaignPeriodLabel(campaign) {
  const start = toDateInput(campaign.starts_at);
  const end = toDateInput(campaign.ends_at);
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "No promo period";
}

export default function AdminPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voucherCampaigns, setVoucherCampaigns] = useState([]);
  const [voucherCampaignLoading, setVoucherCampaignLoading] = useState(true);
  const [addingVoucherCampaign, setAddingVoucherCampaign] = useState(false);
  const [voucherCampaignSubmitting, setVoucherCampaignSubmitting] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", description: "", discount: "", type: "percent", min_order: "", active: true });
  const [voucherCampaignForm, setVoucherCampaignForm] = useState(defaultVoucherCampaignForm);

  useEffect(() => {
    fetchPromos();
    fetchVoucherCampaigns();
  }, []);

  async function fetchPromos() {
    setLoading(true);
    const { data, error } = await supabase.from("promotions").select("*").order("created_at", { ascending: false });
    if (!error && data) setPromos(data.map(mapPromo));
    else setPromos([]);
    setLoading(false);
  }

  async function fetchVoucherCampaigns() {
    setVoucherCampaignLoading(true);
    try {
      const response = await fetch("/api/admin/voucher-campaigns");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load voucher campaigns.");
      setVoucherCampaigns(payload.rows || []);
    } catch (error) {
      console.error("Voucher campaign load failed:", error);
      setVoucherCampaigns([]);
    } finally {
      setVoucherCampaignLoading(false);
    }
  }

  const handleAddPromo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const newPromo = {
      code: form.code.toUpperCase(),
      title: form.title.trim() || form.code.toUpperCase(),
      description: form.description.trim(),
      discount_type: form.type,
      discount_value: parseFloat(form.discount) || 0,
      min_order: parseFloat(form.min_order) || 0,
      is_active: true,
    };
    const { data, error } = await supabase.from("promotions").insert([newPromo]).select();
    if (!error && data) setPromos([mapPromo(data[0]), ...promos]);
    setForm({ code: "", title: "", description: "", discount: "", type: "percent", min_order: "", active: true });
    setAdding(false);
    setSubmitting(false);
  };

  const togglePromo = async (id, currentStatus) => {
    setPromos(promos.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
    await supabase.from("promotions").update({ is_active: !currentStatus }).eq("id", id);
  };

  const deletePromo = async (id) => {
    if (!confirm("Delete this promo code permanently?")) return;
    setPromos(promos.filter(p => p.id !== id));
    await supabase.from("promotions").delete().eq("id", id);
  };

  const handleAddVoucherCampaign = async (e) => {
    e.preventDefault();
    setVoucherCampaignSubmitting(true);
    try {
      const response = await fetch("/api/admin/voucher-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voucherCampaignForm),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to create voucher campaign.");
      setVoucherCampaigns([payload.campaign, ...voucherCampaigns].filter(Boolean));
      setVoucherCampaignForm(defaultVoucherCampaignForm);
      setAddingVoucherCampaign(false);
    } catch (error) {
      alert(error?.message || "Unable to create voucher campaign.");
    } finally {
      setVoucherCampaignSubmitting(false);
    }
  };

  const toggleVoucherCampaign = async (campaign) => {
    const nextActive = !campaign.is_active;
    setVoucherCampaigns((rows) => rows.map((row) => row.id === campaign.id ? { ...row, is_active: nextActive } : row));
    const response = await fetch("/api/admin/voucher-campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: campaign.id, partial: { is_active: nextActive } }),
    });
    if (!response.ok) {
      setVoucherCampaigns((rows) => rows.map((row) => row.id === campaign.id ? campaign : row));
      const payload = await response.json().catch(() => ({}));
      alert(payload?.error || "Unable to update voucher campaign.");
    }
  };

  const duplicateVoucherCampaign = (campaign) => {
    setVoucherCampaignForm({
      code: `${String(campaign.code || "VOUCHER").toUpperCase()}-COPY`,
      title: campaign.title || "",
      reward_text: campaign.reward_text || "",
      reward_type: campaign.reward_type || "welcome",
      voucher_prefix: campaign.voucher_prefix || "VOUCHER",
      validity_days: String(campaign.validity_days || 15),
      starts_at: toDateInput(campaign.starts_at),
      ends_at: toDateInput(campaign.ends_at),
      is_active: true,
      auto_create_on_signup: Boolean(campaign.auto_create_on_signup),
      auto_create_on_link: Boolean(campaign.auto_create_on_link),
    });
    setAddingVoucherCampaign(true);
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-in fade-in duration-300">
      
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            Promo <span className="text-slate-700">Codes</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Manage Discounts & Offers</p>
        </div>
        <button onClick={() => setAdding(true)} className="px-6 py-3 bg-slate-400/78 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-slate-300 transition-colors rounded-full shadow-sm">
          + Create Promo
        </button>
      </header>

      <div className="space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full"></div></div>
        ) : promos.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-sky-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">No promo codes active.</p>
          </div>
        ) : (
          promos.map((promo) => (
            <div key={promo.id} className={`bg-white border border-sky-50 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm hover:shadow-md transition-all ${!promo.active ? "opacity-60 bg-gray-50" : ""}`}>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-extrabold text-slate-800 text-2xl uppercase tracking-tight">{promo.title || promo.code}</span>
                  <span className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${promo.active ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {promo.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mb-3 text-xs font-semibold leading-5 text-slate-500">{promo.description || promo.code}</p>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-slate-700">{promoValueLabel(promo)}</span>
                  {promo.min_order > 0 && <><span className="w-1.5 h-1.5 bg-sky-200 rounded-full"></span><span>Min. PHP {promo.min_order}</span></>}
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto pt-4 md:pt-0">
                <button onClick={() => togglePromo(promo.id, promo.active)} className="flex-1 md:flex-none px-5 py-2.5 bg-slate-50 border border-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:border-sky-500 hover:text-slate-700 hover:bg-sky-50 transition-colors rounded-full">
                  {promo.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => deletePromo(promo.id)} className="px-5 py-2.5 border border-slate-200 bg-white text-sky-500 text-[10px] font-bold uppercase tracking-widest hover:bg-sky-50 transition-colors rounded-full">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <section className="mt-12 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Loyalty Voucher Setup</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-800">Voucher Campaigns</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Create promo-period vouchers that can be auto-issued on signup or loyalty account linking.
            </p>
          </div>
          <button
            onClick={() => {
              setVoucherCampaignForm(defaultVoucherCampaignForm);
              setAddingVoucherCampaign(true);
            }}
            className="rounded-full bg-slate-600 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-sky-500"
          >
            + Create Voucher Campaign
          </button>
        </div>

        {voucherCampaignLoading ? (
          <div className="py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Loading voucher campaigns...</div>
        ) : voucherCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
            No voucher campaigns created.
          </div>
        ) : (
          <div className="grid gap-4">
            {voucherCampaigns.map((campaign) => (
              <article key={campaign.id} className={`rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${campaign.is_active ? "border-sky-100 bg-sky-50/45" : "border-slate-200 bg-slate-50 opacity-75"}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-extrabold uppercase tracking-tight text-slate-800">{campaign.title}</h3>
                      <span className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest ${campaign.is_active ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}>
                        {campaign.is_active ? "Active" : "Disabled"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        {campaign.reward_type || "voucher"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-6 text-slate-600">{campaign.reward_text}</p>
                    <div className="mt-4 grid gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 md:grid-cols-4">
                      <span>Code: <b className="text-slate-700">{campaign.code}</b></span>
                      <span>Prefix: <b className="text-slate-700">{campaign.voucher_prefix}</b></span>
                      <span>Valid: <b className="text-slate-700">{campaign.validity_days} day(s)</b></span>
                      <span>Period: <b className="text-slate-700">{campaignPeriodLabel(campaign)}</b></span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      <span className={`rounded-full px-3 py-1 ${campaign.auto_create_on_signup ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>Signup auto-create: {campaign.auto_create_on_signup ? "On" : "Off"}</span>
                      <span className={`rounded-full px-3 py-1 ${campaign.auto_create_on_link ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>Link auto-create: {campaign.auto_create_on_link ? "On" : "Off"}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 md:shrink-0">
                    <button
                      onClick={() => toggleVoucherCampaign(campaign)}
                      className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-slate-800"
                    >
                      {campaign.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => duplicateVoucherCampaign(campaign)}
                      className="rounded-full bg-slate-600 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-sky-500"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {adding && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-lg rounded-3xl animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-sky-50 flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-800">New <span className="text-slate-700">Promo</span></h2>
              <button onClick={() => setAdding(false)} className="text-slate-500 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
            </div>
            <form onSubmit={handleAddPromo} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Discount Code *</label>
                <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="E.G. SUMMER20" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Promo Title</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="Welcome Voucher" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Public Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="min-h-24 w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-semibold leading-6 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="Describe the promo shown on the public promo page." />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (₱)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Amount *</label>
                  <input required type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder={form.type === 'percent' ? "10" : "150"} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Min. Order Requirement (₱)</label>
                <input type="number" min="0" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-[#5b7288]/20 focus:bg-white transition-all" placeholder="0 = No Minimum" />
              </div>
              <div className="pt-6 mt-6 border-t border-sky-50 flex gap-4">
                <button type="button" onClick={() => setAdding(false)} className="flex-1 py-4 border border-slate-200 bg-white text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:border-sky-500 hover:text-slate-700 hover:bg-sky-50 transition-colors rounded-full">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-4 bg-slate-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-sky-500 transition-colors rounded-full shadow-sm disabled:opacity-50">
                  {submitting ? "Saving..." : "Create Promo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addingVoucherCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-sky-50 p-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Voucher Campaign</p>
                <h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-800">Create Promo Voucher Rule</h2>
              </div>
              <button
                onClick={() => setAddingVoucherCampaign(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 pb-1 text-xl font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddVoucherCampaign} className="space-y-6 p-8">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Campaign Code *</label>
                  <input
                    required
                    value={voucherCampaignForm.code}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, code: e.target.value.toUpperCase() })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold uppercase tracking-widest text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                    placeholder="WELCOME-VOUCHER"
                  />
                </div>
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Voucher Prefix *</label>
                  <input
                    required
                    value={voucherCampaignForm.voucher_prefix}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, voucher_prefix: e.target.value.toUpperCase() })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold uppercase tracking-widest text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                    placeholder="WELCOME"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Title *</label>
                <input
                  required
                  value={voucherCampaignForm.title}
                  onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, title: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  placeholder="Welcome voucher"
                />
              </div>

              <div>
                <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Voucher Details *</label>
                <textarea
                  required
                  value={voucherCampaignForm.reward_text}
                  onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, reward_text: e.target.value })}
                  className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold leading-6 text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  placeholder="B1T1 16oz Cheesecake Milk Tea (Welcome Voucher)"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-4">
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Type</label>
                  <select
                    value={voucherCampaignForm.reward_type}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, reward_type: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs font-bold uppercase tracking-widest text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  >
                    <option value="welcome">Welcome</option>
                    <option value="promo">Promo</option>
                    <option value="birthday">Birthday</option>
                    <option value="points">Points</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Valid Days</label>
                  <input
                    type="number"
                    min="1"
                    value={voucherCampaignForm.validity_days}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, validity_days: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  />
                </div>
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Start Date</label>
                  <input
                    type="date"
                    value={voucherCampaignForm.starts_at}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, starts_at: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  />
                </div>
                <div>
                  <label className="mb-2 ml-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">End Date</label>
                  <input
                    type="date"
                    value={voucherCampaignForm.ends_at}
                    onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, ends_at: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-800 transition-all focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5b7288]/20"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["is_active", "Campaign active"],
                  ["auto_create_on_signup", "Auto-create on signup"],
                  ["auto_create_on_link", "Auto-create on loyalty link"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(voucherCampaignForm[key])}
                      onChange={(e) => setVoucherCampaignForm({ ...voucherCampaignForm, [key]: e.target.checked })}
                      className="h-5 w-5 accent-slate-600"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 flex gap-4 border-t border-sky-50 pt-6">
                <button
                  type="button"
                  onClick={() => setAddingVoucherCampaign(false)}
                  className="flex-1 rounded-full border border-slate-200 bg-white py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:border-sky-500 hover:bg-sky-50 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voucherCampaignSubmitting}
                  className="flex-1 rounded-full bg-slate-600 py-4 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-sky-500 disabled:opacity-50"
                >
                  {voucherCampaignSubmitting ? "Saving..." : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
