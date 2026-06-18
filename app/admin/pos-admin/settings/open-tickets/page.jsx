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

export default function OpenTicketsTemplatesPage() {
  const supabase = getSupabaseClient();
  const storeId = usePosStoreId();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("pos_open_ticket_templates")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order");
    setRows(data || []);
    setLoading(false);
  }

  async function add() {
    const v = name.trim();
    if (!v || !storeId) return;

    await supabase.from("pos_open_ticket_templates").insert([
      { store_id: storeId, name: v, is_active: true, sort_order: rows.length },
    ]);

    setName("");
    load();
  }

  async function toggle(row) {
    await supabase
      .from("pos_open_ticket_templates")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    load();
  }

  async function remove(row) {
    await supabase.from("pos_open_ticket_templates").delete().eq("id", row.id);
    load();
  }

  if (!storeId) return <div className="p-6">No store selected for POS.</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Open Tickets (Predefined)</h1>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add ticket (e.g. TAKEOUT, TABLE 1)"
          className="border rounded px-3 py-2 w-full"
        />
        <button onClick={add} className="px-4 py-2 rounded font-bold bg-slate-400/78 text-white">
          Add
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border-b">
              <div className="font-semibold">{r.name}</div>
              <div className="flex gap-2">
                <button onClick={() => toggle(r)} className="px-3 py-2 text-xs rounded border">
                  {r.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => remove(r)}
                  className="px-3 py-2 text-xs rounded border text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-4 text-sm text-slate-500">No templates yet.</div>
          )}
        </div>
      )}
    </div>
  );
}