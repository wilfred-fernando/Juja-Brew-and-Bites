"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";

const AUDIT_ACTIONS = ["item_voided", "ticket_voided", "ticket_deleted", "ticket_items_changed"];
const CART_ACTIONS = ["item_added", "item_removed"];
const VOID_ACTIONS = new Set(["item_voided", "ticket_voided", "ticket_deleted"]);

function asObject(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isVoidedItem(item) {
  const status = String(item?.status || item?.item_status || "").toLowerCase();
  return Boolean(item?.voided || item?.isVoided || item?.is_voided || status.includes("void") || status.includes("refund"));
}

function itemQuantity(item) {
  return Math.max(0, Number(item?.quantity ?? item?.qty ?? 1) || 0);
}

function itemNetAmount(item) {
  const quantity = itemQuantity(item);
  const unitPrice = Number(item?.unitPrice ?? item?.unit_price ?? item?.price ?? 0) || 0;
  const gross = unitPrice * quantity;
  const discount = Math.max(0, Number(item?.discountAmount ?? item?.discount_amount ?? 0) || 0);
  return Math.max(0, gross - Math.min(gross, discount));
}

function peso(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function affectedItems(log) {
  const itemData = asObject(log?.item_data);
  if (CART_ACTIONS.includes(log?.action)) {
    return Object.keys(itemData).length ? [itemData] : [];
  }
  if (log?.action === "item_voided") {
    const item = asObject(itemData.before, asObject(itemData.after));
    return Object.keys(item).length ? [item] : [];
  }

  if (log?.action === "ticket_items_changed") {
    const beforeItems = Array.isArray(itemData.before) ? itemData.before : [];
    const afterItems = Array.isArray(itemData.after) ? itemData.after : [];
    const maxLength = Math.max(beforeItems.length, afterItems.length);

    return Array.from({ length: maxLength }, (_, index) => {
      const before = beforeItems[index];
      const after = afterItems[index];
      if (JSON.stringify(before) === JSON.stringify(after)) return null;

      const beforeQty = before ? itemQuantity(before) : 0;
      const afterQty = after ? itemQuantity(after) : 0;
      const change = !before
        ? "Added"
        : !after
          ? "Removed"
          : beforeQty !== afterQty
            ? `Qty ${beforeQty} → ${afterQty}`
            : "Details changed";

      return { ...(after || before || {}), _auditChange: change };
    }).filter(Boolean);
  }

  const snapshot = asObject(log?.ticket_snapshot);
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const activeAtDeletion = items.filter((item) => !isVoidedItem(item));
  return activeAtDeletion.length > 0 ? activeAtDeletion : items;
}

function actionLabel(action) {
  if (action === "item_added") return "Cart item added";
  if (action === "item_removed") return "Cart item removed";
  if (action === "item_voided") return "Item voided";
  if (action === "ticket_voided") return "Whole ticket voided";
  if (action === "ticket_items_changed") return "Ticket items changed";
  return "Ticket deleted directly";
}

export default function SavedTicketVoidLogsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [logs, setLogs] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    const [savedLogsResult, cartLogsResult, storesResult] = await Promise.all([
      supabase
        .from("saved_ticket_audit_logs")
        .select("id, ticket_id, store_id, action, reason, actor_id, actor_name, ticket_name, order_type, item_name, item_data, ticket_snapshot, created_at")
        .in("action", AUDIT_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("pos_cart_audit_logs")
        .select("id, cart_session_id, store_id, action, actor_id, actor_name, item_name, item_data, cart_context, created_at")
        .in("action", CART_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("stores").select("id, name").order("name", { ascending: true }),
    ]);

    if (savedLogsResult.error || cartLogsResult.error) {
      setError(savedLogsResult.error?.message || cartLogsResult.error?.message || "POS audit logs could not be loaded.");
      setLogs([]);
    } else {
      const cartLogs = (cartLogsResult.data || []).map((log) => {
        const context = asObject(log.cart_context);
        return {
          ...log,
          ticket_id: log.cart_session_id,
          ticket_name: context.dining_option || "Active POS Cart",
          order_type: context.web_order_id ? `Web Order: #${String(context.web_order_id).slice(0, 8).toUpperCase()}` : context.dining_option || "Active POS Cart",
          reason: context.operation ? String(context.operation).replaceAll("_", " ") : "POS cart action",
          _auditSource: "pos_cart",
        };
      });
      setLogs([...(savedLogsResult.data || []), ...cartLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }
    setStores(storesResult.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const storeNames = useMemo(
    () => new Map(stores.map((store) => [String(store.id), store.name])),
    [stores]
  );

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00+08:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999+08:00`).getTime() : null;

    return logs.filter((log) => {
      if (storeFilter !== "ALL" && String(log.store_id) !== storeFilter) return false;
      if (actionFilter !== "ALL" && log.action !== actionFilter) return false;

      const createdTime = new Date(log.created_at).getTime();
      if (fromTime && createdTime < fromTime) return false;
      if (toTime && createdTime > toTime) return false;

      if (!needle) return true;
      const itemNames = affectedItems(log).map((item) => item?.name || item?.item_name || "").join(" ");
      return [
        log.ticket_id,
        log.ticket_name,
        log.order_type,
        log.item_name,
        log.actor_name,
        log.reason,
        storeNames.get(String(log.store_id)),
        itemNames,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [actionFilter, dateFrom, dateTo, logs, search, storeFilter, storeNames]);

  const totals = useMemo(() => {
    let itemCount = 0;
    let amount = 0;
    filteredLogs.forEach((log) => {
      if (VOID_ACTIONS.has(log.action)) {
        const items = affectedItems(log);
        itemCount += items.reduce((sum, item) => sum + itemQuantity(item), 0);
        amount += items.reduce((sum, item) => sum + itemNetAmount(item), 0);
      }
    });
    return {
      events: filteredLogs.length,
      voidEvents: filteredLogs.filter((log) => VOID_ACTIONS.has(log.action)).length,
      itemCount,
      amount,
    };
  }, [filteredLogs]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">POS accountability</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">POS Audit Logs</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Read-only history of POS cart additions/removals, saved-ticket changes, item voids, whole-ticket voids, and direct deletions.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-red-100 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Audit events</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{totals.events}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Confirmed void events</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{totals.voidEvents}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item quantity voided</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{totals.itemCount.toLocaleString("en-PH")}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recorded item value</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{peso(totals.amount)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item, cashier, reason, or ticket ID"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value="ALL">All branches</option>
            {stores.map((store) => <option key={store.id} value={String(store.id)}>{store.name}</option>)}
          </select>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value="ALL">All audit types</option>
            <option value="item_voided">Item voids</option>
            <option value="ticket_voided">Whole-ticket voids</option>
            <option value="ticket_deleted">Direct deletions</option>
            <option value="ticket_items_changed">Ticket item changes</option>
            <option value="item_added">Cart item additions</option>
            <option value="item_removed">Cart item removals</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="From date" className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="To date" className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700" />
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">Loading saved-ticket audit history…</div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-bold text-slate-800">No matching saved-ticket audit events</p>
          <p className="mt-1 text-sm text-slate-500">Adjust the branch, date, type, or search filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const items = affectedItems(log);
            const eventAmount = items.reduce((sum, item) => sum + itemNetAmount(item), 0);
            return (
              <article key={log.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 p-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${log.action === "item_added" ? "bg-emerald-100 text-emerald-800" : log.action === "ticket_items_changed" || log.action === "ticket_deleted" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                        {actionLabel(log.action)}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{storeNames.get(String(log.store_id)) || "Unknown branch"}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-black text-slate-900">{log.order_type || log.ticket_name || "Saved Ticket"}</h2>
                    <p className="mt-1 break-all text-xs text-slate-400">{log._auditSource === "pos_cart" ? "Cart session" : "Ticket ID"}: {log.ticket_id}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-bold text-slate-800">{formatDateTime(log.created_at)} PHT</p>
                    <p className="mt-1 text-xs text-slate-500">Cashier: <span className="font-bold text-slate-700">{log.actor_name || "Unknown staff account"}</span></p>
                  </div>
                </div>

                <div className="p-4">
                  <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-red-900">
                    <span className="font-black">{log.action === "ticket_items_changed" || log._auditSource === "pos_cart" ? "Audit note:" : "Reason:"}</span> {log.reason || "No reason supplied; direct mutation captured by audit trigger."}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3">{log.action === "ticket_items_changed" || log._auditSource === "pos_cart" ? "Affected item" : "Voided item"}</th>
                          <th className="px-4 py-3 text-center">Qty</th>
                          <th className="px-4 py-3 text-right">Unit price</th>
                          <th className="px-4 py-3 text-right">Net amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((item, index) => {
                          const quantity = itemQuantity(item);
                          const unitPrice = Number(item?.unitPrice ?? item?.unit_price ?? item?.price ?? 0) || 0;
                          const detail = item?.variantDetails || item?.variant_details || item?.instructions || item?.specialInstructions || item?.special_instructions || "";
                          return (
                            <tr key={item?.cartItemId || item?.id || `${log.id}-${index}`}>
                              <td className="px-4 py-3">
                                 <p className="font-bold text-slate-900">{item?.name || item?.item_name || log.item_name || "Unnamed item"}</p>
                                {item?._auditChange && <p className="mt-1 text-xs font-bold text-amber-700">{item._auditChange}</p>}
                                {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-700">{quantity}</td>
                              <td className="px-4 py-3 text-right text-slate-600">{peso(unitPrice)}</td>
                              <td className="px-4 py-3 text-right font-bold text-red-700">{peso(itemNetAmount(item))}</td>
                            </tr>
                          );
                        })}
                        {items.length === 0 && (
                          <tr><td colSpan={4} className="px-4 py-5 text-center text-sm text-slate-500">The audit event has no item snapshot.</td></tr>
                        )}
                      </tbody>
                      <tfoot className="bg-slate-50">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-600">{log.action === "ticket_items_changed" || log._auditSource === "pos_cart" ? "Recorded affected value" : "Recorded void value"}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{peso(eventAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
