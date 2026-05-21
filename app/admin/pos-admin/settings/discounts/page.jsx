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

export default function DiscountsSettingsPage() {
  const supabase = getSupabaseClient();
  const storeId = usePosStoreId();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    type: "percent",   // percent | fixed | comp
    scope: "receipt",  // receipt | item
    value: 0,
  });

  useEffect(() => {
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pos_discounts")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order");

    if (error) console.error(error.message);
    setRows(data || []);
    setLoading(false);
  }

  async function add() {
    if (!storeId) return;
    const name = form.name.trim();
    if (!name) return;

    await supabase.from("pos_discounts").insert([
      {
        store_id: storeId,
        name,
        type: form.type,
        scope: form.scope,
        value: Number(form.value || 0),
        is_active: true,
        sort_order: rows.length,
      },
    ]);

    setForm({ name: "", type: "percent", scope: "receipt", value: 0 });
    load();
  }

  async function toggle(row) {
    await supabase.from("pos_discounts").update({ is_active: !row.is_active }).eq("id", row.id);
    load();
  }

  async function remove(row) {
    await supabase.from("pos_discounts").delete().eq("id", row.id);
    load();
  }

  if (!storeId) return <div className="p-6">No store selected for POS.</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Discounts</h1>

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
            <option value="receipt">Receipt</option>
            <option value="item">Item</option>
          </select>

          <input
            type="number"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className="border rounded px-3 py-2"
            placeholder="Value"
          />
        </div>

        <button onClick={add} className="px-4 py-2 rounded bg-black text-white text-sm">
          Add Discount
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border-b">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {r.type} · {r.scope} · value: {r.value} · {r.is_active ? "Active" : "Inactive"}
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
``