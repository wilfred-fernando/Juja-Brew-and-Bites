"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, History, Maximize2, RefreshCcw, Trash2, Utensils } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";
import { KDS_ACTIVE_STATUSES, KDS_VISIBLE_STATUSES } from "@/lib/kds";

const supabase = getSupabaseClient();
const ALERT_SOUND_SRC = "/sound/notification.mp3";
const KDS_HISTORY_STATUSES = ["completed", "voided", "rejected"];

const peso = (n) =>
  `PHP ${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function statusStyle(status) {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "accepted":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "preparing":
      return "border-cyan-300 bg-cyan-50 text-cyan-800";
    case "ready":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "voided":
    case "rejected":
      return "border-red-300 bg-red-50 text-red-800";
    case "completed":
      return "border-slate-300 bg-slate-50 text-slate-700";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function itemOptionsText(item) {
  const optionText = Array.isArray(item?.selectedOptions)
    ? item.selectedOptions
        .map((option) => option?.name || option?.label || option?.value)
        .filter(Boolean)
        .join(", ")
    : "";
  return item?.variantDetails || optionText || "";
}

function isItemReady(item) {
  return Boolean(item?.kitchenReady || item?.kitchen_ready || item?.ready);
}

export default function KitchenDisplay() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertMessage, setAlertMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [kitchenCategoriesByStore, setKitchenCategoriesByStore] = useState({});
  const [menuItemCategoryLookup, setMenuItemCategoryLookup] = useState({});
  const knownTicketIds = useRef(new Set());
  const audioRef = useRef(null);

  const allowedStatuses = showHistory ? KDS_HISTORY_STATUSES : KDS_VISIBLE_STATUSES;

  const visibleTickets = useMemo(() => {
    const rows = tickets
      .filter((ticket) => allowedStatuses.includes(String(ticket.status || "").toLowerCase()))
      .filter((ticket) => getKitchenItems(ticket).length > 0);
    if (statusFilter === "all") return rows;
    return rows.filter((ticket) => String(ticket.status || "").toLowerCase() === statusFilter);
  }, [tickets, statusFilter, allowedStatuses, kitchenCategoriesByStore, menuItemCategoryLookup]);

  const stats = useMemo(
    () => ({
      all: tickets.filter((ticket) => allowedStatuses.includes(String(ticket.status || "").toLowerCase()) && getKitchenItems(ticket).length > 0).length,
      pending: tickets.filter((ticket) => ["pending", "accepted"].includes(String(ticket.status || "").toLowerCase()) && getKitchenItems(ticket).length > 0).length,
      preparing: tickets.filter((ticket) => String(ticket.status || "").toLowerCase() === "preparing" && getKitchenItems(ticket).length > 0).length,
      ready: tickets.filter((ticket) => String(ticket.status || "").toLowerCase() === "ready" && getKitchenItems(ticket).length > 0).length,
    }),
    [tickets, allowedStatuses, kitchenCategoriesByStore, menuItemCategoryLookup]
  );

  const playAlert = () => {
    const audio = audioRef.current || new Audio(ALERT_SOUND_SRC);
    audioRef.current = audio;
    audio.currentTime = 0;
    audio.volume = 0.95;
    audio.play().catch(() => {});
  };

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getKitchenCategoryRule(storeId) {
    const key = String(storeId || "");
    return kitchenCategoriesByStore[key] || kitchenCategoriesByStore.__global || { ids: new Set(), names: new Set(), configured: false };
  }

  function getItemCategoryMeta(item) {
    const lookup = menuItemCategoryLookup[String(item?.menuItemId || item?.menu_item_id || item?.id || "")] || {};
    return {
      categoryId: item?.categoryId || item?.category_id || item?.menu_category_id || lookup.categoryId || null,
      categoryName: item?.category || item?.categoryName || item?.category_name || lookup.categoryName || null,
    };
  }

  function isKitchenItem(ticket, item) {
    const rule = getKitchenCategoryRule(ticket?.store_id);
    if (!rule.configured) return false;
    const meta = getItemCategoryMeta(item);
    return Boolean(
      (meta.categoryId && rule.ids.has(String(meta.categoryId))) ||
      (meta.categoryName && rule.names.has(normalizeText(meta.categoryName)))
    );
  }

  function getKitchenItems(ticket) {
    const rows = Array.isArray(ticket?.items) ? ticket.items : [];
    return rows.map((item, index) => ({ ...item, __kdsIndex: index })).filter((item) => isKitchenItem(ticket, item));
  }

  async function loadKitchenPrinterCategories() {
    const [groupsRes, mapRes, categoriesRes, itemsRes] = await Promise.all([
      supabase
        .from("pos_printer_groups")
        .select("id, store_id, name, is_active")
        .ilike("name", "%Kitchen%")
        .eq("is_active", true),
      supabase.from("pos_printer_group_categories").select("printer_group_id, store_id, menu_category_id"),
      supabase.from("menu_categories").select("id, name"),
      supabase.from("menu_items").select("id, category, category_id"),
    ]);

    if (groupsRes.error || mapRes.error || categoriesRes.error) {
      setLoadError(groupsRes.error?.message || mapRes.error?.message || categoriesRes.error?.message || "Unable to load kitchen printer categories.");
      return;
    }

    const categoryById = new Map((categoriesRes.data || []).map((cat) => [String(cat.id), cat]));
    const kitchenGroupIds = new Set((groupsRes.data || []).map((group) => String(group.id)));
    const nextRules = {};

    (mapRes.data || [])
      .filter((row) => kitchenGroupIds.has(String(row.printer_group_id)))
      .forEach((row) => {
        const storeKey = String(row.store_id || "__global");
        const categoryId = String(row.menu_category_id || "");
        const category = categoryById.get(categoryId);
        if (!nextRules[storeKey]) nextRules[storeKey] = { ids: new Set(), names: new Set(), configured: true };
        if (categoryId) nextRules[storeKey].ids.add(categoryId);
        if (category?.name) nextRules[storeKey].names.add(normalizeText(category.name));
      });

    const itemLookup = {};
    (itemsRes.data || []).forEach((item) => {
      itemLookup[String(item.id)] = {
        categoryId: item.category_id || null,
        categoryName: item.category || null,
      };
    });

    setKitchenCategoriesByStore(nextRules);
    setMenuItemCategoryLookup(itemLookup);
  }

  const showNewTicketAlert = (ticket) => {
    const label = ticket?.dining_option || ticket?.ticket_number || "Kitchen order";
    setAlertMessage(`New kitchen order: ${label}`);
    playAlert();
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("New KDS Order", {
        body: `${ticket?.dining_option || "Kitchen"} - ${ticket?.customer_name || "Customer"}`,
        icon: "/images/juja-logo.png",
        badge: "/images/juja-logo.png",
        tag: `kds-${ticket?.id}`,
      });
    }
    setTimeout(() => setAlertMessage(""), 5000);
  };

  const fetchTickets = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("kds_tickets")
      .select("*")
      .in("status", allowedStatuses)
      .order("created_at", { ascending: !showHistory })
      .limit(200);

    if (error) {
      setLoadError(error.message || "Unable to load KDS tickets.");
    } else {
      setLoadError("");
      const rows = data || [];
      const previous = knownTicketIds.current;
      const next = new Set(rows.map((ticket) => ticket.id));
      const fresh = rows.find((ticket) => !previous.has(ticket.id) && ["pending", "accepted"].includes(String(ticket.status || "").toLowerCase()));
      knownTicketIds.current = next;
      setTickets(rows);
      if (silent && fresh) showNewTicketAlert(fresh);
    }
    setLoading(false);
  };

  useEffect(() => {
    const audio = new Audio(ALERT_SOUND_SRC);
    audio.volume = 0.95;
    audioRef.current = audio;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadKitchenPrinterCategories();
    fetchTickets();

    const channel = supabase
      .channel("kds-tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "kds_tickets" }, (payload) => {
        if (payload.eventType === "INSERT") showNewTicketAlert(payload.new);
        fetchTickets({ silent: true });
      })
      .subscribe();

    const timer = setInterval(() => fetchTickets({ silent: true }), 5000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [showHistory, statusFilter]);

  const updateTicketStatus = async (ticket, status) => {
    const timestamp = new Date().toISOString();
    const extra =
      {
        preparing: { started_at: ticket.started_at || timestamp },
        ready: { ready_at: timestamp },
        completed: { completed_at: timestamp },
        voided: { voided_at: timestamp },
        rejected: { voided_at: timestamp },
      }[status] || {};

    const { error } = await supabase.from("kds_tickets").update({ status, ...extra }).eq("id", ticket.id);

    if (error) {
      setAlertMessage(`KDS update failed: ${error.message}`);
      return;
    }

    if (ticket.source_type === "web" && ticket.web_order_id) {
      const webStatus = status === "preparing" ? "accepted" : status;
      const webExtra =
        {
          ready: { ready_at: timestamp },
          completed: { completed_at: timestamp, payment_status: "paid" },
          rejected: { rejected_at: timestamp },
          voided: { cancelled_at: timestamp },
        }[status] || {};
      await supabase.from("web_orders").update({ status: webStatus, order_status: webStatus, ...webExtra }).eq("id", ticket.web_order_id);
    }

    await fetchTickets({ silent: true });
  };

  const markItemReady = async (ticket, itemIndex) => {
    const currentItems = Array.isArray(ticket.items) ? ticket.items : [];
    const timestamp = new Date().toISOString();
    const nextItems = currentItems.map((item, index) =>
      index === itemIndex ? { ...item, kitchenReady: true, kitchenReadyAt: timestamp } : item
    );
    const allReady = nextItems.length > 0 && nextItems.every(isItemReady);
    const currentStatus = String(ticket.status || "pending").toLowerCase();
    const nextStatus = allReady ? "ready" : KDS_ACTIVE_STATUSES.includes(currentStatus) ? "preparing" : currentStatus;
    const extra = {
      ...(ticket.started_at ? {} : { started_at: timestamp }),
      ...(allReady ? { ready_at: timestamp } : {}),
    };

    const { error } = await supabase.from("kds_tickets").update({ items: nextItems, status: nextStatus, ...extra }).eq("id", ticket.id);

    if (error) {
      setAlertMessage(`Item ready failed: ${error.message}`);
      return;
    }

    if (allReady && ticket.source_type === "web" && ticket.web_order_id) {
      await supabase.from("web_orders").update({ status: "ready", order_status: "ready", ready_at: timestamp }).eq("id", ticket.web_order_id);
    }

    await fetchTickets({ silent: true });
  };

  const removeVoidedTicket = async (ticket) => {
    const { error } = await supabase.from("kds_tickets").delete().eq("id", ticket.id);
    if (error) {
      setAlertMessage(`Remove failed: ${error.message}`);
      return;
    }
    await fetchTickets({ silent: true });
  };

  const getTimeAgo = (date) => {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)} hr ago`;
  };

  return (
    <div className="min-h-screen bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-3 text-slate-900 sm:p-5">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-lg backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-700">Kitchen Display System</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">KDS Orders</h1>
              <p className="mt-1 text-sm text-slate-600">Live kitchen queue for POS charged orders and accepted web orders.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowHistory((value) => !value);
                  setStatusFilter("all");
                }}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-bold uppercase tracking-wider text-cyan-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100"
              >
                <History className="h-4 w-4" /> {showHistory ? "Live Orders" : "Order History"}
              </button>
              <button
                type="button"
                onClick={() => fetchTickets()}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
              <button
                type="button"
                onClick={() => document.documentElement.requestFullscreen?.()}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-600"
              >
                <Maximize2 className="h-4 w-4" /> Full Screen
              </button>
            </div>
          </div>
        </header>

        {alertMessage && (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-900 shadow-lg">
            {alertMessage}
          </div>
        )}

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 shadow-lg">
            KDS load failed: {loadError}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["all", showHistory ? "History" : "All", stats.all],
            ["pending", "New", stats.pending],
            ["preparing", "Preparing", stats.preparing],
            ["ready", "Ready", stats.ready],
          ].map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              disabled={showHistory && key !== "all"}
              onClick={() => setStatusFilter(key)}
              className={`rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                statusFilter === key ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white/90"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{value}</p>
            </button>
          ))}
        </section>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-16 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" />
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/90 p-16 text-center shadow-sm">
            <Utensils className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-500">{showHistory ? "No order history found." : "No active kitchen orders."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleTickets.map((ticket) => {
              const status = String(ticket.status || "pending").toLowerCase();
              const minutes = ticket.created_at ? Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60000) : 0;
              const ticketItems = getKitchenItems(ticket);
              const allItemsReady = ticketItems.length > 0 && ticketItems.every(isItemReady);
              const terminalStatus = ["completed", "voided", "rejected"].includes(status);

              return (
                <article
                  key={ticket.id}
                  className={`overflow-hidden rounded-3xl border bg-white/95 shadow-lg backdrop-blur ${
                    minutes > 15 && !["ready", "voided", "rejected", "completed"].includes(status) ? "border-amber-300" : "border-slate-200"
                  }`}
                >
                  <div className="border-b border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-slate-950">{ticket.dining_option || "Kitchen Order"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {ticket.customer_name || "Walk-in"} - {getTimeAgo(ticket.created_at)}
                        </p>
                      </div>
                      <span className={`rounded-xl border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle(status)}`}>{status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1">{String(ticket.source_type || "").toUpperCase()}</span>
                      <span className="rounded-full bg-white px-3 py-1">
                        <Clock3 className="mr-1 inline h-3 w-3" /> {ticket.created_at ? formatDateTime(ticket.created_at) : ""}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 p-4">
                    {ticketItems.map((item, idx) => {
                      const ready = isItemReady(item);
                      const showReadyStrike = ready && !showHistory && status !== "completed";
                      return (
                        <div
                          key={item.id || idx}
                          className={`rounded-2xl border p-3 transition ${ready ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className={showReadyStrike ? "text-slate-500 line-through decoration-2" : "text-slate-900"}>
                              <p className="text-base font-bold">
                                {item.quantity || 1} x {item.name}
                              </p>
                              {itemOptionsText(item) && <p className="mt-1 text-sm font-semibold">{itemOptionsText(item)}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => markItemReady(ticket, item.__kdsIndex ?? idx)}
                              disabled={ready || terminalStatus}
                              className="h-9 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-500"
                            >
                              Ready
                            </button>
                          </div>
                          {item.instructions && <p className="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-900">Note: {item.instructions}</p>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
                    <span>Total</span>
                    <span>{peso(ticket.total)}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2">
                    {["voided", "rejected"].includes(status) && (
                      <button
                        onClick={() => removeVoidedTicket(ticket)}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-xs font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    )}
                    <button
                      onClick={() => updateTicketStatus(ticket, "completed")}
                      disabled={!allItemsReady || terminalStatus}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-700 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-600 disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Done
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
