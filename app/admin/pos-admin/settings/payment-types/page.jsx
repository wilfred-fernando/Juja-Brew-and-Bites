"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client"; // matches your POS pattern [5](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!sd7873278cd4a45f98c11a795fb16928a)

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
import { CSS } from "@dnd-kit/utilities"; // dnd-kit sortable pattern [3](https://github.com/dnd-kit/docs/blob/master/presets/sortable/README.md)[4](https://deepwiki.com/dnd-kit/docs/6.1-overview-and-usage)

/* ----------------------------- tiny UI helpers ----------------------------- */

function IconGrip(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M7 4a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 9a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 14a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  );
}

function Pill({ tone = "slate", children }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${cls}`}>{children}</span>;
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
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------- sortable row ----------------------------- */

function SortableRow({ row, busyId, onEdit, onDelete, onToggleActive }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const disabled = !!busyId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-3",
        isDragging ? "border-sky-300 bg-sky-50 shadow-md" : "border-slate-200 bg-white",
        !row.is_active ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* drag handle */}
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

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-semibold text-slate-900 truncate">{row.name}</div>
            {row.is_active ? <Pill tone="green">ACTIVE</Pill> : <Pill>INACTIVE</Pill>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            sort_order: <span className="font-mono">{row.sort_order ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* active toggle */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleActive(row)}
          className={[
            "px-3 py-2 rounded-lg text-xs font-bold border active:scale-95 transition",
            row.is_active
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {row.is_active ? "Deactivate" : "Activate"}
        </button>

        {/* edit */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEdit(row)}
          className={[
            "px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          Edit
        </button>

        {/* delete */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDelete(row)}
          className={[
            "px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 active:scale-95",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

export default function Page() {
  const supabase = getSupabaseClient();

  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState("");

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [toast, setToast] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editName, setEditName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  ); // standard dnd-kit setup [3](https://github.com/dnd-kit/docs/blob/master/presets/sortable/README.md)[4](https://deepwiki.com/dnd-kit/docs/6.1-overview-and-usage)

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2200);
  };

  const existingNames = useMemo(() => {
    return new Set(rows.map((r) => String(r.name || "").trim().toLowerCase()));
  }, [rows]);

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  async function fetchRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("pos_payment_types")
      .select("id, store_id, name, is_active, sort_order, created_at")
      .is("store_id", null) // ✅ GLOBAL ONLY
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      showToast("error", error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime sync: listen to changes and merge into local list.
  // Supabase docs show .channel().on('postgres_changes', ...) [6](https://supabase.com/docs/guides/realtime/postgres-changes)
  useEffect(() => {
    const channel = supabase
      .channel("pos_payment_types_admin_global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_payment_types" },
        (payload) => {
          const eventType = payload.eventType;
          const newRow = payload.new;
          const oldRow = payload.old;

          // keep only GLOBAL rows
          const isGlobalNew = newRow && (newRow.store_id === null || newRow.store_id === undefined);
          const isGlobalOld = oldRow && (oldRow.store_id === null || oldRow.store_id === undefined);

          setRows((current) => {
            if (eventType === "INSERT") {
              if (!isGlobalNew) return current;
              if (current.some((x) => x.id === newRow.id)) return current;
              return [...current, newRow].sort(
                (a, b) =>
                  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            }

            if (eventType === "UPDATE") {
              if (!isGlobalNew) return current;
              return current
                .map((x) => (x.id === newRow.id ? newRow : x))
                .sort(
                  (a, b) =>
                    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            }

            if (eventType === "DELETE") {
              if (!isGlobalOld) return current;
              return current.filter((x) => x.id !== oldRow.id);
            }

            return current;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function addRow() {
    const name = newName.trim();
    if (!name) return showToast("amber", "Name is required.");

    if (existingNames.has(name.toLowerCase())) {
      return showToast("amber", `"${name}" already exists.`);
    }

    setBusyId("ADD");

    try {
      const { paymentType } = await paymentTypeRequest("POST", { name });
      setRows((current) => current.some((row) => row.id === paymentType.id) ? current : [...current, paymentType]);
      setNewName("");
      showToast("green", "Added.");
    } catch (error) {
      showToast("error", error.message || "Unable to add payment type.");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(r) {
    setEditRow(r);
    setEditName(r.name || "");
    setEditOpen(true);
  }

  async function paymentTypeRequest(method, body) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const response = await fetch("/api/admin/payment-types", {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to update payment type.");
    return result;
  }

  async function saveEdit() {
    if (!editRow?.id) return;

    const name = editName.trim();
    if (!name) return showToast("amber", "Name is required.");

    const lower = name.toLowerCase();
    const dup = rows.some(
      (x) => x.id !== editRow.id && String(x.name || "").trim().toLowerCase() === lower
    );
    if (dup) return showToast("amber", `"${name}" already exists.`);

    setBusyId(editRow.id);
    try {
      const { paymentType: data } = await paymentTypeRequest("PATCH", { id: editRow.id, name });
      if (!data || data.name !== name) {
        throw new Error("Payment type name was not saved. Refresh and try again.");
      }

      setRows((current) => current.map((row) => row.id === data.id ? data : row));
      setEditOpen(false);
      setEditRow(null);
      showToast("green", "Updated.");
    } catch (error) {
      console.error(error);
      showToast("error", error.message || "Unable to save payment type name.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(r) {
    setBusyId(r.id);
    try {
      const nextActive = !r.is_active;
      const { paymentType: data } = await paymentTypeRequest("PATCH", { id: r.id, is_active: nextActive });
      if (!data || data.is_active !== nextActive) {
        throw new Error("Payment type status was not saved. Refresh and try again.");
      }

      setRows((current) => current.map((row) => row.id === data.id ? data : row));
      showToast("green", data.is_active ? "Activated." : "Deactivated.");
    } catch (error) {
      console.error(error);
      showToast("error", error.message || "Unable to update payment type status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(r) {
    const ok = confirm(`Delete "${r.name}"? This cannot be undone.`);
    if (!ok) return;

    setBusyId(r.id);

    try {
      await paymentTypeRequest("DELETE", { id: r.id });
      setRows((current) => current.filter((row) => row.id !== r.id));
      showToast("green", "Deleted.");
    } catch (error) {
      showToast("error", error.message || "Unable to delete payment type.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (busyId || !over || active.id === over.id) return;

    const oldIndex = rows.findIndex((x) => x.id === active.id);
    const newIndex = rows.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextRows = arrayMove([...rows], oldIndex, newIndex).map((r, idx) => ({
      ...r,
      sort_order: idx,
    }));

    // update UI immediately
    setRows(nextRows);

    setBusyId("SORT");
    try {
      await paymentTypeRequest("PUT", { ids: nextRows.map((row) => row.id) });
      showToast("green", "Order saved.");
    } catch (error) {
      showToast("error", error.message || "Unable to save payment type order.");
      await fetchRows();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-xl text-slate-900">Payment Types</h1>
          <p className="text-sm text-slate-500">
            Global payment types (store_id is NULL). Drag to sort.
          </p>
        </div>

        <button
          onClick={fetchRows}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
          type="button"
        >
          Refresh
        </button>
      </div>

      {/* add bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add payment type (e.g., Cash, QRPH)"
          className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-sky-300"
        />
        <button
          onClick={addRow}
          disabled={busyId === "ADD"}
          className="px-4 py-3 rounded-xl bg-slate-400/78 text-white text-sm font-bold disabled:opacity-50 active:scale-95"
          type="button"
        >
          {busyId === "ADD" ? "Adding…" : "Add"}
        </button>
      </div>

      {/* toast */}
      {toast && (
        <div
          className={[
            "rounded-xl px-4 py-3 text-sm font-semibold border",
            toast.type === "green"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800",
          ].join(" ")}
        >
          {toast.message}
        </div>
      )}

      {/* list */}
      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-slate-500">No payment types yet.</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rows.map((r) => (
                <SortableRow
                  key={r.id}
                  row={r}
                  busyId={busyId}
                  onEdit={openEdit}
                  onDelete={deleteRow}
                  onToggleActive={toggleActive}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* edit modal */}
      <Modal
        open={editOpen}
        title="Edit Payment Type"
        subtitle={editRow?.name ? `Editing: ${editRow.name}` : ""}
        onClose={() => {
          setEditOpen(false);
          setEditRow(null);
        }}
      >
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Name
          </label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-slate-200 outline-none focus:border-sky-300"
          />
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setEditOpen(false);
                setEditRow(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={busyId === editRow?.id}
              className="px-4 py-2 rounded-xl bg-slate-600 text-white text-sm font-bold disabled:opacity-50 active:scale-95"
              type="button"
            >
              {busyId === editRow?.id ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
