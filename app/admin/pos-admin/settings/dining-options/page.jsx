"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

function getSavedStoreId() {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("pos_store_id") ||
    localStorage.getItem("admin_store_id") ||
    null
  );
}

export default function DiningOptionsPage() {
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");

  const [userRole, setUserRole] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);

  const isSuperAdmin = useMemo(
    () => String(userRole || "").toLowerCase() === "super_admin",
    [userRole]
  );

  // ================= INIT =================
  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, store_id")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role || null;
      const assignedStoreId = profile?.store_id || null;
      setUserRole(role);

      if (String(role).toLowerCase() === "super_admin") {
        const { data: s } = await supabase
          .from("stores")
          .select("id, name")
          .order("name");

        const list = s || [];
        setStores(list);

        const saved = getSavedStoreId();
        const exists = saved && list.some((x) => x.id === saved);
        const initial = exists ? saved : (list[0]?.id || null);

        setSelectedStoreId(initial);

        if (initial) localStorage.setItem("pos_store_id", initial);

        setLoading(false);
        return;
      }

      const fallback = getSavedStoreId();
      const finalStoreId = assignedStoreId || fallback || null;

      setSelectedStoreId(finalStoreId);
      if (finalStoreId) localStorage.setItem("pos_store_id", finalStoreId);

      setLoading(false);
    })();
  }, []);

  // ================= LOAD =================
  useEffect(() => {
    if (!selectedStoreId) return;
    load(selectedStoreId);
  }, [selectedStoreId]);

  async function load(storeId) {
    setLoading(true);

    const { data } = await supabase
      .from("pos_dining_options")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true });

    setRows(data || []);
    setLoading(false);
  }

  async function add() {
    const v = name.trim();
    if (!v || !selectedStoreId) return;

    await supabase.from("pos_dining_options").insert([
      {
        store_id: selectedStoreId,
        name: v,
        is_active: true,
        sort_order: rows.length,
      },
    ]);

    setName("");
    await load(selectedStoreId);
  }

  async function toggle(row) {
    await supabase
      .from("pos_dining_options")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    await load(selectedStoreId);
  }

  async function remove(row) {
    const ok = confirm(`Delete "${row.name}"?`);
    if (!ok) return;

    await supabase
      .from("pos_dining_options")
      .delete()
      .eq("id", row.id);

    await load(selectedStoreId);
  }

  // ================= UI =================

  return (
    <div className="min-h-screen bg-[#FAF6F6] p-8 font-sans antialiased">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER BAR */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-[22px] font-bold text-[#0D1B2A]">
              Dining Options
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Super Admin can filter options by store. Admins are locked to their assigned store.
            </p>
          </div>

          <button 
            onClick={() => selectedStoreId && load(selectedStoreId)}
            className="px-4 py-1.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition shadow-sm"
          >
            Refresh
          </button>
        </div>

        {/* CONTAINER CARD */}
        <div className="bg-white border border-[#E9EEF4] rounded-2xl p-6 shadow-sm space-y-6">
          
          {/* TOP SECTION: TITLE & CONTROLS */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-black">
              Dining Configuration
            </h2>
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Filter:</span>
                <select
                  value={selectedStoreId || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedStoreId(v);
                    localStorage.setItem("pos_store_id", v);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-medium bg-white shadow-sm outline-none text-slate-700 min-w-[160px]"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* INPUT FORM BLOCK */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
            <div className="md:col-span-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dining Option Name (e.g. DINE-IN, TAKEOUT, TABLE 1)"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:border-slate-300 outline-none bg-[#FAFAFA]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                }}
              />
            </div>

            <button
              onClick={add}
              disabled={!name.trim()}
              className="w-full py-2.5 bg-slate-600 text-white rounded-xl text-sm font-bold tracking-wide transition active:scale-[0.98] disabled:opacity-40"
            >
              Add Option
            </button>
          </div>

          <hr className="border-slate-100" />

          {/* DATA LIST AREA */}
          <div className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Loading options...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-semibold text-slate-600">
                  No dining options yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Add your first options above
                </p>
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between items-center px-5 py-4 border border-[#E9EEF4] rounded-xl hover:bg-slate-50/50 transition bg-white"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 text-base">
                      {r.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Sort Order Key: {r.sort_order}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.is_active ? (
                      <span className="px-3 py-1 bg-[#E8F8F0] text-[#10B981] font-bold text-xs uppercase tracking-wider rounded-lg">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-lg">
                        Disabled
                      </span>
                    )}

                    <button
                      onClick={() => toggle(r)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                    >
                      Toggle
                    </button>

                    <button
                      onClick={() => remove(r)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#EF4444] bg-[#FEE2E2]/50 hover:bg-[#FEE2E2] transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}