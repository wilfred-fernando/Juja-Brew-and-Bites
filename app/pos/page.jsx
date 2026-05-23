"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import TicketPanel from "@/components/pos/TicketPanel";

// ================= PRINT HELPERS =================

function print58mmTextBrowser(text) {
  const safe = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const html = `
<!doctype html>
<html>
  <body style="font-family: monospace; font-size:12px; padding:8px;">
    <pre>${safe}</pre>
  </body>
</html>
  `;

  const frame = document.createElement("iframe");
  frame.style.display = "none";

  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 800);
  };

  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// ================= BLE PRINT =================

async function bleConnect(serviceUuid, characteristicUuid) {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [serviceUuid],
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const characteristic = await service.getCharacteristic(characteristicUuid);

  return characteristic;
}

async function blePrint(characteristic, text) {
  const bytes = new TextEncoder().encode(text + "\n\n");

  for (let i = 0; i < bytes.length; i += 180) {
    await characteristic.writeValueWithoutResponse(
      bytes.slice(i, i + 180)
    );
  }
}

// ================= PRINT ROUTER =================

async function printByRole(role, text, printerConfig) {
  const cfg = printerConfig?.[role];

  if (!cfg || cfg.transport === "browser") {
    print58mmTextBrowser(text);
    return;
  }

  try {
    const characteristic = await bleConnect(
      cfg.ble_service_uuid,
      cfg.ble_characteristic_uuid
    );

    await blePrint(characteristic, text);
  } catch (err) {
    console.warn("Bluetooth failed → fallback printing", err);
    print58mmTextBrowser(text);
  }
}

// ================= TEXT BUILDERS =================

function buildReceiptText({
  receiptSettings,
  order,
  cart,
  diningOption,
  payment,
  customer,
  subtotal,
  discount,
  total,
  voucher,
  appliedDiscount,
}) {
  const rs = receiptSettings || {};
  const lines = [];

  const header = rs.header_text || "";
  const footer = rs.footer_text || "";

  if (header) lines.push(header);

  if (rs.show_store_name !== false) lines.push(`Store: ${order.store_id}`);
  if (rs.show_datetime !== false) lines.push(`Date: ${new Date().toLocaleString()}`);
  if (rs.show_order_number !== false) lines.push(`Receipt: ${order.id}`);

  lines.push(`Dining: ${diningOption}`);
  if (rs.show_payment_type !== false) lines.push(`Payment: ${payment}`);
  if (customer?.name) lines.push(`Customer: ${customer.name}`);

  if (voucher?.code) lines.push(`Voucher: ${voucher.code}`);
  if (appliedDiscount?.name) lines.push(`Discount: ${appliedDiscount.name}`);

  lines.push("—");
  cart.forEach((x) => {
    lines.push(`${x.name} x${x.quantity}  ₱${(Number(x.unitPrice) * Number(x.quantity)).toFixed(0)}`);
  });
  lines.push("—");
  lines.push(`Subtotal: ₱${Number(subtotal || 0).toFixed(2)}`);
  if (discount > 0) lines.push(`Discount: -₱${Number(discount || 0).toFixed(2)}`);
  lines.push(`TOTAL: ₱${Number(total || 0).toFixed(2)}`);

  if (footer) {
    lines.push("—");
    lines.push(footer);
  }

  return lines.join("\n");
}

function buildOrderSlipText({ orderId, cart }) {
  return [
    "ORDER SLIP",
    `Order: ${orderId}`,
    "-----",
    ...cart.map(x => `${x.quantity}x ${x.name}`)
  ].join("\n");
}

function buildCupLabels({ orderId, cart }) {
  const labels = [];
  cart.forEach(x => {
    for (let i = 0; i < x.quantity; i++) {
      labels.push(`${x.name}\nOrder ${orderId}`);
    }
  });
  return labels;
}

/* =========================================================
   Helpers
========================================================= */
const peso0 = (n) => `₱${Number(n || 0).toFixed(0)}`;
const peso2 = (n) => `₱${Number(n || 0).toFixed(2)}`;

function printReceiptText(receiptText, opts = {}) {
  const {
    title = "Receipt",
    widthMm = 80,
    fontSize = 12,
    lineHeight = 1.25,
  } = opts;

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    @media print {
      html, body { width: ${widthMm}mm; margin: 0; padding: 0; }
    }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      padding: 8px;
      color: #000;
    }
    .receipt {
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="receipt">${String(receiptText || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")}</div>
</body>
</html>`;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    try {
      frame.contentWindow?.removeEventListener("afterprint", cleanup);
    } catch {}
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.addEventListener("afterprint", cleanup);
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      cleanup();
    }
  };

  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function getPosStoreId() {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("pos_store_id") ||
    localStorage.getItem("admin_store_id") ||
    null
  );
}

function discountAmountFromRule(rule, subtotal) {
  if (!rule) return 0;
  const type = String(rule.type || "").toLowerCase();
  const value = Number(rule.value || 0);

  if (type === "percent") return subtotal * (value / 100);
  if (type === "fixed") return value;
  if (type === "comp") return subtotal;
  return 0;
}

/* =========================================================
   UI Components (Modals, Toast, Shell)
========================================================= */
function ModalShell({ open, onClose, title, subtitle, children, z = 120 }) {
  if (!open) return null;
  return (
    <div
      style={{ zIndex: z }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-fadeIn"
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

function BarcodeScannerModal({ open, onClose, onResult }) {
  const [step, setStep] = useState("intro");
  const [errMsg, setErrMsg] = useState("");
  const scannerRef = useRef(null);

  function stopScanner() {
    const s = scannerRef.current;
    scannerRef.current = null;
    try {
      if (s?.clear) s.clear();
    } catch {}
    const el = typeof window !== "undefined" ? document.getElementById("pos-scan-area") : null;
    if (el) el.innerHTML = "";
  }

  useEffect(() => {
    if (!open) return;
    const seen = typeof window !== "undefined" && localStorage.getItem("pos_scanner_seen") === "1";
    setStep(seen ? "scanning" : "intro");
    setErrMsg("");
    return () => stopScanner();
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

  return (
    <ModalShell
      open={open}
      onClose={() => {
        stopScanner();
        onClose();
      }}
      title="Barcode Scanner"
      subtitle="Scan code"
      z={145}
    >
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
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="w-full mt-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
          >
            Stop
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function SavedTicketsModal({ open, onClose, tickets, onSelect, onRefresh, onVoid, mode = "resume" }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Saved Tickets" subtitle={mode === "move" ? "Move Items" : "Resume"} z={145}>
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
            <div key={t.id} className="p-4 border rounded-2xl bg-white">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 text-left">
                  <p className="font-semibold text-slate-800 truncate">{t.order_type || t.ticket_name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Items: {(t.items || []).length} • ₱{Number(t.total_amount || 0).toFixed(0)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">
                    Customer: {t._customerName || "Walk-in"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onVoid(t)}
                  className="text-xs text-red-600 font-bold tracking-wider hover:text-red-700 transition"
                >
                  VOID
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelect(t)}
                className="mt-3 w-full text-left p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 text-xs font-semibold text-slate-700 transition"
              >
                {mode === "move" ? "Move here" : "Resume Ticket"}
              </button>
            </div>
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

function DiningOptionModal({ open, onClose, options, onPick }) {
  if (!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} title="New Ticket" subtitle="Select Dining Option" z={145}>
      <div className="space-y-2">
        {(options || []).map((opt) => (
          <button
            key={opt.id || opt.name}
            onClick={() => onPick(opt.name)}
            className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50"
          >
            {opt.name}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="w-full mt-4 py-3 bg-black text-white rounded-xl">
        Close
      </button>
    </ModalShell>
  );
}

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
  const canAdd = (item.variants || []).every((g) => !g.isRequired || (selections[g.id] || []).length > 0);

  const variantDetails = Object.values(selections)
    .flat()
    .map((o) => o.name)
    .join(", ");

  const totalLine = (unitPrice * quantity).toFixed(0);

  return (
    <ModalShell open={!!item} onClose={onClose} title={item.editData ? "Edit Item" : "Add to Ticket"} subtitle={item.name} z={145}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          Base ₱{basePrice.toFixed(0)}
          {variantPrice > 0 ? ` • +₱${variantPrice.toFixed(0)} variants` : ""}
        </p>
      </div>

      <div className="mt-3">
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">Quantity</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "") {
              setQuantity("");
              return;
            }
            const num = Number(val);
            if (!isNaN(num) && num >= 1) setQuantity(Math.floor(num));
          }}
          onBlur={() => {
            if (!quantity || quantity < 1) setQuantity(1);
          }}
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-center text-lg font-bold text-slate-800 outline-none focus:border-[#FC687D]"
        />
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
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">Special Instructions</label>
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

function PaymentModal({ open, onClose, paymentTypes, selectedPayment, onSelect, onConfirm, total, paymentAmount, setPaymentAmount }) {
  const isCash = String(selectedPayment || "").toLowerCase().includes("cash");
  const amt = Number(paymentAmount || 0);
  const due = Number(total || 0);

  const change = isCash ? Math.max(0, amt - due) : 0;
  const remaining = Math.max(0, due - amt);

  const disableConfirm =
    !selectedPayment ||
    !paymentAmount ||
    Number.isNaN(amt) ||
    amt <= 0 ||
    (isCash && amt < due);

  return (
    <ModalShell open={open} onClose={onClose} title="Payment" subtitle="Select Payment Type" z={150}>
      <div className="space-y-3">
        {(paymentTypes || []).length === 0 ? (
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
            No payment types found. Add them in POS Admin → Settings → Payment Types.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {paymentTypes.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.name);
                  setPaymentAmount(String(Number(due || 0).toFixed(2)));
                }}
                className={`py-3 rounded-2xl border text-xs font-bold uppercase tracking-widest active:scale-95 ${
                  selectedPayment === p.name
                    ? "border-rose-200 bg-rose-50 text-[#FC687D]"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            {isCash ? "Cash Received" : "Amount Paid"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-slate-500 font-bold">₱</span>
            <input
              inputMode="decimal"
              value={paymentAmount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setPaymentAmount(v);
              }}
              placeholder={String(Number(total || 0).toFixed(2))}
              className="w-full px-3 py-3 rounded-xl border border-slate-200 text-slate-900 font-bold outline-none focus:border-rose-300"
            />
          </div>

          <div className="mt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Total Due</span>
              <span className="font-bold">{peso2(due)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Paid</span>
              <span className="font-bold">{peso2(amt)}</span>
            </div>
            {isCash ? (
              <div className="flex justify-between text-emerald-700 mt-1">
                <span className="font-bold">Change</span>
                <span className="font-extrabold">{peso2(change)}</span>
              </div>
            ) : remaining > 0 ? (
              <div className="flex justify-between text-orange-700 mt-1">
                <span className="font-bold">Remaining</span>
                <span className="font-extrabold">{peso2(remaining)}</span>
              </div>
            ) : null}

            {isCash && amt < due ? (
              <div className="mt-2 text-xs text-rose-600">
                Cash received must be at least the total due.
              </div>
            ) : null}
          </div>
        </div>

        <button
          disabled={disableConfirm}
          onClick={() => onConfirm({ amountPaid: amt, changeDue: change })}
          className="w-full mt-1 py-3 rounded-2xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
        >
          Confirm • {peso0(total)}
        </button>
      </div>
    </ModalShell>
  );
}

function ReceiptPreviewModal({ open, onClose, receiptText }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Receipt" subtitle="Preview" z={160}>
      <pre className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-2xl p-4">
        {receiptText || "No receipt"}
      </pre>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95"
        >
          Close
        </button>
        <button
          onClick={() => printReceiptText(receiptText, { widthMm: 80 })}
          className="w-full py-3 rounded-2xl bg-black text-white text-xs font-bold uppercase tracking-widest active:scale-95"
        >
          Print
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   MAIN POS PAGE
========================================================= */
export default function POSPage() {
  const supabase = getSupabaseClient();
  const [storeId, setStoreId] = useState(null);

    useEffect(() => {
      // initialize from localStorage on first mount
      setStoreId(getPosStoreId());
    }, []);

  // Printer Configuration Lookups
  const [printerConfig, setPrinterConfig] = useState({
    receipt: null,
    order_slip: null,
    cup_label: null,
  });

  // Base Data Streams
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);
  const [tables, setTables] = useState([]);

  // Managed Setup Options
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [ticketTemplates, setTicketTemplates] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(null);

  // Live Working States
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(""); 
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  // Targets and Filters
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [diningOption, setDiningOption] = useState("");
  const hasInitializedDining = useRef(false);

  // Discounts & Vouchers
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [availableVouchers, setAvailableVouchers] = useState([]);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherTargetCartItemId, setVoucherTargetCartItemId] = useState(null);
  const [appliedDiscount, setAppliedDiscount] = useState(null);

  // Modal Workflow Toggles
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [changeDue, setChangeDue] = useState(0);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptText, setReceiptText] = useState("");

  // UI Flow Layout Modals
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedTickets, setSavedTickets] = useState([]);
  const [savedMode, setSavedMode] = useState("resume");
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState([]);
  const [diningOptionPickOpen, setDiningOptionPickOpen] = useState(false);

  // Process Locking Flags
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [moving, setMoving] = useState(false);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 2200);
  };

  // Math Transformations
  const calcTotal = (lines) =>
    (lines || []).reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0);

  const subtotal = useMemo(() => calcTotal(cart), [cart]);

  const discountAmount = useMemo(() => {
    const amt = discountAmountFromRule(appliedDiscount, subtotal);
    return Math.max(0, Math.min(subtotal, amt));
  }, [appliedDiscount, subtotal]);

  const totalDue = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0), [cart]);

  useEffect(() => {
    if (!ticketDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [ticketDrawerOpen]);

  useEffect(() => {
    if (!attachedCustomer?.id) return;
    (async () => {
      const v = await fetchActiveVouchers(attachedCustomer.id);
      if (v.length > 0) setVoucherModalOpen(true);
    })();
  }, [attachedCustomer?.id]);

  useEffect(() => {
  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    // ✅ pull store_id + role from profiles
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, role, store_id, full_name")
      .eq("id", session.user.id)
      .single();

    if (pErr) {
      console.error("PROFILE ERROR FULL:", JSON.stringify(pErr, null, 2));
      showToast("error", "Profile Error", "Failed to load profile");
      return;
    }

    const role = String(profile?.role || "").toLowerCase();
    if (role !== "cashier" && role !== "admin") {
      await supabase.auth.signOut();
      window.location.href = "/login";
      return;
    }

    
    if (!profile) {
      showToast("error", "No Profile", "User profile not found");
      return;
    }


    // ✅ persist + set state
    localStorage.setItem("pos_store_id", profile.store_id);
    setStoreId(profile.store_id);

    // ✅ load POS data after store is known
    await fetchData(profile.store_id);
  };

  init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // System Core Data Layer Logic
  async function loadPrinters() {
    const sid = storeId;
    if (!sid) return;

    const { data, error } = await supabase
      .from("pos_printers")
      .select("*")
      .eq("store_id", sid)
      .eq("is_active", true);

    if (error) {
      showToast("error", "Printer Load Failed", error.message);
      return;
    }

    const map = { receipt: null, order_slip: null, cup_label: null };
    (data || []).forEach((p) => { map[p.role] = p; });
    setPrinterConfig(map);
  }
  // FETCH VOUCHERS WITH ACTIVE STATUS AND NOT EXPIRED
    async function fetchActiveVouchers(memberId) {
      const now = Date.now();

      let res = await supabase
        .from("vouchers")
        .select("id, code, reward_text, expires_at, status, reward_type, member_id")
        .eq("member_id", memberId)
        .order("issued_at", { ascending: false });

      // fallback if reward_type column missing
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
            (String(x.code || "").toUpperCase().startsWith("BDAY")
              ? "birthday"
              : "reward"),
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

  async function loadPosSettings() {
  const sid = storeId;
  if (!sid) return;

  const normalize = (s) => String(s ?? "").trim().toLowerCase();

  const mergeGlobalThenStore = (rows) => {
    const map = new Map();

    // 1) global first
    (rows || [])
      .filter((r) => r.store_id == null)
      .forEach((r) => {
        const key = normalize(r.name);
        if (!key) return;
        map.set(key, r);
      });

    // 2) store overrides global
    (rows || [])
      .filter((r) => r.store_id === sid)
      .forEach((r) => {
        const key = normalize(r.name);
        if (!key) return;
        map.set(key, r);
      });

    return Array.from(map.values()).sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    });
  };

  const [payRes, dineRes, ticketRes, discRes, receiptRes] = await Promise.all([
    // PAYMENT TYPES: global + store
    supabase
      .from("pos_payment_types")
      .select("*")
      .or(`store_id.eq.${sid},store_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    // DINING OPTIONS: currently global (no store filter). Keep as-is unless you add store_id later.
    supabase.from("dining_options").select("*").eq("is_available", true),

    // TICKET TEMPLATES: store-specific (correct)
    supabase.from("pos_open_ticket_templates").select("*").eq("store_id", sid),

    // DISCOUNTS: store-specific (see note below if you want global)
    supabase.from("pos_discounts").select("*").eq("store_id", sid),

    // RECEIPT SETTINGS: store-specific (correct)
    supabase.from("pos_receipt_settings").select("*").eq("store_id", sid).maybeSingle(),
  ]);

  console.log("Session user:", session.user?.id);

  // ✅ merge store overrides global
  const mergedPaymentTypes = mergeGlobalThenStore(payRes.data || []);
  setPaymentTypes(mergedPaymentTypes);

  setDiningOptions(dineRes.data || []);
  setTicketTemplates(ticketRes.data || []);
  setDiscountRules(discRes.data || []);
  setReceiptSettings(receiptRes.data || null);

  if (!hasInitializedDining.current && (dineRes.data || []).length > 0) {
    setDiningOption(dineRes.data[0].name);
    hasInitializedDining.current = true;
  }
}

  async function fetchData() {
    setLoading(true);
    try {
      const [iRes, catRes, cRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("menu_categories").select("*").order("name", { ascending: true }),
        supabase.from("loyalty_members").select("id, name:customer_name, code:customer_code"),
      ]);

      const cats = catRes.data || [];
      setItems(iRes.data || []);
      setCategories(cats);
      setCustomers(cRes.data || []);

      if (cats.length && !activeCategory) setActiveCategory(cats[0].name);

      await loadPosSettings();
      await loadPrinters();
    } catch (e) {
      showToast("error", "Loading Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  const [originalTicketId, setOriginalTicketId] = useState(null);

  async function loadDiningOptionOrder(optionName) {
    const { data } = await supabase
      .from("open_tickets")
      .select("*")
      .eq("order_type", optionName)
      .maybeSingle();

    if (data) {
      setOriginalTicketId(data.id); 
      setCart(data.items || []);
      const linkedCustomer = customers.find((c) => c.id === data.customer_id);
      setAttachedCustomer(linkedCustomer || null);
      showToast("info", "Table Loaded", optionName);
    } else {
      setOriginalTicketId(null);
      setCart([]);
      setAttachedCustomer(null);
    }
  }

  async function handleDiningChange(value) {
    setDiningOption(value);
    await loadDiningOptionOrder(value);
  }

  async function saveTableOrder() {
    if (!diningOption) return;

    const payload = {
      ticket_name: diningOption,
      order_type: diningOption,
      customer_id: attachedCustomer?.id || null,
      items: cart,
      total_amount: Number(subtotal || 0),
    };

    if (originalTicketId) {
      const { error } = await supabase
        .from("open_tickets")
        .update(payload)
        .eq("id", originalTicketId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("open_tickets")
        .insert([payload]);

      if (error) throw error;
    }
  }

  async function fetchSavedTickets() {
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
  }

  async function voidTicket(ticketId) {
    if (!ticketId) return;
    const confirmVoid = confirm("Void this saved ticket? This cannot be undone.");
    if (!confirmVoid) return;

    const { error } = await supabase.from("open_tickets").delete().eq("id", ticketId);
    if (error) {
      showToast("error", "Void Failed", error.message);
      return;
    }
    await fetchSavedTickets();
    showToast("success", "Ticket Voided", "Ticket removed successfully.");
  }

  // ================= STANDALONE RESUME TRACKER =================

  async function resumeTicket(t) {
    setOriginalTicketId(t.id); 
    setCart(t.items || []);
    setDiningOption(t.order_type || t.ticket_name || "");
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
  }

  // ================= PARKED AND PAID CLEANERS =================

  async function handleSaveTicket() {
    if (savingTicket) return;
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before saving.");
    if (!diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");

    const confirmSave = confirm(`Are you sure you want to park this current ticket to "${diningOption}"?`);
    if (!confirmSave) return;

    setSavingTicket(true);
    try {
      await saveTableOrder();
      showToast("success", "Saved", "Ticket updated in system.");
      clearTicketSoft(); 
    } catch (err) {
      console.error("Save failed:", err);
      showToast("error", "Database Sync Failed", err.message || "An error occurred.");
    } finally {
      setSavingTicket(false);
    }
  }

  async function handleVoidCurrentTicket() {
    if (cart.length === 0) return showToast("error", "Empty Ticket", "No items to void.");
    if (!diningOption) return showToast("error", "Dining Option Required", "No explicit table option linked.");

    const confirmVoid = confirm(`Void entire current live ticket for "${diningOption}"? This clears all items permanently.`);
    if (!confirmVoid) return;

    setSavingTicket(true);
    try {
      await supabase.from("open_tickets").delete().eq("order_type", diningOption);
      clearTicketSoft(); 
      showToast("success", "Live Ticket Voided", "Order scrubbed successfully.");
    } catch (err) {
      showToast("error", "Void Failed", err.message);
    } finally {
      setSavingTicket(false);
    }
  }

  async function handleChargeOrder() {
    if (charging) return;
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before charging.");
    if (!diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (!storeId) return showToast("error", "Store not set", "Set pos_store_id/admin_store_id.");
    setPaymentOpen(true);
  }

  // ================= EXCEL COMPLIANT DATA INSERTS =================

  async function confirmCharge() {
    if (charging) return;
    if (!selectedPayment) return showToast("error", "Payment Required", "Select a payment type.");
    if (!storeId) return showToast("error", "Store not set", "Set pos_store_id/admin_store_id.");
    if (!diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before charging.");

    setCharging(true);
    try {
      // 1. Handle voucher state updates if any
      if (appliedVoucher?.id) {
        const { error } = await supabase
          .from("vouchers")
          .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
          .eq("id", appliedVoucher.id)
          .eq("status", "active");
        if (error) return showToast("error", "Voucher Redeem Failed", error.message);
      }

      const discount = Number(discountAmount || 0);
      const total = Number(totalDue || 0);

      // 2. Original System Logic: Save standard operational order row
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert([{
          store_id: storeId,
          customer_id: attachedCustomer?.id || null,
          total,
          discount,
          payment_method: selectedPayment,
          dining_option: diningOption,
        }])
        .select("*")
        .single();
      if (orderErr) return showToast("error", "Charge Failed", orderErr.message);

      const itemRows = cart.map((line) => ({
        order_id: orderRow.id,
        menu_item_id: line.id,
        name: line.name,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: Number(line.unitPrice || 0) * Number(line.quantity || 0),
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) return showToast("error", "Charge Failed", itemsErr.message);

      // =================================================================
      // EXCEL LOG COMPLIANCE ENGINE (NEW)
      // =================================================================
      
      const now = new Date();
      // Generates "M/D/YY h:mm AM/PM" matching "5/20/26 10:11 PM"
      const excelTimestamp = now.toLocaleString('en-US', {
        year: '2-digit',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).replace(/,/g, '');

      // Generates standard sequence id pattern matching your sheet logs
      const generatedReceiptNumber = `2-${Math.floor(1000 + Math.random() * 9000)}`;

      // Calculate aggregated sums
      const calculatedGrossSales = cart.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 0)), 0);
      const calculatedNetSales = calculatedGrossSales - discount;
      
      // Map item descriptions comma separated: "2 x Grass Jelly MT (R)"
      const csvDescriptionString = cart
        .map(item => `${item.quantity} x ${item.name}${item.variantDetails ? ` (${item.variantDetails})` : ''}`)
        .join(', ');

      // Build Master Receipt record schema (receipts.csv format)
      const masterReceiptLogPayload = {
        date: excelTimestamp,
        receipt_number: generatedReceiptNumber,
        receipt_type: "Sale",
        gross_sales: calculatedGrossSales.toFixed(2),
        discounts: discount.toFixed(2),
        net_sales: calculatedNetSales.toFixed(2),
        taxes: "0.00",
        total_collected: total.toFixed(2),
        cost_of_goods: "0.00",
        gross_profit: calculatedNetSales.toFixed(2),
        payment_type: selectedPayment,
        description: csvDescriptionString,
        dining_option: diningOption || "TAKEOUT",
        pos: "Cashier - Main",
        store: storeId,
        cashier_name: "Owner",
        customer_name: attachedCustomer?.name || "",
        customer_contacts: "",
        status: "Closed"
      };

      // Push master log row to Supabase receipts historical database table
      const { error: masterLogError } = await supabase
        .from("receipts")
        .insert([masterReceiptLogPayload]);
      if (masterLogError) console.warn("Excel Master Log insertion error: ", masterLogError.message);

      // Build individual item lines data table (receipts-by-item.csv format)
      const itemBreakdownLogPayloads = cart.map((item) => {
        const itemGross = Number(item.unitPrice || 0) * Number(item.quantity || 0);
        // Pro-rate any general discount rule evenly among items lines
        const lineProRatedDiscount = cart.length > 0 ? (discount / cart.length) : 0;
        const itemNet = itemGross - lineProRatedDiscount;

        return {
          date: excelTimestamp,
          receipt_number: generatedReceiptNumber,
          receipt_type: "Sale",
          category: item.category || "GENERAL",
          sku: item.sku || "10000",
          item: item.name,
          variant: item.variantDetails || "R",
          modifiers_applied: item.instructions || "",
          quantity: Number(item.quantity || 0).toFixed(3), // Saves as '1.000' format
          gross_sales: itemGross.toFixed(2),
          discounts: lineProRatedDiscount.toFixed(2),
          net_sales: itemNet.toFixed(2),
          cost_of_goods: "0.00",
          gross_profit: itemNet.toFixed(2),
          taxes: "0.00",
          dining_option: diningOption || "TAKEOUT",
          pos: "Cashier - Main",
          store: storeId,
          cashier_name: "Owner",
          customer_name: attachedCustomer?.name || "",
          customer_contacts: "",
          comment: "",
          status: "Closed"
        };
      });

      // Push item breakdown records into Supabase receipts_by_item database table
      const { error: itemsLogError } = await supabase
        .from("receipts_by_item")
        .insert(itemBreakdownLogPayloads);
      if (itemsLogError) console.warn("Excel Item Log insertion error: ", itemsLogError.message);

      // =================================================================

      // 3. Clear downstream peripheral statuses
      const selectedOption = (diningOptions || []).find((d) => d.name === diningOption) || {};
      const selectedTable = (tables || []).find((t) => t.name === diningOption);
      if (selectedTable) {
        await supabase
          .from("dining_options")
          .update({ table_status: "free" })
          .eq("id", selectedTable.id);
      }

      const receipt = buildReceiptText({
        receiptSettings,
        order: orderRow,
        cart,
        diningOption,
        payment: selectedPayment,
        customer: attachedCustomer,
        subtotal,
        discount,
        total,
        voucher: appliedVoucher,
        appliedDiscount,
      });

      setReceiptText(receipt);
      setReceiptOpen(true);

      if (receiptSettings?.auto_print) {
        await printByRole("receipt", receipt, printerConfig);
        if (selectedOption.print_kitchen) {
          const slip = buildOrderSlipText({ orderId: orderRow.id, cart });
          await printByRole("order_slip", slip, printerConfig);
        }
        if (selectedOption.print_labels) {
          const labels = buildCupLabels({ orderId: orderRow.id, cart });
          for (const l of labels) {
            await printByRole("cup_label", l, printerConfig);
          }
        }
      }

      await supabase
        .from("open_tickets")
        .delete()
        .eq("order_type", diningOption);

      showToast("success", "Charged Successfully", "Transaction saved and synced to logs.");
      clearTicketSoft(); 
      setPaymentOpen(false);
    } catch (err) {
      console.error("Execution failed:", err);
      showToast("error", "Execution Failed", err.message || "An error occurred.");
    } finally {
      setCharging(false);
    }
  }

  // FIXED RELIABLE LOWERCASE NORMALIZATION LOOKUP STREAM
  const handleCodeInput = (raw) => {
    const q = String(raw || "").trim().toLowerCase();
    if (!q) return;

    const matchItem = items.find((i) => i.sku?.toLowerCase() === q || i.name?.toLowerCase() === q);
    if (matchItem) {
      setSelectedItemForModal(matchItem);
      setCustomerSearch("");
      return;
    }

    const matchCust = customers.find(
      (c) => 
        (c.code && String(c.code).toLowerCase() === q) || 
        (c.name && String(c.name).toLowerCase().includes(q))
    );
    
    if (matchCust) {
      setAttachedCustomer(matchCust);
      setCustomerSearch("");
      setIsCustListOpen(false);
      showToast("success", "Customer Linked", matchCust.name);
    } else {
      showToast("warn", "No Profile Match", `"${raw}" matched no local loyalty records.`);
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

  const clearTicketSoft = () => {
    setCart([]);
    setAttachedCustomer(null); 
    setCustomerSearch("");
    setAppliedVoucher(null);
    setAvailableVouchers([]);
    setVoucherModalOpen(false);
    setVoucherTargetCartItemId(null);
    setAppliedDiscount(null);
    setSelectedPayment("");
    setSplitMode(false);
    setSplitSelected([]);
    setOriginalTicketId(null);
  };

  const clearTicket = () => {
    clearTicketSoft();
    setConfirmOpen(false);
    setTicketDrawerOpen(false);
  };

  const toggleSplit = () => {
    const nextSplitMode = !splitMode;
    if (nextSplitMode) {
      const confirmSplit = confirm("Enter item selection mode? Click on line items to pick target split lines.");
      if (!confirmSplit) return;
    }
    setSplitMode(nextSplitMode);
    setSplitSelected([]);
  };

  const toggleSplitSelect = (cartItemId) => {
    setSplitSelected((prev) =>
      prev.includes(cartItemId) ? prev.filter((id) => id !== cartItemId) : [...prev, cartItemId]
    );
  };

  const splitSelectedLines = useMemo(() => cart.filter((x) => splitSelected.includes(x.cartItemId)), [cart, splitSelected]);

  const moveToNewTicketPickType = () => {
    if (!splitSelected.length) return showToast("info", "Select Items", "Choose items to move first.");
    setDiningOptionPickOpen(true);
  };

  const createNewTicketWithItems = async (newType) => {
    setDiningOptionPickOpen(false);
    if (!newType) return;

    const movingItems = splitSelectedLines;
    if (!movingItems.length) return;

    const confirmShift = confirm(`Shift selected items over to ${newType}?`);
    if (!confirmShift) return;

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
    } catch (err) {
      showToast("error", "Move Error", err.message);
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

    const confirmMove = confirm(`Merge selected items into the existing saved ticket for "${ticket.order_type || ticket.ticket_name}"?`);
    if (!confirmMove) return;

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

  const selectedCartItem = useMemo(() => cart.find((x) => x.cartItemId === voucherTargetCartItemId) || null, [cart, voucherTargetCartItemId]);
  const ticketTitle = diningOption || "Select Dining Option";
  const ticketSubtitle = attachedCustomer?.name ? `Loyalty Member: ${attachedCustomer.name}` : "Walk-in Customer";

  function pickTemplate(name) {
    setDiningOption(name);
    showToast("success", "Ticket Selected", name);
  }

  function applyDiscountRule(rule) {
    setAppliedDiscount(rule);
    showToast("success", "Discount Applied", rule.name);
  }

  function clearDiscountRule() {
    setAppliedDiscount(null);
    showToast("info", "Discount Removed", "No discount applied.");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

            return (
            <div className="min-h-screen bg-[#FFF5F7] pb-24 lg:pb-0">

              {/* ✅ SINGLE CENTER CONTAINER */}
              <div className="max-w-7xl mx-auto px-4 md:px-6">

                {/* ✅ HEADER */}
                <div className="py-5 flex items-center justify-between">

                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800">
                      POS Terminal
                    </h1>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      store_id: {storeId || "NOT SET"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-semibold">
                      {typeof window !== "undefined" ? localStorage.getItem("cashier_name") : ""}
                    </span>

                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("pos_store_id");
                        localStorage.removeItem("cashier_name");
                        window.location.href = "/login";
                      }}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
                    >
                      Logout
                    </button>
                  </div>

                </div>

                {/* ✅ YOUR GRID (IMPORTANT: remove max-w from here) */}
                <div className="pb-10 grid grid-cols-2 lg:grid-cols-[1fr_100px] gap-1">
                 
                </div>
              </div>
            

      {/* Complete Row / Metrics Strip Layout Nodes Cleaned and Dropped Completely */}

      <div className="max-w-full mx-auto px-4 md:px-6 pb-10 grid grid-cols-2 lg:grid-cols-[1fr_420px] gap-1">
        
        {/* Menu Catalog View Panel */}
        <div className="bg-white rounded-2xl border border-rose-100 p-4 md:p-5 shadow-sm h-full">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <button
              onClick={() => setCategoryOpen(true)}
              className="bg-slate-50 px-4 py-2.5 rounded-1xl text-xs font-bold text-slate-700 border border-slate-200 active:scale-95 transition"
              type="button"
            >
              {activeCategory || "Select Category"} ▾
            </button>
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search menu catalogue..."
              className="w-full max-w-[240px] px-4 py-2.5 bg-slate-50 rounded-1xl text-xs outline-none focus:bg-white focus:border-rose-200 border border-slate-200 transition font-medium text-slate-700"
            />
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            {items
              .filter((i) => i.category === activeCategory)
              .filter((i) => (i.name || "").toLowerCase().includes(menuSearch.toLowerCase()))
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItemForModal(item)}
                  className="group relative flex flex-col p- bg-white border border-slate-100 rounded-1xl cursor-pointer transition-all text-left hover:-translate-y-[4px] hover:shadow-[0_40px_40px_rgba(252,104,125,0.08)]"
                >
                  <div className="w-full aspect-square bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden rounded-2xl">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-contain p-2 animate-fadeIn" />
                    ) : (
                      <span className="text-2xl opacity-40">📷</span>
                    )}
                  </div>
                  <div className="mt-2.5 space-y-0.5">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{item.category || "General"}</p>
                    <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{item.name}</p>
                    <p className="text-xs font-bold text-rose-500/90">{item.is_variable_price ? "Variable" : `₱${Number(item.price || 0).toFixed(0)}`}</p>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Dynamic Minimalist Sidebar Panel */}
        <div className="hidden lg:block h-full">
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
            diningOptions={diningOptions}
            diningOption={diningOption}
            setDiningOption={handleDiningChange}
            subtotal={totalDue}
            ticketTitle={ticketTitle}
            ticketSubtitle={ticketSubtitle}
            attachedCustomer={attachedCustomer}
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
            onVoidLiveTicket={handleVoidCurrentTicket}
            onOpenSavedTicketsModal={async () => {
              await fetchSavedTickets();
              setSavedMode("resume");
              setSavedOpen(true);
            }}
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

      {/* Mobile Footers */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-rose-100 shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
        <button
          onClick={() => setTicketDrawerOpen(true)}
          className="w-full px-4 py-4 flex items-center justify-between active:scale-[0.99]"
        >
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Live Balance</p>
            <p className="text-sm font-semibold text-slate-800">{itemCount} item{itemCount === 1 ? "" : "s"} • {peso0(totalDue)}</p>
            {attachedCustomer?.name && <p className="text-[11px] text-rose-500 font-semibold tracking-wide">Customer: {attachedCustomer.name}</p>}
            {appliedVoucher?.code && <p className="text-[11px] text-[#FC687D] font-mono mt-0.5">Voucher: {appliedVoucher.code}</p>}
            {appliedDiscount?.name && <p className="text-[11px] text-slate-600 mt-0.5">Discount: {appliedDiscount.name}</p>}
          </div>
          <div className="text-slate-500">🛒</div>
        </button>
      </div>

      {/* Mobile Side Sheet Drawer */}
      {ticketDrawerOpen && (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-end" onClick={() => setTicketDrawerOpen(false)}>
          <div className="w-full max-h-[88vh] bg-slate-900 text-white rounded-t-3xl p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
              diningOptions={diningOptions}
              diningOption={diningOption}
              setDiningOption={handleDiningChange}
              subtotal={totalDue}
              ticketTitle={ticketTitle}
              ticketSubtitle={ticketSubtitle}
              attachedCustomer={attachedCustomer}
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
              onVoidLiveTicket={handleVoidCurrentTicket}
              onOpenSavedTicketsModal={async () => {
                await fetchSavedTickets();
                setSavedMode("resume");
                setSavedOpen(true);
              }}
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

      {/* Floating Dialog Portals */}
      <CategoryModal open={categoryOpen} onClose={() => setCategoryOpen(false)} categories={categories} active={activeCategory} onSelect={setActiveCategory} />
      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={(txt) => handleCodeInput(txt)} />
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
        onVoid={(t) => voidTicket(t.id)}
      />
      <DiningOptionModal open={diningOptionPickOpen} onClose={() => setDiningOptionPickOpen(false)} options={diningOptions} onPick={createNewTicketWithItems} />
      <VouchersModal
        open={voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        vouchers={availableVouchers}
        appliedVoucher={appliedVoucher}
        selectedCartItem={selectedCartItem}
        onApply={(v) => { applyVoucherToTicket(v); setVoucherModalOpen(false); }}
        onRemove={() => { removeAppliedVoucher(); setVoucherModalOpen(false); }}
      />
      {selectedItemForModal && <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={onAddToCart} />}
      <ConfirmModal open={confirmOpen} title="Clear live workspace?" message="This will remove un-saved current entries from active memory." onCancel={() => setConfirmOpen(false)} onConfirm={clearTicket} />
      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} paymentTypes={paymentTypes} selectedPayment={selectedPayment} onSelect={(name) => setSelectedPayment(name)} onConfirm={confirmCharge} total={totalDue} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} />
      <ReceiptPreviewModal open={receiptOpen} onClose={() => setReceiptOpen(false)} receiptText={receiptText} />
    </div>
  );
}