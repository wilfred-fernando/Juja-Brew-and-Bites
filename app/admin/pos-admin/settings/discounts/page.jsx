"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

function usePosStoreId() {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("pos_store_id") || localStorage.getItem("admin_store_id") || null;
  }, []);
}

function discountLabel(row) {
  const type = String(row?.type || "").toLowerCase();
  const value = Number(row?.value || 0);
  if (type === "percent") return `${value.toFixed(2).replace(/\.00$/, "")}%`;
  if (type === "fixed") {
    return `PHP ${value.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (type === "comp") return "Comp / Free";
  return value ? String(value) : "-";
}

export default function DiscountsSettingsPage() {
  const supabase = getSupabaseClient();
  const storeId = usePosStoreId();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    type: "percent",
    scope: "receipt",
    value: 0,
  });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase
      .from("pos_discounts")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) setErrorMessage(error.message);
    setRows(data || []);
    setLoading(false);
  }

  async function add() {
    const name = form.name.trim();
    if (!name || saving) return;

    setSaving(true);
    setErrorMessage("");

    const payload = {
      store_id: null,
      name,
      type: form.type,
      scope: form.scope,
      value: Number(form.value || 0),
      is_active: true,
      sort_order: rows.length,
    };

    let { error } = await supabase.from("pos_discounts").insert([payload]);

    if (error && storeId) {
      const message = String(error.message || "").toLowerCase();
      const canRetryWithStore =
        message.includes("store_id") ||
        message.includes("row-level security") ||
        message.includes("not-null");

      if (canRetryWithStore) {
        ({ error } = await supabase.from("pos_discounts").insert([{ ...payload, store_id: storeId }]));
      }
    }

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setForm({ name: "", type: "percent", scope: "receipt", value: 0 });
    await load();
    setSaving(false);
  }

  async function toggle(row) {
    setErrorMessage("");
    const { error } = await supabase.from("pos_discounts").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) setErrorMessage(error.message);
    load();
  }

  async function remove(row) {
    setErrorMessage("");
    const { error } = await supabase.from("pos_discounts").delete().eq("id", row.id);
    if (error) setErrorMessage(error.message);
    load();
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Discounts</h1>
        <p className="mt-1 text-sm text-slate-600">Discounts managed here are available in every POS store.</p>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Discount name (e.g. SENIOR CITIZEN | PWD)"
          className="border rounded px-3 py-2 w-full"
        />

        <div className="grid md:grid-cols-3 gap-2">
          <select
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            className="border rounded px-3 py-2"
          >
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
            <option value="comp">Free/Comp</option>
          </select>

          <select
            value={form.scope}
            onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))}
            className="border rounded px-3 py-2"
          >
            <option value="receipt">Order / Receipt</option>
            <option value="item">Item</option>
          </select>

          <input
            type="number"
            step="0.01"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className="border rounded px-3 py-2"
            placeholder="Value"
          />
        </div>

        {errorMessage && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>}

        <button
          onClick={add}
          disabled={saving || !form.name.trim()}
          className="px-4 py-2 rounded font-bold bg-slate-700 text-white text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Discount"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 p-3 border-b last:border-b-0">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {r.type} | {r.scope} | {discountLabel(r)} | {r.is_active ? "Active" : "Inactive"}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggle(r)} className="px-3 py-2 text-xs rounded border">
                  {r.is_active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => remove(r)} className="px-3 py-2 text-xs rounded border text-red-600">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-4 text-sm text-slate-500">No discounts yet.</div>}
        </div>
      )}
    </div>
  );
}
