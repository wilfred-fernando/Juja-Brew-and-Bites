"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

function usePosStoreId() {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    return (
      localStorage.getItem("pos_store_id") ||
      localStorage.getItem("admin_store_id") ||
      null
    );
  }, []);
}

export default function ReceiptSettingsPage() {
  const supabase = getSupabaseClient();
  const storeId = usePosStoreId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    header_text: "",
    footer_text: "",
    show_store_name: true,
    show_cashier: true,
    show_order_number: true,
    show_datetime: true,
    show_payment_type: true,
    auto_print: false,
  });

  useEffect(() => {
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("pos_receipt_settings")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) console.error(error.message);

    if (data) {
      setForm({
        header_text: data.header_text || "",
        footer_text: data.footer_text || "",
        show_store_name: !!data.show_store_name,
        show_cashier: !!data.show_cashier,
        show_order_number: !!data.show_order_number,
        show_datetime: !!data.show_datetime,
        show_payment_type: !!data.show_payment_type,
        auto_print: !!data.auto_print,
      });
    }

    setLoading(false);
  }

  async function save() {
    if (!storeId) return;
    setSaving(true);

    const payload = { store_id: storeId, ...form, updated_at: new Date().toISOString() };

    // upsert by unique(store_id)
    const { error } = await supabase
      .from("pos_receipt_settings")
      .upsert(payload, { onConflict: "store_id" });

    if (error) console.error(error.message);

    setSaving(false);
  }

  if (!storeId) return <div className="p-6">No store selected for POS.</div>;
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Receipt Settings</h1>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <Field label="Header text">
          <textarea
            value={form.header_text}
            onChange={(e) => setForm((p) => ({ ...p, header_text: e.target.value }))}
            className="w-full border rounded p-2 text-sm"
            rows={3}
          />
        </Field>

        <Field label="Footer text">
          <textarea
            value={form.footer_text}
            onChange={(e) => setForm((p) => ({ ...p, footer_text: e.target.value }))}
            className="w-full border rounded p-2 text-sm"
            rows={3}
          />
        </Field>

        <Toggle
          label="Show store name"
          checked={form.show_store_name}
          onChange={(v) => setForm((p) => ({ ...p, show_store_name: v }))}
        />
        <Toggle
          label="Show cashier"
          checked={form.show_cashier}
          onChange={(v) => setForm((p) => ({ ...p, show_cashier: v }))}
        />
        <Toggle
          label="Show order number"
          checked={form.show_order_number}
          onChange={(v) => setForm((p) => ({ ...p, show_order_number: v }))}
        />
        <Toggle
          label="Show date/time"
          checked={form.show_datetime}
          onChange={(v) => setForm((p) => ({ ...p, show_datetime: v }))}
        />
        <Toggle
          label="Show payment type"
          checked={form.show_payment_type}
          onChange={(v) => setForm((p) => ({ ...p, show_payment_type: v }))}
        />
        <Toggle
          label="Auto print (if printer configured)"
          checked={form.auto_print}
          onChange={(v) => setForm((p) => ({ ...p, auto_print: v }))}
        />

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 border-t">
      <span className="text-sm text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5"
      />
    </label>
  );
}