"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client"; // same pattern as your POS page [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!sd7873278cd4a45f98c11a795fb16928a)

export default function Page() {
  const supabase = getSupabaseClient();

  const [types, setTypes] = useState([]); // rows: {id, name, is_active, sort_order, created_at}
  const [newType, setNewType] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const existingKeys = useMemo(() => {
    return new Set(types.map((t) => (t.name ?? "").trim().toLowerCase()));
  }, [types]);

  async function loadGlobalTypes() {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase
      .from("pos_payment_types")
      .select("id, name, is_active, sort_order, created_at")
      .is("store_id", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setTypes([]);
    } else {
      setTypes(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadGlobalTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: GLOBAL changes (store_id is null)
  useEffect(() => {
    const channel = supabase
      .channel("pos_payment_types:global")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_payment_types",
          // Postgres Changes subscriptions support filtering; we only want global rows.
          // NOTE: If your project has trouble with is.null in filter,
          // remove filter and ignore non-global payloads in the callback.
          filter: "store_id=is.null",
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setTypes((current) => {
            if (eventType === "INSERT") {
              if (!newRow?.id) return current;
              if (current.some((t) => t.id === newRow.id)) return current;
              return [...current, newRow].sort(
                (a, b) =>
                  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            }

            if (eventType === "UPDATE") {
              if (!newRow?.id) return current;
              return current
                .map((t) => (t.id === newRow.id ? newRow : t))
                .sort(
                  (a, b) =>
                    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            }

            if (eventType === "DELETE") {
              const deletedId = oldRow?.id;
              if (!deletedId) return current;
              return current.filter((t) => t.id !== deletedId);
            }

            return current;
          });
        }
      )
      .subscribe(); // Postgres Changes subscribe pattern [4](https://supabase.com/docs/guides/realtime/postgres-changes)

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function addType() {
    setErrorMsg("");

    const name = newType.trim();
    if (!name) return;

    // UX validation
    if (existingKeys.has(name.toLowerCase())) {
      setErrorMsg(`"${name}" already exists.`);
      return;
    }

    setSaving(true);

    // DB-safe: global row uses store_id = null
    // onConflict targets name_key (unique index for global rows)
    const { error } = await supabase
      .from("pos_payment_types")
      .upsert(
        { store_id: null, name, is_active: true, sort_order: 0 },
        { onConflict: "name_key", ignoreDuplicates: true }
      ); // upsert options [5](https://supabase.com/docs/reference/javascript/upsert)

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      return;
    }

    // Don't manually push to state; realtime will deliver INSERT to all clients
    setNewType("");
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="font-bold text-lg">Global Payment Types</h1>

      <div className="flex gap-2 items-center">
        <input
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          placeholder="Add payment type"
          className="border px-2 py-1"
        />
        <button
          onClick={addType}
          disabled={saving}
          className="bg-slate-600 text-white px-3 py-1 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </div>

      {errorMsg && <div className="text-red-600 text-sm">{errorMsg}</div>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : types.length === 0 ? (
        <div className="text-sm text-slate-600">No global payment types yet.</div>
      ) : (
        types.map((t) => (
          <div key={t.id} className="border-b py-2 flex justify-between">
            <span className={t.is_active ? "" : "text-slate-500 line-through"}>
              {t.name}
            </span>
            <span className="text-xs text-slate-600">#{t.sort_order ?? 0}</span>
          </div>
        ))
      )}
    </div>
  );
}