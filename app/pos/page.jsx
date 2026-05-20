"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/* =========================================================
   UI: Modal Shell (consistent design)
========================================================= */
function ModalShell({ open, onClose, title, subtitle, children, z = 120 }) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-[${z}] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">{title}</p>
            {subtitle ? (
              <h3 className="text-lg font-semibold text-slate-800 mt-1 truncate">{subtitle}</h3>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* =========================================================
   UI: Toast
========================================================= */
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const tone =
    toast.type === "success"
      ? "bg-green-600"
      : toast.type === "error"
      ? "bg-red-600"
      : toast.type === "warn"
      ? "bg-orange-600"
      : "bg-slate-900";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] px-4">
      <div className={`${tone} text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 max-w-[520px]`}>
        <div className="text-sm leading-snug">
          <div className="font-semibold">{toast.title || "Notice"}</div>
          {toast.message ? <div className="text-white/90 mt-0.5">{toast.message}</div> : null}
        </div>
        <button
          onClick={onClose}
          className="ml-auto w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"
          aria-label="Close toast"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   UI: Confirm Modal
========================================================= */
function ConfirmModal({ open, title, message, confirmText = "Confirm", cancelText = "Cancel", onConfirm, onCancel }) {
  return (
    <ModalShell open={open} onClose={onCancel} title="Confirmation" subtitle={title} z={140}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold active:scale-95"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          className="w-full py-3 rounded-2xl bg-[#FC687D] text-white text-xs font-bold active:scale-95"
        >
          {confirmText}
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   UI: Category Modal (popup selector)
========================================================= */
function CategoryModal({ open, onClose, categories, active, onSelect }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Category" subtitle="Select Category" z={140}>
      <div className="space-y-2">
        {(categories || []).map((cat) => {
          const isActive = active === cat.name;
          return (
            <button
              key={cat.id}
              onClick={() => {
                onSelect(cat.name);
                onClose();
              }}
              className={`w-full text-left p-4 rounded-2xl border transition ${
                isActive
                  ? "border-rose-200 bg-rose-50"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800">{cat.name}</p>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}

/* =========================================================
   Barcode Scanner Modal (Camera)
========================================================= */
function BarcodeScannerModal({ open, onClose, onResult }) {
  const [step, setStep] = useState("intro"); // intro | scanning
  const [errMsg, setErrMsg] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const seen = typeof window !== "undefined" && localStorage.getItem("pos_scanner_seen") === "1";
    setStep(seen ? "scanning" : "intro");
    setErrMsg("");
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function startScanner() {
    setErrMsg("");
    try {
      if (typeof window !== "undefined") localStorage.setItem("pos_scanner_seen", "1");
      const mod = await import("html5-qrcode");
      const { Html5QrcodeScanner } = mod;

      setStep("scanning");
      setTimeout(() => {
        const el = document.getElementById("pos-scan-area");
        if (!el) return;
        el.innerHTML = "";

        const scanner = new Html5QrcodeScanner(
          "pos-scan-area",
          { fps: 10, qrbox: { width: 260, height: 260 } },
          false
        );

        scanner.render(
          (decodedText) => {
            stopScanner();
            onResult(decodedText);
            onClose();
          },
          () => {}
        );

        scannerRef.current = scanner;
      }, 50);
    } catch (e) {
      setErrMsg(e?.message || "Unable to start camera scanner.");
    }
  }

  function stopScanner() {
    const s = scannerRef.current;
    scannerRef.current = null;
    try {
      if (s?.clear) s.clear();
    } catch {}
    const el = typeof window !== "undefined" ? document.getElementById("pos-scan-area") : null;
    if (el) el.innerHTML = "";
  }

  return (
    <ModalShell open={open} onClose={() => { stopScanner(); onClose(); }} title="Barcode Scanner" subtitle="Scan code" z={145}>
      <p className="text-xs text-slate-500">
        Scan customer code or item SKU. Camera permission will be requested.
      </p>

      {step === "intro" && (
        <div className="mt-4 border border-slate-200 rounded-2xl p-4 bg-slate-50">
          <p className="text-sm font-semibold text-slate-800">Permission</p>
          <p className="text-sm text-slate-600 mt-2">
            Tap <b>Start Scanner</b>. Your browser will ask for camera access — please allow.
          </p>

          <button
            onClick={startScanner}
            className="w-full mt-4 py-3 rounded-2xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95"
          >
            Start Scanner
          </button>
        </div>
      )}

      {step === "scanning" && (
        <div className="mt-4">
          {errMsg && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl p-3">
              {errMsg}
            </div>
          )}

          <div id="pos-scan-area" className="rounded-2xl overflow-hidden border border-slate-200" />

          <button
            onClick={() => { stopScanner(); onClose(); }}
            className="w-full mt-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
          >
            Stop
          </button>
        </div>
      )}
    </ModalShell>
  );
}

/* =========================================================
   Saved Tickets Modal
========================================================= */
function SavedTicketsModal({ open, onClose, tickets, onSelect, onRefresh, mode = "resume" }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Saved Tickets"
      subtitle={mode === "move" ? "Move Items" : "Resume"}
      z={145}
    >
      <div className="flex gap-2 mb-3">
        <button
          onClick={onRefresh}
          className="px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 active:scale-95"
        >
          ↻ Refresh
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 text-sm">
          No saved tickets.
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {t.order_type || t.ticket_name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    Customer: {t._customerName || "Walk-in"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Items: {(t.items || []).length} • Total: ₱{Number(t.total_amount || 0).toFixed(0)}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-slate-400">
                  {mode === "move" ? "Move" : "Resume"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full mt-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
      >
        Close
      </button>
    </ModalShell>
  );
}

/* =========================================================
   Choose Order Type Modal (Move -> New Ticket)
========================================================= */
function OrderTypeModal({ open, onClose, options, onPick }) {
  return (
    <ModalShell open={open} onClose={onClose} title="New Ticket" subtitle="Select Order Type" z={145}>
      <div className="space-y-2">
        {(options || []).map((opt) => (
          <button
            key={opt.id}
            onClick={() => onPick(opt.name)}
            className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <p className="text-sm font-semibold text-slate-800">{opt.name}</p>
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full mt-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
      >
        Close
      </button>
    </ModalShell>
  );
}

/* =========================================================
   Vouchers Modal (clean sheet UI)
========================================================= */
function VouchersModal({ open, onClose, vouchers, appliedVoucher, selectedCartItem, onApply, onRemove }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Vouchers" subtitle="Apply Voucher" z={145}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          Target item:{" "}
          <span className="font-semibold text-slate-800">
            {selectedCartItem ? selectedCartItem.name : "None (tap an item first)"}
          </span>
        </p>
      </div>

      {appliedVoucher && (
        <div className="mt-3 p-4 rounded-2xl border border-rose-200 bg-rose-50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Applied</p>
          <p className="text-sm font-semibold text-slate-800 mt-1">{appliedVoucher.code}</p>
          <button
            onClick={onRemove}
            className="mt-3 w-full py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold active:scale-95"
          >
            Remove Voucher
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {vouchers.length === 0 ? (
          <div className="p-4 rounded-2xl border border-slate-200 bg-white text-slate-500 text-sm">
            No active vouchers.
          </div>
        ) : (
          vouchers.map((v) => {
            const disabled = !selectedCartItem;
            return (
              <button
                key={v.id}
                disabled={disabled}
                onClick={() => onApply(v)}
                className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-slate-800">{v.code}</p>
                <p className="text-xs text-slate-500 mt-1">{v.reward_text}</p>
                <p className="text-[11px] text-slate-400 mt-2">
                  {v.reward_type === "birthday" ? "🎂 Birthday" : "🎁 Reward"}
                  {v.expires_at ? ` • Expires ${new Date(v.expires_at).toLocaleString()}` : ""}
                </p>
              </button>
            );
          })
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full mt-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
      >
        Close
      </button>
    </ModalShell>
  );
}

/* =========================================================
   Add To Cart Modal (keeps your logic; sheet UI)
========================================================= */
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");
  const [collapsed, setCollapsed] = useState({});
  

  useEffect(() => {
    if (!item) return;
    const source = item.editData || item;

    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");

    const selected = {};
    if (source.variantDetails && item.variants) {
      source.variantDetails.split(", ").forEach((name) => {
        item.variants.forEach((g) => {
          const match = (g.options || []).find((o) => o.name === name);
          if (match) {
            selected[g.id] = selected[g.id] || [];
            selected[g.id].push(match);
          }
        });
      });
    }
    setSelections(selected);

    const c = {};
    (item.variants || []).forEach((g) => (c[g.id] = false));
    setCollapsed(c);
  }, [item]);

  if (!item) return null;

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find((o) => o.id === opt.id);
      setSelections({
        ...selections,
        [group.id]: exists ? current.filter((o) => o.id !== opt.id) : [...current, opt],
      });
    }
  };

  const variantPrice = Object.values(selections)
    .flat()
    .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

  const basePrice = Number(item.price) || 0;
  const unitPrice = basePrice + variantPrice;

  const canAdd = (item.variants || []).every(
    (g) => !g.isRequired || (selections[g.id] || []).length > 0
  );

  const variantDetails = Object.values(selections)
    .flat()
    .map((o) => o.name)
    .join(", ");

  const totalLine = (unitPrice * quantity).toFixed(0);

  return (
    <ModalShell
      open={!!item}
      onClose={onClose}
      title={item.editData ? "Edit Item" : "Add to Ticket"}
      subtitle={item.name}
      z={145}
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          Base ₱{basePrice.toFixed(0)}
          {variantPrice > 0 ? ` • +₱${variantPrice.toFixed(0)} variants` : ""}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500 transition"
        >
          −
        </button>
        <div className="flex-1 text-center font-bold text-slate-800">{quantity}</div>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500 transition"
        >
          +
        </button>
      </div>

      {Array.isArray(item.variants) && item.variants.length > 0 && (
        <div className="mt-4 space-y-4">
          {item.variants.map((g) => {
            const isCollapsed = !!collapsed[g.id];
            const selectedCount = (selections[g.id] || []).length;

            return (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {g.isMultiSelect ? "Multi-select" : "Single-select"}
                      {selectedCount > 0 ? ` • Selected: ${selectedCount}` : ""}
                    </p>
                  </div>

                  {!g.isRequired && (
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [g.id]: !p[g.id] }))}
                      className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-2xl border border-slate-200 text-slate-600 bg-white active:scale-95"
                    >
                      {isCollapsed ? "Show" : "Hide"}
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="space-y-2">
                    {(g.options || []).map((o) => {
                      const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(g, o)}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl border text-sm transition-all ${
                            sel ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-medium text-slate-800">{o.name}</span>
                          <span className="text-slate-500 text-xs">
                            {Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
          Special Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Add specific notes..."
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none h-20 resize-none"
        />
      </div>

      <button
        disabled={!canAdd}
        onClick={() =>
          onAddToCart({
            id: item.id,
            name: item.name,
            unitPrice,
            quantity,
            variantDetails,
            instructions,
            cartItemId: item.editData?.cartItemId || Date.now(),
          })
        }
        className="w-full mt-4 py-3 rounded-2xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
      >
        {item.editData ? `Save • ₱${totalLine}` : `Add • ₱${totalLine}`}
      </button>
    </ModalShell>
  );
}

/* =========================================================
   Ticket Panel (CLEAN UI)
========================================================= */
function TicketPanel({
  cart,
  customers,
  customerSearch,
  setCustomerSearch,
  isCustListOpen,
  setIsCustListOpen,
  onSearchKeyDown,
  handleCodeInput,
  onOpenScanner,
  orderType,
  setOrderType,
  diningOptions,
  subtotal,
  appliedVoucher,
  onOpenVouchers,
  onRemoveVoucher,
  onClear,
  onCharge,
  onSave,
  charging,
  savingTicket,
  voucherTargetCartItemId,
  splitMode,
  splitSelected,
  onToggleSplit,
  onMoveToNewTicket,
  onMoveToSaved,
  moving,
  onCartItemClick,
  onCloseMobile,
  ticketTitle,
  ticketSubtitle,
}) {
  return (
    <div className="h-full flex flex-col">
      {/* Header card */}
      <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/60">Order</p>
            <h3 className="text-lg font-extrabold text-white truncate">{ticketTitle}</h3>
            <p className="text-sm text-white/70 mt-1 truncate">{ticketSubtitle}</p>
            {appliedVoucher?.code && (
              <p className="text-[11px] text-rose-200 mt-2 font-mono">
                🎟 Voucher: {appliedVoucher.code}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white"
                title="Close"
              >
                ↩
              </button>
            )}
            <button
              onClick={onClear}
              className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white"
              title="Clear ticket"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search / Scan */}
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              id="scan-in"
              value={customerSearch}
              onFocus={() => setIsCustListOpen(true)}
              onChange={(e) => setCustomerSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Scan / type code or name..."
              className="flex-1 px-3 py-2 bg-white rounded-2xl text-slate-900 text-sm outline-none"
            />
            <button
              type="button"
              onClick={onOpenScanner}
              className="w-11 h-10 rounded-2xl bg-[#FC687D] text-white flex items-center justify-center active:scale-95"
              title="Open camera scanner"
            >
              📷
            </button>
          </div>

          {isCustListOpen && customerSearch.length > 0 && (
            <div className="mt-2 bg-white rounded-2xl overflow-hidden border border-slate-200">
              {customers
                .filter((c) => (c.name || "").toLowerCase().includes(customerSearch.toLowerCase()))
                .slice(0, 8)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      handleCodeInput(c.code || c.name);
                      setIsCustListOpen(false);
                      setCustomerSearch("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-rose-50 text-xs text-slate-800"
                  >
                    {c.name} <span className="text-slate-400 font-mono">({c.code})</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenVouchers}
            className="py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-[10px] font-bold uppercase tracking-widest text-white active:scale-95"
          >
            🎟 Vouchers
          </button>
          <button
            disabled={!appliedVoucher}
            onClick={onRemoveVoucher}
            className="py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50 active:scale-95"
          >
            Remove
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onToggleSplit}
            className={`py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest active:scale-95 ${
              splitMode ? "bg-blue-600 text-white" : "bg-white/10 hover:bg-white/15 text-white"
            }`}
          >
            {splitMode ? "Split: ON" : "Split"}
          </button>
          <button
            disabled={!splitMode || splitSelected.length === 0 || moving}
            onClick={onMoveToSaved}
            className="py-2.5 rounded-2xl bg-purple-600 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 active:scale-95"
          >
            Move → Saved
          </button>
        </div>
        <button
          disabled={!splitMode || splitSelected.length === 0 || moving}
          onClick={onMoveToNewTicket}
          className="mt-2 w-full py-2.5 rounded-2xl bg-orange-600 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 active:scale-95"
        >
          Move → New Order Type
        </button>

        {/* Order type */}
        <div className="mt-4">
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            className="w-full appearance-none bg-white rounded-2xl px-4 py-3 outline-none text-slate-900 text-sm font-bold"
          >
            <option value="">Select Order Type</option>
            {diningOptions.map((opt) => (
              <option key={opt.id} value={opt.name}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cart list */}
      <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
        {cart.length === 0 ? (
          <div className="text-center py-10 text-white/70 border border-white/10 rounded-3xl bg-white/5">
            Empty Ticket
          </div>
        ) : (
          cart.map((line, idx) => {
            const selected = line.cartItemId === voucherTargetCartItemId;
            const hasVoucher = !!line.appliedVoucher?.code;
            const splitSel = splitSelected.includes(line.cartItemId);

            const borderTone = splitMode
              ? splitSel
                ? "border-blue-300"
                : "border-white/10"
              : selected
              ? "border-rose-300"
              : "border-white/10";

            const bgTone = splitMode
              ? splitSel
                ? "bg-blue-50/15"
                : "bg-white/5 hover:bg-white/10"
              : selected
              ? "bg-rose-50/10"
              : "bg-white/5 hover:bg-white/10";

            return (
              <button
                key={line.cartItemId}
                type="button"
                onClick={() => onCartItemClick(line, idx)}
                className={`w-full text-left p-4 rounded-3xl border ${borderTone} ${bgTone} transition`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {line.name} <span className="text-white/60">×{line.quantity}</span>
                    </p>

                    {line.variantDetails ? (
                      <p className="text-[11px] text-white/70 mt-1">{line.variantDetails}</p>
                    ) : null}

                    {line.instructions ? (
                      <p className="text-[11px] text-white/60 mt-1">Note: {line.instructions}</p>
                    ) : null}

                    {hasVoucher && (
                      <p className="text-[11px] mt-2 text-rose-200 font-mono">
                        🎟 {line.appliedVoucher.code} (100% OFF)
                      </p>
                    )}

                    {splitMode && (
                      <p className="text-[11px] mt-2 text-blue-200 font-mono">
                        {splitSel ? "☑ selected" : "☐ tap to select"}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    {hasVoucher && typeof line._origUnitPrice === "number" ? (
                      <>
                        <p className="text-[11px] text-white/60 line-through">
                          ₱{(line._origUnitPrice * line.quantity).toFixed(0)}
                        </p>
                        <p className="text-sm font-extrabold text-white">₱0</p>
                      </>
                    ) : (
                      <p className="text-sm font-extrabold text-white">
                        ₱{(line.unitPrice * line.quantity).toFixed(0)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer total */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-white/60">Total</p>
          <p className="text-2xl font-extrabold text-white">₱{subtotal.toFixed(0)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={onSave}
            disabled={savingTicket}
            className="py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
          >
            {savingTicket ? "Saving…" : "Save Ticket"}
          </button>

          <button
            onClick={onCharge}
            disabled={charging}
            className="py-3 rounded-2xl bg-[#FC687D] text-white text-[10px] font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
          >
            {charging ? "Charging…" : "Charge Order"}
          </button>
        </div>

        <p className="text-[10px] text-white/50 mt-3">
          Normal: tap item to edit & set voucher target • Split: tap items to select and move
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN POS PAGE (logic kept; UI updated)
========================================================= */
export default function POSPage() {
  const supabase = createBrowserClient();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  // category popup
  const [activeCategory, setActiveCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);

  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [orderType, setOrderType] = useState("");

  // vouchers
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [availableVouchers, setAvailableVouchers] = useState([]);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherTargetCartItemId, setVoucherTargetCartItemId] = useState(null);

  // mobile drawer
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);

  // scanner
  const [scannerOpen, setScannerOpen] = useState(false);

  // saved tickets
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedTickets, setSavedTickets] = useState([]);
  const [savedMode, setSavedMode] = useState("resume"); // resume | move

  // split/move
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState([]);
  const [orderTypePickOpen, setOrderTypePickOpen] = useState(false);

  // UI
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // actions
  const [charging, setCharging] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [moving, setMoving] = useState(false);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = "/login";
      else fetchData();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcTotal = (lines) =>
    (lines || []).reduce(
      (sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0),
      0
    );

  async function fetchData() {
    setLoading(true);

    const [iRes, catRes, cRes, diningRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
      supabase.from("menu_categories").select("*").order("name", { ascending: true }),
      supabase.from("loyalty_members").select("id, name:customer_name, code:customer_code"),
      supabase.from("dining_options").select("*").eq("is_available", true).order("id"),
    ]);

    const cats = catRes.data || [];
    setItems(iRes.data || []);
    setCategories(cats);
    setCustomers(cRes.data || []);
    setDiningOptions(diningRes.data || []);

    if (cats.length && !activeCategory) setActiveCategory(cats[0].name);

    setLoading(false);
  }

  const subtotal = useMemo(() => calcTotal(cart), [cart]);
  const itemCount = useMemo(
    () => cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    [cart]
  );

  useEffect(() => {
    if (!ticketDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [ticketDrawerOpen]);

  // vouchers on customer attach
  useEffect(() => {
    if (!attachedCustomer?.id) return;
    (async () => {
      const v = await fetchActiveVouchers(attachedCustomer.id);
      if (v.length > 0) setVoucherModalOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedCustomer?.id]);

  async function fetchActiveVouchers(memberId) {
    const now = Date.now();

    let res = await supabase
      .from("vouchers")
      .select("id, code, reward_text, expires_at, status, reward_type, member_id")
      .eq("member_id", memberId)
      .order("issued_at", { ascending: false });

    if (res.error && /reward_type/i.test(res.error.message || "")) {
      res = await supabase
        .from("vouchers")
        .select("id, code, reward_text, expires_at, status, member_id")
        .eq("member_id", memberId)
        .order("issued_at", { ascending: false });
    }

    const rows = !res.error && res.data ? res.data : [];
    const normalized = rows
      .map((x) => ({
        ...x,
        reward_type:
          x.reward_type ||
          (String(x.code || "").toUpperCase().startsWith("BDAY") ? "birthday" : "reward"),
      }))
      .filter((x) => String(x.status || "active").toLowerCase() === "active")
      .filter((x) => {
        if (!x.expires_at) return true;
        const expMs = new Date(x.expires_at).getTime();
        return !isNaN(expMs) && expMs > now;
      });

    setAvailableVouchers(normalized);
    return normalized;
  }

  const handleCodeInput = (raw) => {
    const q = String(raw || "").trim().toLowerCase();
    if (!q) return;

    const matchItem = items.find((i) => i.sku?.toLowerCase() === q || i.name?.toLowerCase() === q);
    if (matchItem) {
      setSelectedItemForModal(matchItem);
      setCustomerSearch("");
      return;
    }

    const matchCust = customers.find((c) => c.code?.toLowerCase() === q || c.name?.toLowerCase().includes(q));
    if (matchCust) {
      setAttachedCustomer(matchCust);
      setCustomerSearch("");
      setIsCustListOpen(false);
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCodeInput(customerSearch);
    }
  };

  const applyVoucherToTicket = (voucher) => {
    if (!voucherTargetCartItemId) {
      showToast("info", "Select Item", "Tap a ticket item first to set voucher target.");
      return;
    }

    setAppliedVoucher({ ...voucher, applied_to_cartItemId: voucherTargetCartItemId });

    setCart((prev) =>
      prev.map((line) => {
        const cleared = { ...line };

        if (cleared.appliedVoucher) {
          if (typeof cleared._origUnitPrice === "number") cleared.unitPrice = cleared._origUnitPrice;
          delete cleared._origUnitPrice;
          delete cleared.appliedVoucher;
        }

        if (line.cartItemId === voucherTargetCartItemId) {
          const orig = typeof line.unitPrice === "number" ? line.unitPrice : 0;
          cleared._origUnitPrice = orig;
          cleared.unitPrice = 0;
          cleared.appliedVoucher = { id: voucher.id, code: voucher.code, reward_text: voucher.reward_text };
        }

        return cleared;
      })
    );

    showToast("success", "Voucher Applied", `${voucher.code} applied (100% OFF).`);
  };

  const removeAppliedVoucher = () => {
    setAppliedVoucher(null);
    setCart((prev) =>
      prev.map((line) => {
        const x = { ...line };
        if (x.appliedVoucher) {
          if (typeof x._origUnitPrice === "number") x.unitPrice = x._origUnitPrice;
          delete x._origUnitPrice;
          delete x.appliedVoucher;
        }
        return x;
      })
    );
    showToast("info", "Voucher Removed", "Voucher discount removed.");
  };

  const onAddToCart = (line) => {
    setCart((prev) => {
      const editIndex = selectedItemForModal?.editIndex;
      let updated;

      if (editIndex !== undefined && editIndex !== null) {
        updated = [...prev];
        updated[editIndex] = { ...prev[editIndex], ...line };
      } else {
        updated = [...prev, line];
      }

      if (appliedVoucher?.applied_to_cartItemId) {
        updated = updated.map((x) => {
          if (x.cartItemId !== appliedVoucher.applied_to_cartItemId) return x;
          const orig = typeof x._origUnitPrice === "number" ? x._origUnitPrice : x.unitPrice;
          return {
            ...x,
            _origUnitPrice: orig,
            unitPrice: 0,
            appliedVoucher: {
              id: appliedVoucher.id,
              code: appliedVoucher.code,
              reward_text: appliedVoucher.reward_text,
            },
          };
        });
      }

      return updated;
    });

    setSelectedItemForModal(null);
  };

  const handleSaveTicket = async () => {
    if (savingTicket) return;
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before saving.");
    if (!orderType) return showToast("error", "Order Type Required", "Please select order type.");

    setSavingTicket(true);
    try {
      const payload = {
        ticket_name: orderType,
        customer_id: attachedCustomer?.id || null,
        items: cart,
        total_amount: subtotal,
        order_type: orderType,
        applied_voucher: appliedVoucher || null,
      };

      let res = await supabase.from("open_tickets").insert([payload]);

      // fallback if applied_voucher column doesn't exist
      if (res.error && /applied_voucher/i.test(res.error.message || "")) {
        const { applied_voucher, ...fallback } = payload;
        res = await supabase.from("open_tickets").insert([fallback]);
      }

      if (res.error) {
        showToast("error", "Save Failed", res.error.message);
        return;
      }

      showToast("success", "Ticket Saved", "Ticket parked successfully.");
      clearTicketSoft();
    } finally {
      setSavingTicket(false);
    }
  };

  const fetchSavedTickets = async () => {
    let res = await supabase
      .from("open_tickets")
      .select("id, ticket_name, order_type, customer_id, items, total_amount, applied_voucher, created_at")
      .order("created_at", { ascending: false });

    if (res.error && /applied_voucher/i.test(res.error.message || "")) {
      res = await supabase
        .from("open_tickets")
        .select("id, ticket_name, order_type, customer_id, items, total_amount, created_at")
        .order("created_at", { ascending: false });
    }

    if (res.error) {
      showToast("error", "Load Failed", res.error.message);
      setSavedTickets([]);
      return;
    }

    const enriched = (res.data || []).map((t) => {
      const c = customers.find((x) => x.id === t.customer_id);
      return { ...t, _customerName: c?.name || "Walk-in" };
    });

    setSavedTickets(enriched);
  };

  const resumeTicket = async (t) => {
    setCart(t.items || []);
    setOrderType(t.order_type || t.ticket_name || "");
    const c = customers.find((x) => x.id === t.customer_id);
    setAttachedCustomer(c || null);

    if (t.applied_voucher?.id) {
      setAppliedVoucher(t.applied_voucher);
      const targetId = t.applied_voucher.applied_to_cartItemId;
      if (targetId) setVoucherTargetCartItemId(targetId);
      setCart((prev) =>
        (prev || []).map((line) => {
          if (line.cartItemId !== targetId) return line;
          const orig = typeof line._origUnitPrice === "number" ? line._origUnitPrice : line.unitPrice;
          return { ...line, _origUnitPrice: orig, unitPrice: 0, appliedVoucher: t.applied_voucher };
        })
      );
    } else {
      setAppliedVoucher(null);
    }

    setSavedOpen(false);
    showToast("success", "Ticket Resumed", "Continue the order.");
  };

  const handleChargeOrder = async () => {
    if (charging) return;
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before charging.");
    if (!orderType) return showToast("error", "Order Type Required", "Please select order type.");

    setCharging(true);
    try {
      if (appliedVoucher?.id) {
        const { error } = await supabase
          .from("vouchers")
          .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
          .eq("id", appliedVoucher.id)
          .eq("status", "active");

        if (error) {
          showToast("error", "Voucher Redeem Failed", error.message);
          return;
        }
      }

      showToast("success", "Charged", "Voucher redeemed (if applied). Connect payment flow next.");
      clearTicketSoft();
      setTicketDrawerOpen(false);
    } finally {
      setCharging(false);
    }
  };

  const clearTicketSoft = () => {
    setCart([]);
    setAttachedCustomer(null);
    setAppliedVoucher(null);
    setAvailableVouchers([]);
    setVoucherModalOpen(false);
    setVoucherTargetCartItemId(null);
    setSplitMode(false);
    setSplitSelected([]);
  };

  const clearTicket = () => {
    clearTicketSoft();
    setConfirmOpen(false);
    setTicketDrawerOpen(false);
  };

  const toggleSplit = () => {
    setSplitMode((p) => !p);
    setSplitSelected([]);
  };

  const toggleSplitSelect = (cartItemId) => {
    setSplitSelected((prev) =>
      prev.includes(cartItemId) ? prev.filter((id) => id !== cartItemId) : [...prev, cartItemId]
    );
  };

  const splitSelectedLines = useMemo(
    () => cart.filter((x) => splitSelected.includes(x.cartItemId)),
    [cart, splitSelected]
  );

  const moveToNewTicketPickType = () => {
    if (!splitSelected.length) return showToast("info", "Select Items", "Choose items to move first.");
    setOrderTypePickOpen(true);
  };

  const createNewTicketWithItems = async (newType) => {
    setOrderTypePickOpen(false);
    if (!newType) return;

    const movingItems = splitSelectedLines;
    if (!movingItems.length) return;

    setMoving(true);
    try {
      const payload = {
        ticket_name: newType,
        order_type: newType,
        customer_id: attachedCustomer?.id || null,
        items: movingItems,
        total_amount: calcTotal(movingItems),
      };

      const { error } = await supabase.from("open_tickets").insert([payload]);
      if (error) {
        showToast("error", "Move Failed", error.message);
        return;
      }

      setCart((prev) => prev.filter((x) => !splitSelected.includes(x.cartItemId)));

      if (appliedVoucher?.applied_to_cartItemId && splitSelected.includes(appliedVoucher.applied_to_cartItemId)) {
        removeAppliedVoucher();
      }

      setSplitSelected([]);
      setSplitMode(false);
      showToast("success", "Moved", `Items moved to new ticket: ${newType}`);
    } finally {
      setMoving(false);
    }
  };

  const openMoveToSaved = async () => {
    if (!splitSelected.length) return showToast("info", "Select Items", "Choose items to move first.");
    await fetchSavedTickets();
    setSavedMode("move");
    setSavedOpen(true);
  };

  const moveItemsToSavedTicket = async (ticket) => {
    const movingItems = splitSelectedLines;
    if (!movingItems.length) return;

    setMoving(true);
    try {
      const merged = [...(ticket.items || []), ...movingItems];
      const total = calcTotal(merged);

      const { error } = await supabase
        .from("open_tickets")
        .update({ items: merged, total_amount: total })
        .eq("id", ticket.id);

      if (error) {
        showToast("error", "Move Failed", error.message);
        return;
      }

      setCart((prev) => prev.filter((x) => !splitSelected.includes(x.cartItemId)));

      if (appliedVoucher?.applied_to_cartItemId && splitSelected.includes(appliedVoucher.applied_to_cartItemId)) {
        removeAppliedVoucher();
        showToast("warn", "Voucher Removed", "Voucher wasn't moved to the other ticket.");
      }

      setSplitSelected([]);
      setSplitMode(false);
      setSavedOpen(false);
      showToast("success", "Moved", "Items moved to selected saved ticket.");
    } finally {
      setMoving(false);
    }
  };

  const selectedCartItem = useMemo(
    () => cart.find((x) => x.cartItemId === voucherTargetCartItemId) || null,
    [cart, voucherTargetCartItemId]
  );

  const ticketTitle = orderType || "Select Order Type";
  const ticketSubtitle = attachedCustomer?.name || "Walk-in";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] pb-24 lg:pb-0">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">POS</p>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-800">Terminal</h1>
        </div>

        <button
          onClick={async () => {
            await fetchSavedTickets();
            setSavedMode("resume");
            setSavedOpen(true);
          }}
          className="text-xs font-bold uppercase tracking-widest text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-2xl active:scale-95"
        >
          Saved Tickets
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pb-10 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5">
        {/* MENU SECTION */}
        <div className="bg-white rounded-3xl border border-rose-100 p-4 md:p-5 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            {/* Category popup trigger */}
            <button
              onClick={() => setCategoryOpen(true)}
              className="bg-slate-50 px-4 py-2 rounded-2xl text-xs font-bold text-slate-700 border border-slate-200 active:scale-95"
              type="button"
            >
              {activeCategory || "Select Category"} ▾
            </button>

            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search menu..."
              className="w-full max-w-[220px] px-4 py-2 bg-slate-50 rounded-2xl text-xs outline-none focus:bg-slate-100 border border-slate-200"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {items
              .filter((i) => i.category === activeCategory)
              .filter((i) => (i.name || "").toLowerCase().includes(menuSearch.toLowerCase()))
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItemForModal(item)}
                  className="group relative flex flex-col p-3 bg-white border border-slate-100 rounded-3xl cursor-pointer transition-all text-left hover:-translate-y-[4px] hover:shadow-[0_20px_40px_rgba(252,104,125,0.12)]"
                >
                  <div className="w-full h-24 rounded-2xl bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl text-rose-200/50">📷</span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      {item.category || "General"}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</p>
                    <p className="text-sm font-bold text-slate-700">
                        {item.is_variable_price ? "Variable" : `₱${Number(item.price || 0).toFixed(0)}`}
                      </p>

                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* DESKTOP TICKET SIDEBAR */}
        <div className="hidden lg:block bg-slate-900 rounded-3xl p-4 md:p-5 text-white shadow-2xl">
          <TicketPanel
            cart={cart}
            customers={customers}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            isCustListOpen={isCustListOpen}
            setIsCustListOpen={setIsCustListOpen}
            onSearchKeyDown={onSearchKeyDown}
            handleCodeInput={handleCodeInput}
            onOpenScanner={() => setScannerOpen(true)}
            orderType={orderType}
            setOrderType={setOrderType}
            diningOptions={diningOptions}
            subtotal={subtotal}
            ticketTitle={ticketTitle}
            ticketSubtitle={ticketSubtitle}
            appliedVoucher={appliedVoucher}
            onOpenVouchers={async () => {
              if (!attachedCustomer?.id) return showToast("error", "Attach Customer", "Scan/select a customer first.");
              const v = await fetchActiveVouchers(attachedCustomer.id);
              setVoucherModalOpen(true);
              if (v.length === 0) showToast("info", "No Vouchers", "No active vouchers for this customer.");
            }}
            onRemoveVoucher={removeAppliedVoucher}
            onClear={() => setConfirmOpen(true)}
            onCharge={handleChargeOrder}
            onSave={handleSaveTicket}
            charging={charging}
            savingTicket={savingTicket}
            voucherTargetCartItemId={voucherTargetCartItemId}
            splitMode={splitMode}
            splitSelected={splitSelected}
            onToggleSplit={toggleSplit}
            onMoveToNewTicket={moveToNewTicketPickType}
            onMoveToSaved={openMoveToSaved}
            moving={moving}
            onCartItemClick={(line, idx) => {
              if (splitMode) {
                toggleSplitSelect(line.cartItemId);
                return;
              }
              setVoucherTargetCartItemId(line.cartItemId);
              const base = items.find((i) => i.id === line.id) || null;
              if (!base) return;
              setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
            }}
          />
        </div>
      </div>

      {/* MOBILE: FIXED BOTTOM BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-rose-100 shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
        <button
          onClick={() => setTicketDrawerOpen(true)}
          className="w-full px-4 py-4 flex items-center justify-between active:scale-[0.99]"
        >
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Ticket</p>
            <p className="text-sm font-semibold text-slate-800">
              {itemCount} item{itemCount === 1 ? "" : "s"} • ₱{subtotal.toFixed(0)}
            </p>
            {appliedVoucher?.code && (
              <p className="text-[11px] text-[#FC687D] font-mono mt-0.5">Voucher: {appliedVoucher.code}</p>
            )}
          </div>
          <div className="text-slate-500">🛒</div>
        </button>
      </div>

      {/* MOBILE DRAWER */}
      {ticketDrawerOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-end"
          onClick={() => setTicketDrawerOpen(false)}
        >
          <div
            className="w-full max-h-[88vh] bg-slate-900 text-white rounded-t-3xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <TicketPanel
              cart={cart}
              customers={customers}
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              isCustListOpen={isCustListOpen}
              setIsCustListOpen={setIsCustListOpen}
              onSearchKeyDown={onSearchKeyDown}
              handleCodeInput={handleCodeInput}
              onOpenScanner={() => setScannerOpen(true)}
              orderType={orderType}
              setOrderType={setOrderType}
              diningOptions={diningOptions}
              subtotal={subtotal}
              ticketTitle={ticketTitle}
              ticketSubtitle={ticketSubtitle}
              appliedVoucher={appliedVoucher}
              onOpenVouchers={async () => {
                if (!attachedCustomer?.id) return showToast("error", "Attach Customer", "Scan/select a customer first.");
                const v = await fetchActiveVouchers(attachedCustomer.id);
                setVoucherModalOpen(true);
                if (v.length === 0) showToast("info", "No Vouchers", "No active vouchers for this customer.");
              }}
              onRemoveVoucher={removeAppliedVoucher}
              onClear={() => setConfirmOpen(true)}
              onCharge={handleChargeOrder}
              onSave={handleSaveTicket}
              charging={charging}
              savingTicket={savingTicket}
              voucherTargetCartItemId={voucherTargetCartItemId}
              splitMode={splitMode}
              splitSelected={splitSelected}
              onToggleSplit={toggleSplit}
              onMoveToNewTicket={moveToNewTicketPickType}
              onMoveToSaved={openMoveToSaved}
              moving={moving}
              onCartItemClick={(line, idx) => {
                if (splitMode) {
                  toggleSplitSelect(line.cartItemId);
                  return;
                }
                setVoucherTargetCartItemId(line.cartItemId);
                const base = items.find((i) => i.id === line.id) || null;
                if (!base) return;
                setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
              }}
              onCloseMobile={() => setTicketDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Category popup */}
      <CategoryModal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        categories={categories}
        active={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* Scanner */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(txt) => handleCodeInput(txt)}
      />

      {/* Saved Tickets */}
      <SavedTicketsModal
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        tickets={savedTickets}
        onRefresh={fetchSavedTickets}
        mode={savedMode}
        onSelect={(t) => {
          if (savedMode === "move") moveItemsToSavedTicket(t);
          else resumeTicket(t);
        }}
      />

      {/* Pick order type */}
      <OrderTypeModal
        open={orderTypePickOpen}
        onClose={() => setOrderTypePickOpen(false)}
        options={diningOptions}
        onPick={createNewTicketWithItems}
      />

      {/* Vouchers */}
      <VouchersModal
        open={voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        vouchers={availableVouchers}
        appliedVoucher={appliedVoucher}
        selectedCartItem={selectedCartItem}
        onApply={(v) => {
          applyVoucherToTicket(v);
          setVoucherModalOpen(false);
        }}
        onRemove={() => {
          removeAppliedVoucher();
          setVoucherModalOpen(false);
        }}
      />

      {/* Item Modal */}
      {selectedItemForModal && (
        <AddToCartModal
          item={selectedItemForModal}
          onClose={() => setSelectedItemForModal(null)}
          onAddToCart={onAddToCart}
        />
      )}

      {/* Confirm Clear */}
      <ConfirmModal
        open={confirmOpen}
        title="Clear ticket?"
        message="This will remove all items, voucher, and detach the customer."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={clearTicket}
      />
    </div>
  );
}