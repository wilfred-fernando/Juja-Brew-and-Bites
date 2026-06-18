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

export default function KitchenPrintersPage() {
  const supabase = getSupabaseClient();
  const storeId = usePosStoreId();

  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [mapping, setMapping] = useState([]); // rows from pos_printer_group_categories

  const [newGroupName, setNewGroupName] = useState("");
  const [activeGroupId, setActiveGroupId] = useState(null);

  useEffect(() => {
    if (!storeId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function loadAll() {
    const [g, c, m] = await Promise.all([
      supabase
        .from("pos_printer_groups")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at"),
      supabase
        .from("menu_categories")
        .select("id, name")
        .order("name"),
      supabase
        .from("pos_printer_group_categories")
        .select("*")
        .eq("store_id", storeId),
    ]);

    setGroups(g.data || []);
    setCategories(c.data || []);
    setMapping(m.data || []);

    if (!activeGroupId && (g.data || []).length) {
      setActiveGroupId(g.data[0].id);
    }
  }

  async function addGroup() {
    const name = newGroupName.trim();
    if (!name || !storeId) return;

    const { data } = await supabase
      .from("pos_printer_groups")
      .insert([{ store_id: storeId, name, is_active: true }])
      .select("*")
      .maybeSingle();

    setNewGroupName("");
    await loadAll();
    if (data?.id) setActiveGroupId(data.id);
  }

  async function toggleGroup(group) {
    await supabase
      .from("pos_printer_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id);
    loadAll();
  }

  async function deleteGroup(group) {
    await supabase.from("pos_printer_groups").delete().eq("id", group.id);
    if (activeGroupId === group.id) setActiveGroupId(null);
    loadAll();
  }

  function isCatSelected(catId) {
    return mapping.some(
      (x) => x.printer_group_id === activeGroupId && x.menu_category_id === catId
    );
  }

  async function toggleCategory(catId) {
    if (!storeId || !activeGroupId) return;

    const existing = mapping.find(
      (x) => x.printer_group_id === activeGroupId && x.menu_category_id === catId
    );

    if (existing) {
      await supabase.from("pos_printer_group_categories").delete().eq("id", existing.id);
    } else {
      await supabase.from("pos_printer_group_categories").insert([
        { store_id: storeId, printer_group_id: activeGroupId, menu_category_id: catId },
      ]);
    }

    loadAll();
  }

  if (!storeId) return <div className="p-6">No store selected for POS.</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Kitchen Printers</h1>

      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        {/* Groups */}
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="font-semibold">Printer Groups</div>

          <div className="flex gap-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Add group (e.g. Kitchen, Bar)"
              className="border rounded px-3 py-2 w-full"
            />
            <button onClick={addGroup} className="px-4 py-2 font-bold rounded bg-slate-400/78 text-white">
              Add
            </button>
          </div>

          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`w-full text-left p-3 rounded-xl border ${
                  activeGroupId === g.id ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-xs text-slate-500">{g.is_active ? "Active" : "Inactive"}</div>
                  </div>
                  <div className="flex gap-2">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(g);
                      }}
                      className="text-xs px-2 py-1 rounded border"
                    >
                      {g.is_active ? "Disable" : "Enable"}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGroup(g);
                      }}
                      className="text-xs px-2 py-1 rounded border text-red-600"
                    >
                      Delete
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {groups.length === 0 && <div className="text-sm text-slate-500">No groups yet.</div>}
          </div>
        </div>

        {/* Category mapping */}
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Assign Categories</div>
            <div className="text-xs text-slate-500">
              {activeGroupId ? "Select categories sent to this printer group" : "Create/select a group first"}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-2 mt-4">
            {categories.map((c) => (
              <button
                key={c.id}
                disabled={!activeGroupId}
                onClick={() => toggleCategory(c.id)}
                className={`p-3 rounded-xl border text-left disabled:opacity-50 ${
                  isCatSelected(c.id)
                    ? "border-sky-200 bg-sky-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="font-semibold text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {isCatSelected(c.id) ? "Included" : "Not included"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}