"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Download, History, LogOut, Maximize2, PackageCheck, RefreshCcw, Trash2, Utensils, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";
import { KDS_ACTIVE_STATUSES, KDS_VISIBLE_STATUSES } from "@/lib/kds";
import { getStableSession } from "@/lib/supabase/session";

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
    case "scheduled":
      return "border-indigo-300 bg-indigo-50 text-indigo-800";
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

function itemOptionRows(item) {
  const rows = [];
  const options = Array.isArray(item?.selectedOptions) ? item.selectedOptions : [];
  const grouped = new Map();
  options.forEach((option) => {
    const group = option?.groupName || option?.group_name || option?.optionGroup || option?.option_group || option?.type || "Options";
    const label = option?.name || option?.label || option?.value;
    if (!label) return;
    grouped.set(group, [...(grouped.get(group) || []), label]);
  });
  grouped.forEach((values, group) => {
    values.forEach((value) => rows.push({ group, values: value }));
  });
  if (!rows.length && item?.variantDetails) {
    String(item.variantDetails)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [maybeGroup, ...rest] = line.split(":");
        if (rest.length) {
          rest
            .join(":")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((value) => rows.push({ group: maybeGroup.trim(), values: value }));
          return;
        }

        const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) {
          parts.forEach((value) => rows.push({ group: "", values: value }));
          return;
        }

        rows.push({ group: "", values: line });
      });
  }
  return rows;
}

function scheduleLabel(ticket) {
  if (ticket?.schedule_label) return ticket.schedule_label;
  if (ticket?.scheduled_for) return formatDateTime(ticket.scheduled_for);
  if (ticket?.fulfillment_time) return ticket.fulfillment_time;
  return "";
}

function scheduleTitle(ticket) {
  const type = String(ticket?.fulfillment_type || ticket?.dining_option || "").toLowerCase();
  return type.includes("dine") ? "SERVING TIME" : "PICKUP TIME";
}

function isItemReady(item) {
  return Boolean(item?.kitchenReady || item?.kitchen_ready || item?.ready);
}

function isItemVoided(item) {
  const status = String(item?.status || item?.item_status || "").toLowerCase();
  return Boolean(
    item?.voided ||
      item?.isVoided ||
      item?.is_voided ||
      item?.voided_at ||
      item?.voidedAt ||
      status.includes("void") ||
      status.includes("refund")
  );
}

function isItemRetiredFromLiveBatch(item) {
  return Boolean(
    item?.kdsCompleted ||
      item?.kds_completed ||
      item?.kdsCompletedAt ||
      item?.kds_completed_at ||
      item?.kitchenCompleted ||
      item?.kitchen_completed ||
      item?.kitchenCompletedAt ||
      item?.kitchen_completed_at
  );
}

function itemReceivedTimestamp(item) {
  return item?.kdsReceivedAt || item?.kds_received_at || item?.received_at || item?.added_at || null;
}

function activeTicketTimestamp(ticket, displayItems = []) {
  const itemTimes = (Array.isArray(displayItems) ? displayItems : [])
    .map((item) => {
      const timestamp = itemReceivedTimestamp(item);
      const time = timestamp ? new Date(timestamp).getTime() : 0;
      return Number.isFinite(time) ? time : 0;
    })
    .filter(Boolean);
  const newestItemTime = itemTimes.length ? Math.max(...itemTimes) : 0;
  if (newestItemTime) return new Date(newestItemTime).toISOString();
  return ticket?.started_at || ticket?.source_created_at || ticket?.created_at || null;
}

function kdsItemLayoutClasses(itemCount) {
  if (itemCount >= 9) {
    return {
      card: "w-[94vw] md:w-[720px] xl:w-[800px]",
      items: "md:grid-cols-2 xl:grid-cols-3",
    };
  }

  if (itemCount >= 5) {
    return {
      card: "w-[90vw] md:w-[520px]",
      items: "md:grid-cols-2",
    };
  }

  return {
    card: "w-[82vw] sm:w-[300px] lg:w-[310px] xl:w-[320px]",
    items: "grid-cols-1",
  };
}

export default function KitchenDisplay() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertMessage, setAlertMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryTicket, setSelectedHistoryTicket] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [kitchenCategoriesByStore, setKitchenCategoriesByStore] = useState({});
  const [menuItemCategoryLookup, setMenuItemCategoryLookup] = useState({});
  const [showAvailabilityPanel, setShowAvailabilityPanel] = useState(false);
  const [availabilityItems, setAvailabilityItems] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilitySavingId, setAvailabilitySavingId] = useState("");
  const [availabilitySearch, setAvailabilitySearch] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [assignedStoreId, setAssignedStoreId] = useState("");
  const knownTicketIds = useRef(new Set());
  const audioRef = useRef(null);
  const kitchenCategoriesRef = useRef({});
  const menuItemCategoryLookupRef = useRef({});

  const allowedStatuses = showHistory ? KDS_HISTORY_STATUSES : KDS_VISIBLE_STATUSES;

  const visibleTickets = useMemo(() => {
    const rows = tickets
      .filter((ticket) => allowedStatuses.includes(String(ticket.status || "").toLowerCase()))
      .filter((ticket) => {
        const kitchenItems = getKitchenItems(ticket);
        const displayItems = showHistory ? kitchenItems : kitchenItems.filter((item) => !isItemRetiredFromLiveBatch(item));
        if (displayItems.length > 0) return true;
        return showHistory && Array.isArray(ticket.items) && ticket.items.length > 0;
      });
    if (statusFilter === "all") return rows;
    return rows.filter((ticket) => String(ticket.status || "").toLowerCase() === statusFilter);
  }, [tickets, statusFilter, allowedStatuses, showHistory, kitchenCategoriesByStore, menuItemCategoryLookup]);

  const filteredAvailabilityItems = useMemo(() => {
    const needle = normalizeText(availabilitySearch);
    if (!needle) return availabilityItems;
    return availabilityItems.filter((item) =>
      normalizeText(`${item.name || ""} ${item.category || ""}`).includes(needle)
    );
  }, [availabilityItems, availabilitySearch]);

  const playAlert = () => {
    [0, 900, 1800].forEach((delay) => {
      window.setTimeout(() => {
        const audio = delay === 0 ? audioRef.current || new Audio(ALERT_SOUND_SRC) : new Audio(ALERT_SOUND_SRC);
        if (delay === 0) audioRef.current = audio;
        audio.currentTime = 0;
        audio.volume = 0.95;
        audio.play().catch(() => {});
      }, delay);
    });
  };

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getKitchenLoginPath() {
    return "/kitchen/login";
  }

  async function bootstrapAuth() {
    setAuthLoading(true);
    const { session, error: sessionError } = await getStableSession(supabase);
    const user = session?.user;

    if (sessionError || !user) {
      window.location.href = getKitchenLoginPath();
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, store_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setLoadError(profileError.message || "Unable to load KDS account profile.");
      setAuthorized(false);
      setAuthLoading(false);
      return;
    }

    const role = String(profile?.role || "").toLowerCase();
    if (!["kds", "kitchen", "admin", "super_admin"].includes(role)) {
      await supabase.auth.signOut();
      window.location.href = getKitchenLoginPath();
      return;
    }

    if (role !== "super_admin" && !profile?.store_id) {
      setLoadError("This KDS account has no assigned store. Ask admin to assign a branch.");
      setAuthorized(false);
      setAuthLoading(false);
      return;
    }

    setUserEmail(user.email || "");
    setUserRole(role);
    setAssignedStoreId(role === "super_admin" ? "" : profile.store_id);
    setAuthorized(true);
    setAuthLoading(false);
  }

  function getKitchenCategoryRule(storeId, rulesOverride = null) {
    const key = String(storeId || "");
    const rules = rulesOverride || kitchenCategoriesRef.current || kitchenCategoriesByStore;
    return rules[key] || rules.__global || { ids: new Set(), names: new Set(), configured: false };
  }

  function getItemCategoryMeta(item, lookupOverride = null) {
    const lookupMap = lookupOverride || menuItemCategoryLookupRef.current || menuItemCategoryLookup;
    const lookup = lookupMap[String(item?.menuItemId || item?.menu_item_id || item?.id || "")] || {};
    return {
      categoryId: item?.categoryId || item?.category_id || item?.menu_category_id || lookup.categoryId || null,
      categoryName: item?.category || item?.categoryName || item?.category_name || lookup.categoryName || null,
    };
  }

  function isKitchenItem(ticket, item, resources = null) {
    const rule = getKitchenCategoryRule(ticket?.store_id, resources?.rules);
    if (!rule.configured) return false;
    const meta = getItemCategoryMeta(item, resources?.lookup);
    return Boolean(
      (meta.categoryId && rule.ids.has(String(meta.categoryId))) ||
      (meta.categoryName && rule.names.has(normalizeText(meta.categoryName)))
    );
  }

  function getKitchenItems(ticket, resources = null) {
    const rows = Array.isArray(ticket?.items) ? ticket.items : [];
    return rows.map((item, index) => ({ ...item, __kdsIndex: index })).filter((item) => isKitchenItem(ticket, item, resources));
  }

  function getDisplayItems(ticket) {
    const kitchenItems = getKitchenItems(ticket);
    const visibleKitchenItems = showHistory ? kitchenItems : kitchenItems.filter((item) => !isItemRetiredFromLiveBatch(item));
    if (visibleKitchenItems.length > 0 || !showHistory) return visibleKitchenItems;
    return Array.isArray(ticket?.items) ? ticket.items : [];
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
      supabase.from("menu_items").select("id, category"),
    ]);

    if (groupsRes.error || mapRes.error || categoriesRes.error) {
      setLoadError(groupsRes.error?.message || mapRes.error?.message || categoriesRes.error?.message || "Unable to load kitchen printer categories.");
      return { rules: {}, lookup: {} };
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
        categoryId: null,
        categoryName: item.category || null,
      };
    });

    kitchenCategoriesRef.current = nextRules;
    menuItemCategoryLookupRef.current = itemLookup;
    setKitchenCategoriesByStore(nextRules);
    setMenuItemCategoryLookup(itemLookup);
    return { rules: nextRules, lookup: itemLookup };
  }

  async function loadKitchenAvailabilityItems(resources = null, storeIdOverride = null) {
    const storeId = storeIdOverride || assignedStoreId;
    if (!storeId) {
      setAvailabilityItems([]);
      return;
    }

    setAvailabilityLoading(true);
    const rule = getKitchenCategoryRule(storeId, resources?.rules);
    const [itemsRes, availabilityRes] = await Promise.all([
      supabase
        .from("menu_items")
        .select("id, name, category, is_available")
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("menu_item_store_availability")
        .select("item_id, store_id, is_available")
        .eq("store_id", storeId),
    ]);

    if (itemsRes.error || availabilityRes.error) {
      setLoadError(itemsRes.error?.message || availabilityRes.error?.message || "Unable to load kitchen item availability.");
      setAvailabilityLoading(false);
      return;
    }

    const availabilityByItem = new Map(
      (availabilityRes.data || []).map((row) => [String(row.item_id), row.is_available !== false])
    );
    const rows = (itemsRes.data || [])
      .filter((item) => {
        if (!rule.configured) return false;
        return rule.names.has(normalizeText(item.category));
      })
      .map((item) => ({
        ...item,
        is_available: availabilityByItem.has(String(item.id))
          ? availabilityByItem.get(String(item.id))
          : item.is_available !== false,
      }));

    setAvailabilityItems(rows);
    setAvailabilityLoading(false);
  }

  async function toggleKitchenItemAvailability(item) {
    if (!assignedStoreId || !item?.id) return;
    const nextAvailable = item.is_available === false;
    setAvailabilitySavingId(String(item.id));
    const { error } = await supabase
      .from("menu_item_store_availability")
      .upsert(
        {
          item_id: String(item.id),
          store_id: String(assignedStoreId),
          is_available: nextAvailable,
        },
        { onConflict: "item_id,store_id" }
      );

    if (error) {
      setAlertMessage(`Availability update failed: ${error.message}`);
      setTimeout(() => setAlertMessage(""), 6000);
    } else {
      setAvailabilityItems((prev) =>
        prev.map((row) => (String(row.id) === String(item.id) ? { ...row, is_available: nextAvailable } : row))
      );
      setAlertMessage(`${item.name} is now ${nextAvailable ? "available" : "unavailable"}.`);
      setTimeout(() => setAlertMessage(""), 4000);
    }
    setAvailabilitySavingId("");
  }

  const showNewTicketAlert = (ticket) => {
    if (getKitchenItems(ticket).length === 0) return;
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

  const fetchTickets = async ({ silent = false, resources = null } = {}) => {
    if (!authorized) return;
    if (!silent) setLoading(true);
    let query = supabase
      .from("kds_tickets")
      .select("*")
      .in("status", allowedStatuses)
      .order("created_at", { ascending: false })
      .limit(200);

    if (assignedStoreId) query = query.eq("store_id", assignedStoreId);

    const { data, error } = await query;

    if (error) {
      setLoadError(error.message || "Unable to load KDS tickets.");
    } else {
      setLoadError("");
      const rows = showHistory ? data || [] : [...(data || [])].reverse();
      const previous = knownTicketIds.current;
      const next = new Set(rows.map((ticket) => ticket.id));
      const fresh = rows.find((ticket) => {
        const status = String(ticket.status || "").toLowerCase();
        return !previous.has(ticket.id) && ["pending", "accepted"].includes(status) && getKitchenItems(ticket, resources).length > 0;
      });
      knownTicketIds.current = next;
      setTickets(rows);
      if (silent && fresh) showNewTicketAlert(fresh);
    }
    setLoading(false);
  };

  function mergeRealtimeTicket(payload) {
    const changed = payload.new || payload.old || {};
    if (!changed?.id) return;
    const changedStatus = String(changed.status || "").toLowerCase();

    if (payload.eventType === "DELETE" || !allowedStatuses.includes(changedStatus)) {
      setTickets((prev) => prev.filter((ticket) => ticket.id !== changed.id));
      return;
    }

    if (assignedStoreId && String(changed.store_id || "") !== String(assignedStoreId)) return;
    if (!showHistory && getKitchenItems(changed).filter((item) => !isItemRetiredFromLiveBatch(item)).length === 0) return;

    setTickets((prev) => {
      const withoutChanged = prev.filter((ticket) => ticket.id !== changed.id);
      return showHistory ? [changed, ...withoutChanged] : [...withoutChanged, changed];
    });
  }

  useEffect(() => {
    bootstrapAuth();
  }, []);

  useEffect(() => {
    const audio = new Audio(ALERT_SOUND_SRC);
    audio.volume = 0.95;
    audioRef.current = audio;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowInstallButton(!isStandalone());
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowInstallButton(false);
    };

    if (isStandalone()) setShowInstallButton(false);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installKdsPwa = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setShowInstallButton(false);
  };

  useEffect(() => {
    if (!authorized || authLoading) return undefined;
    let cancelled = false;
    (async () => {
      const resources = await loadKitchenPrinterCategories();
      if (!cancelled && assignedStoreId) await loadKitchenAvailabilityItems(resources);
      if (!cancelled) await fetchTickets({ resources });
    })();

    const channel = supabase
      .channel("kds-tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "kds_tickets" }, (payload) => {
        const changed = payload.new || payload.old || {};
        if (assignedStoreId && String(changed.store_id || "") !== String(assignedStoreId)) return;
        mergeRealtimeTicket(payload);
        if (payload.eventType === "INSERT") showNewTicketAlert(payload.new);
        fetchTickets({ silent: true });
      })
      .subscribe();

    const timer = setInterval(() => fetchTickets({ silent: true }), 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [showHistory, statusFilter, authorized, authLoading, assignedStoreId]);

  async function signOutKitchen() {
    await supabase.auth.signOut();
    window.location.href = getKitchenLoginPath();
  }

  const updateTicketStatus = async (ticket, status) => {
    const timestamp = new Date().toISOString();
    const completedItems =
      status === "completed" && Array.isArray(ticket.items)
        ? ticket.items.map((item) => ({
            ...item,
            ready: true,
            kitchenReady: true,
            kitchen_ready: true,
            ready_at: item.ready_at || item.kitchen_ready_at || item.kitchenReadyAt || timestamp,
            kitchenReadyAt: item.kitchenReadyAt || item.kitchen_ready_at || item.ready_at || timestamp,
            kitchen_ready_at: item.kitchen_ready_at || item.kitchenReadyAt || item.ready_at || timestamp,
            kdsCompleted: true,
            kds_completed: true,
            kitchenCompleted: true,
            kitchen_completed: true,
            kdsCompletedAt: item.kdsCompletedAt || item.kds_completed_at || item.kitchen_completed_at || timestamp,
            kds_completed_at: item.kds_completed_at || item.kdsCompletedAt || item.kitchen_completed_at || timestamp,
            kitchenCompletedAt: item.kitchenCompletedAt || item.kitchen_completed_at || item.kds_completed_at || timestamp,
            kitchen_completed_at: item.kitchen_completed_at || item.kitchenCompletedAt || item.kds_completed_at || timestamp,
          }))
        : null;
    const extra =
      {
        preparing: { started_at: ticket.started_at || timestamp },
        ready: { ready_at: timestamp },
        completed: { completed_at: timestamp, ...(completedItems ? { items: completedItems } : {}) },
        voided: { voided_at: timestamp },
        rejected: { voided_at: timestamp },
      }[status] || {};

    const { error } = await supabase.from("kds_tickets").update({ status, ...extra }).eq("id", ticket.id);

    if (error) {
      setAlertMessage(`KDS update failed: ${error.message}`);
      return;
    }

    if (ticket.source_type === "web" && ticket.web_order_id && status !== "completed") {
      const webStatus = status === "preparing" ? "accepted" : status;
      const webExtra =
        {
          rejected: { rejected_at: timestamp },
          voided: { cancelled_at: timestamp },
        }[status] || {};
      if (["rejected", "voided"].includes(status)) {
        await supabase.from("web_orders").update({ status: webStatus, order_status: webStatus, ...webExtra }).eq("id", ticket.web_order_id);
      }
    }

    await fetchTickets({ silent: true });
  };

  const toggleItemReady = async (ticket, itemIndex) => {
    const currentItems = Array.isArray(ticket.items) ? ticket.items : [];
    const timestamp = new Date().toISOString();
    const nextItems = currentItems.map((item, index) => {
      if (index !== itemIndex) return item;
      const nextReady = !isItemReady(item);
      return {
        ...item,
        ready: nextReady,
        kitchenReady: nextReady,
        kitchen_ready: nextReady,
        ready_at: nextReady ? timestamp : null,
        kitchenReadyAt: nextReady ? timestamp : null,
        kitchen_ready_at: nextReady ? timestamp : null,
      };
    });
    const allReady = nextItems.length > 0 && nextItems.every(isItemReady);
    const anyReady = nextItems.some(isItemReady);
    const currentStatus = String(ticket.status || "pending").toLowerCase();
    const nextStatus = allReady ? "ready" : KDS_ACTIVE_STATUSES.includes(currentStatus) ? (anyReady ? "preparing" : currentStatus === "scheduled" ? "scheduled" : "preparing") : currentStatus;
    const extra = {
      ...(ticket.started_at ? {} : { started_at: timestamp }),
      ready_at: allReady ? timestamp : null,
    };

    const { error } = await supabase.from("kds_tickets").update({ items: nextItems, status: nextStatus, ...extra }).eq("id", ticket.id);

    if (error) {
      setAlertMessage(`Item ready update failed: ${error.message}`);
      return;
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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white/90 p-6 text-center shadow-xl backdrop-blur">
          <p className="text-sm font-bold text-red-700">{loadError || "KDS access is not authorized."}</p>
          <button
            type="button"
            onClick={signOutKitchen}
            className="mt-4 rounded-2xl bg-slate-700 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-600"
          >
            Back to KDS Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-2 text-slate-900 sm:p-4">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <header className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-md backdrop-blur sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>              
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Kitchen Order Display</h1>
                           
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showInstallButton && (
                <button
                  type="button"
                  onClick={installKdsPwa}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-300 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-md transition hover:-translate-y-0.5 hover:bg-blue-300"
                >
                  <Download className="h-4 w-4" /> Install KDS
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowAvailabilityPanel(true);
                  loadKitchenAvailabilityItems();
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100"
              >
                <PackageCheck className="h-4 w-4" /> Availability
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHistory((value) => !value);
                  setStatusFilter("all");
                  setSelectedHistoryTicket(null);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-cyan-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100"
              >
                <History className="h-4 w-4" /> {showHistory ? "Live Orders" : "Order History"}
              </button>
              <button
                type="button"
                onClick={() => fetchTickets()}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
              <button
                type="button"
                onClick={() => document.documentElement.requestFullscreen?.()}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-600"
              >
                <Maximize2 className="h-4 w-4" /> Full Screen
              </button>
              <button
                type="button"
                onClick={signOutKitchen}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-[11px] font-bold uppercase tracking-wider text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" /> Sign Out
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

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-16 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" />
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/90 p-16 text-center shadow-sm">
            <Utensils className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-500">{showHistory ? "No order history found." : "No active kitchen orders."}</p>
          </div>
        ) : showHistory ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Order History</p>
              <p className="mt-1 text-sm text-slate-600">Newest completed, voided, and rejected KDS orders first.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100/80 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date / Time</th>
                    <th className="px-4 py-3">Dining</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleTickets.map((ticket) => {
                    const status = String(ticket.status || "completed").toLowerCase();
                    const items = getDisplayItems(ticket);
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => setSelectedHistoryTicket(ticket)}
                        className="cursor-pointer transition hover:bg-cyan-50/70"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                          {ticket.created_at ? formatDateTime(ticket.created_at) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-lg font-bold text-slate-950">{ticket.dining_option || "Kitchen Order"}</td>
                        <td className="px-4 py-3 text-slate-700">{ticket.customer_name || "Walk-in"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{String(ticket.source_type || "").toUpperCase()}</td>
                        <td className="px-4 py-3 text-slate-700">{items.length}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-950">{peso(ticket.total)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-xl border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle(status)}`}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="flex h-[calc(100vh-8.75rem)] min-h-[420px] snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-2 pr-2 scroll-smooth">
            {visibleTickets.map((ticket) => {
              const status = String(ticket.status || "pending").toLowerCase();
              const ticketItems = getDisplayItems(ticket);
              const activeTimestamp = activeTicketTimestamp(ticket, ticketItems);
              const minutes = activeTimestamp ? Math.floor((Date.now() - new Date(activeTimestamp).getTime()) / 60000) : 0;
              const itemLayout = kdsItemLayoutClasses(ticketItems.length);
              const allItemsReady = ticketItems.length > 0 && ticketItems.every((item) => isItemReady(item) || isItemVoided(item));
              const terminalStatus = ["completed", "voided", "rejected"].includes(status);
              const voidedOrder = ["voided", "rejected"].includes(status);
              const ageWarning = !["ready", "voided", "rejected", "completed"].includes(status)
                ? minutes >= 30
                  ? "red"
                  : minutes >= 20
                  ? "yellow"
                  : ""
                : "";

              return (
                <article
                  key={ticket.id}
                  className={`flex h-full shrink-0 snap-start flex-col overflow-hidden rounded-3xl border shadow-lg backdrop-blur transition ${itemLayout.card} ${
                    voidedOrder
                      ? "animate-pulse border-red-500 bg-red-50/95 shadow-red-200"
                      : ageWarning === "red"
                      ? "border-red-400 bg-red-50/95 shadow-red-200"
                      : ageWarning === "yellow"
                      ? "border-amber-300 bg-amber-50/95 shadow-amber-100"
                      : "border-slate-200 bg-white/95"
                    }`}
                >
                  <div className={`shrink-0 border-b p-4 ${
                    voidedOrder
                      ? "border-red-200 bg-red-100/80"
                      : ageWarning === "red"
                      ? "border-red-200 bg-red-100/80"
                      : ageWarning === "yellow"
                      ? "border-amber-200 bg-amber-100/80"
                      : "border-slate-200 bg-slate-50/80"
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-slate-950">{ticket.dining_option || "Kitchen Order"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {ticket.customer_name || "Walk-in"} - {activeTimestamp ? getTimeAgo(activeTimestamp) : "Just now"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-xl border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle(status)}`}>{status}</span>
                        {ticket.source_type === "web" && status === "scheduled" && scheduleLabel(ticket) && (
                          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                            {scheduleTitle(ticket)}: {scheduleLabel(ticket)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1">{String(ticket.source_type || "").toUpperCase()}</span>
                      <span className="rounded-full bg-white px-3 py-1">
                        <Clock3 className="mr-1 inline h-3 w-3" /> {activeTimestamp ? formatDateTime(activeTimestamp) : ""}
                      </span>
                    </div>
                  </div>

                  <div className={`grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start items-start gap-3 overflow-y-auto overflow-x-hidden p-3 pb-4 ${itemLayout.items}`}>
                    {ticketItems.map((item, idx) => {
                      const ready = isItemReady(item);
                      const voidedItem = isItemVoided(item) || voidedOrder;
                      const showReadyStrike = ready && !showHistory && status !== "completed" && !voidedItem;
                      const canToggleReady = !terminalStatus && !voidedItem;
                      return (
                        <button
                          type="button"
                          key={item.id || idx}
                          onClick={() => canToggleReady && toggleItemReady(ticket, item.__kdsIndex ?? idx)}
                          disabled={!canToggleReady}
                          className={`relative h-auto min-h-fit w-full break-inside-avoid rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed ${
                            voidedItem
                              ? "animate-pulse border-red-400 bg-red-50 shadow-sm shadow-red-100"
                              : ready
                              ? "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50"
                              : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-md"
                          }`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className={voidedItem ? "text-red-800 line-through decoration-2" : showReadyStrike ? "text-slate-500 line-through decoration-2" : "text-slate-900"}>
                              <p className="break-words text-[18px] font-bold leading-snug">
                                {item.quantity || 1} x {item.name}
                              </p>
                              {itemOptionRows(item).map((row) => (
                                <p key={`${row.group}-${row.values}`} className="break-words text-[17px] font-normal italic leading-snug">
                                  {row.values}
                                </p>
                              ))}
                            </div>
                            {voidedItem ? (
                              <span className="h-9 rounded-xl border border-red-300 bg-red-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-800">
                                Voided
                              </span>
                            ) : null}
                          </div>
                          {item.instructions && <p className="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-[14px] font-bold text-cyan-900">Note: {item.instructions}</p>}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2">
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
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-200 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
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

      {showAvailabilityPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onClick={() => setShowAvailabilityPanel(false)}
        >
          <section
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">Kitchen Availability</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Menu items</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Kitchen printer group items only. Changes apply to this store and appear in POS and customer ordering.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadKitchenAvailabilityItems()}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
                >
                  <RefreshCcw className="h-4 w-4" /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowAvailabilityPanel(false)}
                  className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close availability panel"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200 bg-white px-5 py-3">
              <input
                value={availabilitySearch}
                onChange={(event) => setAvailabilitySearch(event.target.value)}
                placeholder="Search kitchen items..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {availabilityLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" />
                  <p className="mt-3 text-sm font-bold text-slate-500">Loading kitchen items...</p>
                </div>
              ) : filteredAvailabilityItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <Utensils className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-3 text-sm font-bold text-slate-500">
                    No Kitchen printer group items found for this store.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAvailabilityItems.map((item) => {
                    const available = item.is_available !== false;
                    const saving = availabilitySavingId === String(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleKitchenItemAvailability(item)}
                        disabled={saving}
                        className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 ${
                          available
                            ? "border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100"
                            : "border-red-200 bg-red-50/90 hover:bg-red-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-base font-bold text-slate-950">{item.name}</p>
                            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {item.category || "Kitchen"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                              available ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {saving ? "Saving" : available ? "Available" : "Unavailable"}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-white/70 pt-3">
                          <span className="text-xs font-semibold text-slate-600">
                            Tap to mark {available ? "unavailable" : "available"}
                          </span>
                          <span
                            className={`h-6 w-11 rounded-full p-1 transition ${
                              available ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`block h-4 w-4 rounded-full bg-white shadow transition ${
                                available ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedHistoryTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setSelectedHistoryTicket(null)}>
          <section
            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">Order Details</p>
                <h2 className="mt-1 text-3xl font-bold text-slate-950">{selectedHistoryTicket.dining_option || "Kitchen Order"}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {selectedHistoryTicket.customer_name || "Walk-in"} - {selectedHistoryTicket.created_at ? formatDateTime(selectedHistoryTicket.created_at) : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryTicket(null)}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                aria-label="Close order details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Source</p>
                  <p className="mt-1 font-bold text-slate-950">{String(selectedHistoryTicket.source_type || "").toUpperCase()}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</p>
                  <span className={`mt-1 inline-flex rounded-xl border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle(selectedHistoryTicket.status)}`}>
                    {selectedHistoryTicket.status}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total</p>
                  <p className="mt-1 font-bold text-slate-950">{peso(selectedHistoryTicket.total)}</p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {getDisplayItems(selectedHistoryTicket).map((item, idx) => {
                  const voidedItem = isItemVoided(item) || ["voided", "rejected"].includes(String(selectedHistoryTicket.status || "").toLowerCase());
                  return (
                    <div key={item.id || idx} className={`rounded-2xl border p-4 ${voidedItem ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className={voidedItem ? "text-red-800 line-through decoration-2" : ""}>
                          <p className={`text-lg font-bold ${voidedItem ? "text-red-800" : "text-slate-950"}`}>
                            {item.quantity || 1} x {item.name}
                          </p>
                          {itemOptionRows(item).map((row) => (
                            <p key={`${row.group}-${row.values}`} className={`mt-1 text-[12px] font-semibold ${voidedItem ? "text-red-700" : "text-slate-700"}`}>
                              {row.values}
                            </p>
                          ))}
                          {item.instructions && <p className="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-[12px] font-bold text-cyan-900">Note: {item.instructions}</p>}
                        </div>
                        {voidedItem ? (
                          <span className="rounded-xl border border-red-300 bg-red-100 px-3 py-1 text-[11px] font-bold uppercase text-red-700">Voided</span>
                        ) : isItemReady(item) ? (
                          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase text-emerald-700">Ready</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
