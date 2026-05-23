"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ----------------------------- tiny UI helpers ----------------------------- */

function IconGrip(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M7 4a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 9a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 14a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  );
}

function Modal({ open, title, subtitle, children, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900">{title}</div>
            {subtitle ? <div className="text-sm text-slate-500 mt-1">{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 text-sm font-bold"
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const cls =
    toast.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : toast.type === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-amber-50 border-amber-200 text-amber-800";
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-semibold border ${cls}`}>
      {toast.message}
    </div>
  );
}

/* ----------------------------- Sortable Row ----------------------------- */

function SortableRow({ id, left, right, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-3",
        isDragging ? "border-rose-300 bg-rose-50 shadow-md" : "border-slate-200 bg-white",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
          aria-label="Drag handle"
        >
          <IconGrip />
        </button>
        <div className="min-w-0">{left}</div>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

/* --------------------------------- Page --------------------------------- */

export default function Page() {
  const supabase = getSupabaseClient();

  const [stores, setStores] = useState([]);
  const [cashiers, setCashiers] = useState([]);

  const [toast, setToast] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  ); // dnd-kit recommended setup [1](https://github.com/dnd-kit/docs/blob/master/presets/sortable/README.md)[2](https://deepwiki.com/dnd-kit/docs/6.1-overview-and-usage)

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2200);
  };

  const normalize = (s) => String(s ?? "").trim().toLowerCase();

  /* ----------------------------- Load ----------------------------- */
  async function load() {
    // STORES
    const sRes = await supabase
      .from("stores")
      .select("id, name, timezone, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (sRes.error) {
      console.error(sRes.error);
      showToast("error", sRes.error.message);
      setStores([]);
      return;
    }
    setStores(sRes.data || []);

    // CASHIERS (join store name)
    const cRes = await supabase
      .from("cashiers")
      .select(`
        id, name, pin, store_id, is_active, sort_order, created_at,
        stores(name)
      `)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (cRes.error) {
      console.error(cRes.error);
      showToast("error", cRes.error.message);
      setCashiers([]);
      return;
    }
    setCashiers(cRes.data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- Add Store ----------------------------- */
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreTz, setNewStoreTz] = useState("Asia/Manila");

  async function addStore() {
    const name = newStoreName.trim();
    if (!name) return showToast("warn", "Store name is required.");

    // optional UX duplicate check (by name)
    const dup = stores.some((s) => normalize(s.name) === normalize(name));
    if (dup) return showToast("warn", `"${name}" already exists.`);

    setBusyKey("ADD_STORE");
    const nextOrder = stores.length ? Math.max(...stores.map((x) => x.sort_order ?? 0)) + 1 : 0;

    const { error } = await supabase.from("stores").insert([
      { name, timezone: newStoreTz, is_active: true, sort_order: nextOrder },
    ]);

    setBusyKey(null);
    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }

    setNewStoreName("");
    showToast("success", "Store added.");
    load();
  }

  /* ----------------------------- Edit Store ----------------------------- */
  const [storeEditOpen, setStoreEditOpen] = useState(false);
  const [storeEditRow, setStoreEditRow] = useState(null);
  const [storeEditName, setStoreEditName] = useState("");
  const [storeEditTz, setStoreEditTz] = useState("Asia/Manila");
  const [storeEditActive, setStoreEditActive] = useState(true);

  function openEditStore(row) {
    setStoreEditRow(row);
    setStoreEditName(row.name ?? "");
    setStoreEditTz(row.timezone ?? "Asia/Manila");
    setStoreEditActive(!!row.is_active);
    setStoreEditOpen(true);
  }

  async function saveEditStore() {
    if (!storeEditRow?.id) return;
    const name = storeEditName.trim();
    if (!name) return showToast("warn", "Store name is required.");

    // prevent renaming to existing store name
    const dup = stores.some((s) => s.id !== storeEditRow.id && normalize(s.name) === normalize(name));
    if (dup) return showToast("warn", `"${name}" already exists.`);

    setBusyKey(`STORE_${storeEditRow.id}`);

    const { error } = await supabase
      .from("stores")
      .update({ name, timezone: storeEditTz, is_active: storeEditActive })
      .eq("id", storeEditRow.id);

    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }

    setStoreEditOpen(false);
    setStoreEditRow(null);
    showToast("success", "Store updated.");
    load();
  }

  async function deleteStore(row) {
    const ok = confirm(`Delete store "${row.name}"? This cannot be undone.`);
    if (!ok) return;

    setBusyKey(`STORE_${row.id}`);
    const { error } = await supabase.from("stores").delete().eq("id", row.id);
    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }

    showToast("success", "Store deleted.");
    load();
  }

  async function toggleStoreActive(row) {
    setBusyKey(`STORE_${row.id}`);
    const { error } = await supabase
      .from("stores")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }
    showToast("success", row.is_active ? "Store deactivated." : "Store activated.");
    load();
  }

  /* ----------------------------- Drag sort Stores ----------------------------- */
  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  async function onStoreDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stores.findIndex((x) => x.id === active.id);
    const newIndex = stores.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove([...stores], oldIndex, newIndex).map((r, idx) => ({
      ...r,
      sort_order: idx,
    }));
    setStores(next);

    // upsert FULL rows to avoid NOT NULL issues (name is required)
    const payload = next.map((r) => ({
      id: r.id,
      name: r.name,
      timezone: r.timezone ?? "Asia/Manila",
      is_active: !!r.is_active,
      sort_order: r.sort_order ?? 0,
    }));

    const { error } = await supabase
      .from("stores")
      .upsert(payload, { onConflict: "id", defaultToNull: false }); // recommended option [3](https://github.com/orgs/supabase/discussions/15730)

    if (error) {
      console.error(error);
      showToast("error", error.message);
      load();
    } else {
      showToast("success", "Store order saved.");
    }
  }

  /* ----------------------------- Add Cashier ----------------------------- */
  const [newCashierStore, setNewCashierStore] = useState("");
  const [newCashierName, setNewCashierName] = useState("");
  const [newCashierEmail, setNewCashierEmail] = useState("");

  async function addCashier() {
  const email = newCashierEmail.trim().toLowerCase();
  const name = newCashierName.trim();

  if (!newCashierStore) return showToast("warn", "Select a store.");
  if (!name) return showToast("warn", "Cashier name is required.");
  if (!email) return showToast("warn", "Cashier email is required.");

  setBusyKey("ADD_CASHIER");

  const res = await fetch("/api/admin/create-cashier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      full_name: name,
      store_id: newCashierStore,
    }),
  });

  const json = await res.json();
  setBusyKey(null);

  if (!res.ok) {
    showToast("error", json.error || "Failed to create cashier");
    return;
  }

  showToast("success", "Cashier created. Default password: Juja@123456");

  setNewCashierName("");
  setNewCashierEmail("");
  setNewCashierStore("");

  load();
}

  /* ----------------------------- Edit Cashier ----------------------------- */
  const [cashierEditOpen, setCashierEditOpen] = useState(false);
  const [cashierEditRow, setCashierEditRow] = useState(null);
  const [cashierEditStore, setCashierEditStore] = useState("");
  const [cashierEditName, setCashierEditName] = useState("");
  const [cashierEditPin, setCashierEditPin] = useState("");
  const [cashierEditActive, setCashierEditActive] = useState(true);

  function openEditCashier(row) {
    setCashierEditRow(row);
    setCashierEditStore(row.store_id ?? "");
    setCashierEditName(row.name ?? "");
    setCashierEditPin(row.pin ?? "");
    setCashierEditActive(!!row.is_active);
    setCashierEditOpen(true);
  }

  async function saveEditCashier() {
    if (!cashierEditRow?.id) return;
    const name = cashierEditName.trim();
    if (!cashierEditStore) return showToast("warn", "Select a store.");
    if (!name) return showToast("warn", "Cashier name is required.");

    setBusyKey(`CASHIER_${cashierEditRow.id}`);

    const { error } = await supabase
      .from("cashiers")
      .update({
        store_id: cashierEditStore,
        name,
        pin: cashierEditPin || null,
        is_active: cashierEditActive,
      })
      .eq("id", cashierEditRow.id);

    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }

    setCashierEditOpen(false);
    setCashierEditRow(null);
    showToast("success", "Cashier updated.");
    load();
  }

  async function deleteCashier(row) {
    const ok = confirm(`Delete cashier "${row.name}"? This cannot be undone.`);
    if (!ok) return;

    setBusyKey(`CASHIER_${row.id}`);
    const { error } = await supabase.from("cashiers").delete().eq("id", row.id);
    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }

    showToast("success", "Cashier deleted.");
    load();
  }

  async function toggleCashierActive(row) {
    setBusyKey(`CASHIER_${row.id}`);
    const { error } = await supabase
      .from("cashiers")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    setBusyKey(null);

    if (error) {
      console.error(error);
      showToast("error", error.message);
      return;
    }
    showToast("success", row.is_active ? "Cashier deactivated." : "Cashier activated.");
    load();
  }

  /* ----------------------------- Drag sort Cashiers ----------------------------- */
  const cashierIds = useMemo(() => cashiers.map((c) => c.id), [cashiers]);

  async function onCashierDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cashiers.findIndex((x) => x.id === active.id);
    const newIndex = cashiers.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove([...cashiers], oldIndex, newIndex).map((r, idx) => ({
      ...r,
      sort_order: idx,
    }));
    setCashiers(next);

    // upsert FULL rows to avoid NOT NULL issues (name/store_id likely required)
    const payload = next.map((r) => ({
      id: r.id,
      store_id: r.store_id,
      name: r.name,
      pin: r.pin ?? null,
      is_active: !!r.is_active,
      sort_order: r.sort_order ?? 0,
    }));

    const { error } = await supabase
      .from("cashiers")
      .upsert(payload, { onConflict: "id", defaultToNull: false }); // recommended option [3](https://github.com/orgs/supabase/discussions/15730)

    if (error) {
      console.error(error);
      showToast("error", error.message);
      load();
    } else {
      showToast("success", "Cashier order saved.");
    }
  }

  /* --------------------------------- UI --------------------------------- */

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-xl text-slate-900">Stores & Cashiers</h1>
          <p className="text-sm text-slate-500">
            Manage stores and cashier accounts (drag to sort, edit, delete).
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
          type="button"
        >
          Refresh
        </button>
      </div>

      <Toast toast={toast} />

      {/* ----------------------------- STORES ----------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Stores</h2>
          <span className="text-xs text-slate-500">Drag handle to reorder</span>
        </div>

        {/* add store */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            placeholder="Store name"
            className="px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />
          <button
            onClick={addStore}
            disabled={busyKey === "ADD_STORE"}
            className="px-4 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50 active:scale-95"
            type="button"
          >
            {busyKey === "ADD_STORE" ? "Adding…" : "Add Store"}
          </button>
        </div>

        {/* store list */}
        {stores.length === 0 ? (
          <div className="text-sm text-slate-500">No stores found.</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onStoreDragEnd}
          >
            <SortableContext items={storeIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {stores.map((s) => {
                  const disabled = busyKey === `STORE_${s.id}`;
                  return (
                    <SortableRow
                      key={s.id}
                      id={s.id}
                      disabled={!s.is_active}
                      left={
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{s.name}</div>
                          <div className="text-xs text-slate-500">
                            sort_order:{" "}
                            <span className="font-mono">{s.sort_order ?? 0}</span>
                          </div>
                        </div>
                      }
                      right={
                        <>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleStoreActive(s)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border active:scale-95 transition",
                              s.is_active
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            {s.is_active ? "ACTIVE" : "INACTIVE"}
                          </button>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => openEditStore(s)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => deleteStore(s)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 active:scale-95",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ----------------------------- CASHIERS ----------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Cashiers</h2>
          <span className="text-xs text-slate-500">Drag handle to reorder</span>
        </div>

        {/* add cashier */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            value={newCashierStore}
            onChange={(e) => setNewCashierStore(e.target.value)}
            className="px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          >
            <option value="">Select store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            value={newCashierName}
            onChange={(e) => setNewCashierName(e.target.value)}
            placeholder="Cashier name"
            className="px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <input
            value={newCashierEmail}
            onChange={(e) => setNewCashierEmail(e.target.value)}
            placeholder="Cashier email (e.g. name@email.com"
            className="px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <button
            onClick={addCashier}
            disabled={busyKey === "ADD_CASHIER"}
            className="px-4 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50 active:scale-95"
            type="button"
          >
            {busyKey === "ADD_CASHIER" ? "Adding…" : "Add Cashier"}
          </button>
        </div>

        {/* cashier list */}
        {cashiers.length === 0 ? (
          <div className="text-sm text-slate-500">No cashiers found.</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onCashierDragEnd}
          >
            <SortableContext items={cashierIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {cashiers.map((c) => {
                  const disabled = busyKey === `CASHIER_${c.id}`;
                  return (
                    <SortableRow
                      key={c.id}
                      id={c.id}
                      disabled={!c.is_active}
                      left={
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                          <div className="text-xs text-slate-500">
                            Store: <span className="font-semibold">{c.stores?.name || "—"}</span>
                            {" • "}
                            sort_order: <span className="font-mono">{c.sort_order ?? 0}</span>
                          </div>
                        </div>
                      }
                      right={
                        <>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleCashierActive(c)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border active:scale-95 transition",
                              c.is_active
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            {c.is_active ? "ACTIVE" : "INACTIVE"}
                          </button>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => openEditCashier(c)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => deleteCashier(c)}
                            className={[
                              "px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 active:scale-95",
                              disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ----------------------------- Store Edit Modal ----------------------------- */}
      <Modal
        open={storeEditOpen}
        title="Edit Store"
        subtitle={storeEditRow?.name ? `Editing: ${storeEditRow.name}` : ""}
        onClose={() => {
          setStoreEditOpen(false);
          setStoreEditRow(null);
        }}
      >
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Store Name
          </label>
          <input
            value={storeEditName}
            onChange={(e) => setStoreEditName(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Timezone
          </label>
          <input
            value={storeEditTz}
            onChange={(e) => setStoreEditTz(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={storeEditActive}
              onChange={(e) => setStoreEditActive(e.target.checked)}
            />
            Active
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setStoreEditOpen(false);
                setStoreEditRow(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={saveEditStore}
              disabled={busyKey === `STORE_${storeEditRow?.id}`}
              className="px-4 py-2 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50 active:scale-95"
              type="button"
            >
              {busyKey === `STORE_${storeEditRow?.id}` ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ----------------------------- Cashier Edit Modal ----------------------------- */}
      <Modal
        open={cashierEditOpen}
        title="Edit Cashier"
        subtitle={cashierEditRow?.name ? `Editing: ${cashierEditRow.name}` : ""}
        onClose={() => {
          setCashierEditOpen(false);
          setCashierEditRow(null);
        }}
      >
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Store
          </label>
          <select
            value={cashierEditStore}
            onChange={(e) => setCashierEditStore(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          >
            <option value="">Select store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Cashier Name
          </label>
          <input
            value={cashierEditName}
            onChange={(e) => setCashierEditName(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            PIN (optional)
          </label>
          <input
            value={cashierEditPin}
            onChange={(e) => setCashierEditPin(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-rose-300"
          />

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={cashierEditActive}
              onChange={(e) => setCashierEditActive(e.target.checked)}
            />
            Active
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setCashierEditOpen(false);
                setCashierEditRow(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={saveEditCashier}
              disabled={busyKey === `CASHIER_${cashierEditRow?.id}`}
              className="px-4 py-2 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50 active:scale-95"
              type="button"
            >
              {busyKey === `CASHIER_${cashierEditRow?.id}` ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}