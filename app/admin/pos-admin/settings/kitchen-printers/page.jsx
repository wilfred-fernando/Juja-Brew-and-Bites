"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

function getSavedAdminStoreId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_store_id") || null;
}

export default function KitchenPrintersPage() {
  const supabase = getSupabaseClient();

  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [mapping, setMapping] = useState([]); // rows from pos_printer_group_categories
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [activeGroupId, setActiveGroupId] = useState(null);

  const isSuperAdmin = useMemo(
    () => String(userRole || "").toLowerCase() === "super_admin",
    [userRole]
  );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setErrorMessage("");

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.user) {
        if (!cancelled) {
          setErrorMessage(sessionError?.message || "Admin session was not found.");
          setLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, store_id")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (profileError) {
        if (!cancelled) {
          setErrorMessage(profileError.message);
          setLoading(false);
        }
        return;
      }

      const role = String(profile?.role || "").toLowerCase();
      const assignedStoreId = profile?.store_id || null;
      let storeList = [];

      if (role === "super_admin") {
        const { data, error } = await supabase
          .from("stores")
          .select("id, name, is_active, is_test")
          .order("name");

        if (error) {
          if (!cancelled) {
            setErrorMessage(error.message);
            setLoading(false);
          }
          return;
        }
        storeList = data || [];
      } else if (assignedStoreId) {
        const { data, error } = await supabase
          .from("stores")
          .select("id, name, is_active, is_test")
          .eq("id", assignedStoreId)
          .maybeSingle();

        if (error) {
          if (!cancelled) {
            setErrorMessage(error.message);
            setLoading(false);
          }
          return;
        }
        storeList = data ? [data] : [];
      }

      const savedAdminStoreId = getSavedAdminStoreId();
      const savedStoreExists = storeList.some((store) => store.id === savedAdminStoreId);
      const assignedStoreExists = storeList.some((store) => store.id === assignedStoreId);
      const defaultStore =
        storeList.find((store) => store.is_active && !store.is_test) ||
        storeList.find((store) => store.is_active) ||
        storeList[0] ||
        null;
      const initialStoreId =
        (role !== "super_admin" && assignedStoreExists && assignedStoreId) ||
        (savedStoreExists && savedAdminStoreId) ||
        (assignedStoreExists && assignedStoreId) ||
        defaultStore?.id ||
        null;

      if (!cancelled) {
        setUserRole(role);
        setStores(storeList);
        setSelectedStoreId(initialStoreId);
        if (initialStoreId) localStorage.setItem("admin_store_id", initialStoreId);
        if (!initialStoreId) {
          setErrorMessage("No store is assigned to this admin account.");
          setLoading(false);
        }
      }
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!selectedStoreId) return;
    loadAll(selectedStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  async function loadAll(storeId = selectedStoreId) {
    if (!storeId) return;
    setLoading(true);
    setErrorMessage("");

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

    const loadError = g.error || c.error || m.error;
    if (loadError) {
      setGroups([]);
      setCategories([]);
      setMapping([]);
      setActiveGroupId(null);
      setErrorMessage(loadError.message || "Kitchen printer settings could not be loaded.");
      setLoading(false);
      return;
    }

    setGroups(g.data || []);
    setCategories(c.data || []);
    setMapping(m.data || []);
    setActiveGroupId((currentId) =>
      (g.data || []).some((group) => group.id === currentId)
        ? currentId
        : g.data?.[0]?.id || null
    );
    setLoading(false);
  }

  async function addGroup() {
    const name = newGroupName.trim();
    if (!name || !selectedStoreId) return;

    const { data, error } = await supabase
      .from("pos_printer_groups")
      .insert([{ store_id: selectedStoreId, name, is_active: true }])
      .select("*")
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setNewGroupName("");
    await loadAll(selectedStoreId);
    if (data?.id) setActiveGroupId(data.id);
  }

  async function toggleGroup(group) {
    const { error } = await supabase
      .from("pos_printer_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    loadAll(selectedStoreId);
  }

  async function deleteGroup(group) {
    if (!confirm(`Delete printer group "${group.name}"?`)) return;
    const { error } = await supabase.from("pos_printer_groups").delete().eq("id", group.id);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (activeGroupId === group.id) setActiveGroupId(null);
    loadAll(selectedStoreId);
  }

  function isCatSelected(catId) {
    return mapping.some(
      (x) => x.printer_group_id === activeGroupId && x.menu_category_id === catId
    );
  }

  async function toggleCategory(catId) {
    if (!selectedStoreId || !activeGroupId) return;

    const existing = mapping.find(
      (x) => x.printer_group_id === activeGroupId && x.menu_category_id === catId
    );

    if (existing) {
      const { error } = await supabase
        .from("pos_printer_group_categories")
        .delete()
        .eq("id", existing.id);
      if (error) {
        setErrorMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("pos_printer_group_categories").insert([
        { store_id: selectedStoreId, printer_group_id: activeGroupId, menu_category_id: catId },
      ]);
      if (error) {
        setErrorMessage(error.message);
        return;
      }
    }

    loadAll(selectedStoreId);
  }

  const selectedStore = stores.find((store) => store.id === selectedStoreId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Kitchen Printers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure printer groups and category routing for each store.
          </p>
        </div>

        <label className="min-w-64 text-xs font-semibold uppercase tracking-wider text-slate-600">
          Store
          <select
            value={selectedStoreId || ""}
            disabled={!isSuperAdmin || stores.length === 0}
            onChange={(event) => {
              const nextStoreId = event.target.value;
              setSelectedStoreId(nextStoreId);
              setActiveGroupId(null);
              localStorage.setItem("admin_store_id", nextStoreId);
            }}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}{store.is_test ? " (Test)" : ""}{!store.is_active ? " (Inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Kitchen printer settings failed to load: {errorMessage}
        </div>
      )}

      {!selectedStoreId && !loading && !errorMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No store is available for this admin account.
        </div>
      )}

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
            {loading ? (
              <div className="text-sm text-slate-500">Loading printer groups...</div>
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                No printer groups configured for {selectedStore?.name || "this store"}.
              </div>
            ) : null}
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
