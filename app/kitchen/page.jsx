"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, Maximize2, Printer, RefreshCcw, Utensils } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";
import { KDS_VISIBLE_STATUSES } from "@/lib/kds";

const supabase = getSupabaseClient();
const ALERT_SOUND_SRC = "/sound/notification.mp3";
const peso = (n) => `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export default function KitchenDisplay() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertMessage, setAlertMessage] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const knownTicketIds = useRef(new Set());
  const audioRef = useRef(null);

  const visibleTickets = useMemo(() => {
    const rows = tickets.filter((ticket) => KDS_VISIBLE_STATUSES.includes(String(ticket.status || "").toLowerCase()));
    if (statusFilter === "all") return rows;
    return rows.filter((ticket) => String(ticket.status || "").toLowerCase() === statusFilter);
  }, [tickets, statusFilter]);

  const stats = useMemo(() => ({
    all: tickets.length,
    pending: tickets.filter((ticket) => String(ticket.status).toLowerCase() === "pending").length,
    preparing: tickets.filter((ticket) => String(ticket.status).toLowerCase() === "preparing").length,
    ready: tickets.filter((ticket) => String(ticket.status).toLowerCase() === "ready").length,
  }), [tickets]);

  const playAlert = () => {
    const audio = audioRef.current || new Audio(ALERT_SOUND_SRC);
    audioRef.current = audio;
    audio.currentTime = 0;
    audio.volume = 0.95;
    audio.play().catch(() => {});
  };

  const showNewTicketAlert = (ticket) => {
    const label = ticket?.ticket_number || ticket?.receipt_number || String(ticket?.id || "").slice(0, 8).toUpperCase();
    setAlertMessage(`New kitchen order ${label}`);
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
      .in("status", KDS_VISIBLE_STATUSES)
      .order("created_at", { ascending: true })
      .limit(150);

    if (!error) {
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
    fetchTickets();

    const channel = supabase
      .channel("kds-tickets-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kds_tickets" },
        (payload) => {
          if (payload.eventType === "INSERT") showNewTicketAlert(payload.new);
          fetchTickets({ silent: true });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const enableAlerts = async () => {
    const audio = new Audio(ALERT_SOUND_SRC);
    audio.volume = 0.01;
    await audio.play().catch(() => {});
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.95;
    audioRef.current = audio;
    setSoundEnabled(true);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const updateTicketStatus = async (ticket, status) => {
    const timestamp = new Date().toISOString();
    const extra = {
      preparing: { started_at: timestamp },
      ready: { ready_at: timestamp },
      completed: { completed_at: timestamp },
      voided: { voided_at: timestamp },
      rejected: { voided_at: timestamp },
    }[status] || {};

    const { error } = await supabase
      .from("kds_tickets")
      .update({ status, ...extra })
      .eq("id", ticket.id);

    if (error) {
      setAlertMessage(`KDS update failed: ${error.message}`);
      return;
    }

    if (ticket.source_type === "web" && ticket.web_order_id) {
      const webStatus = status === "preparing" ? "accepted" : status;
      const webExtra = {
        ready: { ready_at: timestamp },
        completed: { completed_at: timestamp, payment_status: "paid" },
        rejected: { rejected_at: timestamp },
        voided: { cancelled_at: timestamp },
      }[status] || {};
      await supabase
        .from("web_orders")
        .update({ status: webStatus, order_status: webStatus, ...webExtra })
        .eq("id", ticket.web_order_id);
    }

    await fetchTickets({ silent: true });
  };

  const getTimeAgo = (date) => {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)} hr ago`;
  };

  const printKitchenTicket = (ticket) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const safeItems = Array.isArray(ticket.items) ? ticket.items : [];

    win.document.write(`
      <html>
        <head>
          <title>KDS Ticket</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #172033; }
            h2 { text-align:center; margin-bottom: 6px; }
            .meta { font-size: 12px; margin: 4px 0; }
            .item { padding: 8px 0; border-bottom: 1px solid #d8e1ea; }
            .note { font-size: 12px; color: #0f7a8a; }
          </style>
        </head>
        <body>
          <h2>KITCHEN ORDER</h2>
          <p class="meta"><b>Ticket:</b> ${ticket.ticket_number || ticket.receipt_number || String(ticket.id).slice(0, 8).toUpperCase()}</p>
          <p class="meta"><b>Source:</b> ${String(ticket.source_type || "").toUpperCase()}</p>
          <p class="meta"><b>Customer:</b> ${ticket.customer_name || "Walk-in"}</p>
          <p class="meta"><b>Dining:</b> ${ticket.dining_option || "-"}</p>
          <p class="meta"><b>Time:</b> ${ticket.created_at ? formatDateTime(ticket.created_at) : ""}</p>
          <hr/>
          ${safeItems.map((item) => `
            <div class="item">
              <b>${item.quantity || 1} x ${item.name}</b>
              ${itemOptionsText(item) ? `<br/><span>${itemOptionsText(item)}</span>` : ""}
              ${item.instructions ? `<br/><span class="note">Note: ${item.instructions}</span>` : ""}
            </div>
          `).join("")}
          <hr/>
          <p><b>Total:</b> ${peso(ticket.total)}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
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
              <button type="button" onClick={enableAlerts} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-bold uppercase tracking-wider text-cyan-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100">
                <Bell className="h-4 w-4" /> {soundEnabled ? "Alerts On" : "Enable Alerts"}
              </button>
              <button type="button" onClick={() => fetchTickets()} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50">
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
              <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-700 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-600">
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

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["all", "All", stats.all],
            ["pending", "New", stats.pending],
            ["preparing", "Preparing", stats.preparing],
            ["ready", "Ready", stats.ready],
          ].map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
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
            <p className="mt-3 text-sm font-bold text-slate-500">No active kitchen orders.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleTickets.map((ticket) => {
              const status = String(ticket.status || "pending").toLowerCase();
              const minutes = ticket.created_at ? Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60000) : 0;
              const ticketItems = Array.isArray(ticket.items) ? ticket.items : [];

              return (
                <article key={ticket.id} className={`overflow-hidden rounded-3xl border bg-white/95 shadow-lg backdrop-blur ${minutes > 15 && !["ready", "voided", "rejected"].includes(status) ? "border-amber-300" : "border-slate-200"}`}>
                  <div className="border-b border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-lg font-bold text-slate-950">#{ticket.ticket_number || ticket.receipt_number || String(ticket.id).slice(0, 8).toUpperCase()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{ticket.customer_name || "Walk-in"} · {getTimeAgo(ticket.created_at)}</p>
                      </div>
                      <span className={`rounded-xl border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle(status)}`}>{status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1">{String(ticket.source_type || "").toUpperCase()}</span>
                      <span className="rounded-full bg-white px-3 py-1">{ticket.dining_option || "Order"}</span>
                      <span className="rounded-full bg-white px-3 py-1"><Clock3 className="mr-1 inline h-3 w-3" /> {ticket.created_at ? formatDateTime(ticket.created_at) : ""}</span>
                    </div>
                  </div>

                  <div className="space-y-2 p-4">
                    {ticketItems.map((item, idx) => (
                      <div key={item.id || idx} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-base font-bold text-slate-900">{item.quantity || 1} x {item.name}</p>
                          <p className="text-xs font-bold text-slate-500">{peso(Number(item.unitPrice || 0) * Number(item.quantity || 1))}</p>
                        </div>
                        {itemOptionsText(item) && <p className="mt-1 text-sm font-semibold text-slate-600">{itemOptionsText(item)}</p>}
                        {item.instructions && <p className="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-900">Note: {item.instructions}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
                    <span>Total</span>
                    <span>{peso(ticket.total)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-4">
                    <button onClick={() => printKitchenTicket(ticket)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-800 transition hover:bg-slate-100">
                      <Printer className="h-4 w-4" /> Print
                    </button>
                    <button onClick={() => updateTicketStatus(ticket, "preparing")} disabled={["preparing", "ready", "completed", "voided", "rejected"].includes(status)} className="h-11 rounded-2xl bg-sky-600 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-sky-500 disabled:bg-slate-200 disabled:text-slate-500">
                      Start
                    </button>
                    <button onClick={() => updateTicketStatus(ticket, "ready")} disabled={["ready", "completed", "voided", "rejected"].includes(status)} className="h-11 rounded-2xl bg-emerald-600 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-500">
                      Ready
                    </button>
                    <button onClick={() => updateTicketStatus(ticket, "completed")} disabled={["completed", "voided", "rejected"].includes(status)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-700 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-600 disabled:bg-slate-200 disabled:text-slate-500">
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
