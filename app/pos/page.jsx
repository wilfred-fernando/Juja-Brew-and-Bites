"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import TicketPanel from "@/components/pos/TicketPanel";

// Initialize Supabase Client instance cleanly at layout bundle level
const supabaseGlobalInstance = getSupabaseClient();

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
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

// ================= BLE PRINT =================

async function bleConnect(serviceUuid, characteristicUuid) {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [serviceUuid],
  });

  const server = await device.gatt?.connect();
  const service = await server?.getPrimaryService(serviceUuid);
  const characteristic = await service?.getCharacteristic(characteristicUuid);

  return characteristic;
}

async function blePrint(characteristic, text) {
  const bytes = new TextEncoder().encode(text + "\n\n");

  for (let i = 0; i < bytes.length; i += 180) {
    await characteristic.writeValueWithoutResponse(bytes.slice(i, i + 180));
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
  diningOptionName,
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

  lines.push(`Dining: ${diningOptionName || "-"}`);
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
    ...cart.map((x) => `${x.quantity}x ${x.name}`),
  ].join("\n");
}

function buildCupLabels({ orderId, cart }) {
  const labels = [];
  cart.forEach((x) => {
    for (let i = 0; i < x.quantity; i++) {
      labels.push(`${x.name}\nOrder ${orderId}`);
    }
  });
  return labels;
}

const peso0 = (n) => `₱${Number(n || 0).toFixed(0)}`;
const peso2 = (n) => `₱${Number(n || 0).toFixed(2)}`;

function printReceiptText(receiptText, opts = {}) {
  const { title = "Receipt", widthMm = 80, fontSize = 12, lineHeight = 1.25 } = opts;

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
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      padding: 8px;
      color: #000;
    }
    .receipt { white-space: pre-wrap; word-break: break-word; }
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
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

// ================= MODALS & SYSTEM UI =================

function ModalShell({ open, onClose, title, subtitle, children, z = 120 }) {
  if (!open) return null;
  return (
    <div
      style={{ zIndex: z }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 md:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">{title}</p>
            {subtitle ? (
              <h3 className="text-lg font-bold text-slate-800 mt-0.5 truncate">{subtitle}</h3>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 font-semibold"
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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] px-4 w-full max-w-md">
      <div className={`${tone} text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 w-full animate-in fade-in slide-in-from-top-4`}>
        <div className="text-sm leading-snug flex-1">
          <div className="font-bold">{toast.title || "Notice"}</div>
          {toast.message ? <div className="text-white/90 text-xs mt-0.5">{toast.message}</div> : null}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center font-bold text-xs"
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
      <p className="text-sm font-medium text-slate-600 leading-relaxed">{message}</p>
      <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold active:scale-95 transition"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold active:scale-95 transition shadow-sm"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(categories || []).map((cat) => {
          const isActive = active === cat.name;
          return (
            <button
              key={cat.id}
              onClick={() => {
                onSelect(cat.name);
                onClose();
              }}
              className={`w-full text-left p-3.5 rounded-xl border font-bold text-sm transition ${
                isActive
                  ? "border-rose-400 bg-rose-50 text-rose-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {cat.name}
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
          { fps: 10, qrbox: { width: 240, height: 240 } },
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
    <ModalShell open={open} onClose={() => { stopScanner(); onClose(); }} title="Barcode Scanner" subtitle="Scan code" z={145}>
      <p className="text-xs text-slate-500 font-medium">Scan customer code or item SKU. Camera permissions are required.</p>
      {step === "intro" && (
        <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
          <p className="text-sm font-bold text-slate-800">Camera Access Requested</p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">Tap start below and grant permission to activate the live layout scanning lens window.</p>
          <button
            onClick={startScanner}
            className="w-full mt-4 h-11 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-wider"
          >
            Start Scanner
          </button>
        </div>
      )}
      {step === "scanning" && (
        <div className="mt-4">
          {errMsg && <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-semibold">{errMsg}</div>}
          <div id="pos-scan-area" className="rounded-xl overflow-hidden border border-slate-200 shadow-inner" />
          <button
            onClick={() => { stopScanner(); onClose(); }}
            className="w-full mt-4 h-11 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function SavedTicketsModal({ open, onClose, tickets, onSelect, onRefresh, onVoid, mode = "resume" }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Saved Tickets" subtitle={mode === "move" ? "Move Items" : "Resume"} z={145}>
      <div className="flex mb-3">
        <button
          onClick={onRefresh}
          className="px-4 h-9 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
        >
          ↻ Refresh List
        </button>
      </div>
      {tickets.length === 0 ? (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium">No parked orders located.</div>
      ) : (
        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {tickets.map((t) => (
            <div key={t.id} className="p-3.5 border rounded-xl bg-white shadow-sm hover:border-rose-100 transition">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 text-left">
                  <p className="font-bold text-slate-800 text-sm truncate">{t.order_type || t.ticket_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Lines: {(t.items || []).length} • <span className="font-bold text-slate-700">₱{Number(t.total_amount || 0).toFixed(0)}</span></p>
                  <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">Client: {t._customerName || "Walk-in"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onVoid(t)}
                  className="text-xs text-red-500 font-bold hover:text-red-700 transition px-2 py-1 bg-red-50 rounded-md"
                >
                  VOID
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelect(t)}
                className="mt-3 w-full text-center h-9 rounded-lg bg-slate-50 hover:bg-rose-50 hover:text-[#FC687D] text-xs font-bold text-slate-700 transition"
              >
                {mode === "move" ? "Move selected lines here" : "Resume This Order"}
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full mt-4 h-11 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(options || []).map((opt) => (
          <button
            key={opt.id || opt.name}
            onClick={() => onPick(opt.name)}
            className="w-full text-left p-3.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            {opt.name}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="w-full mt-4 h-11 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider">Close</button>
    </ModalShell>
  );
}

function VouchersModal({ open, onClose, vouchers, appliedVoucher, selectedCartItem, onApply, onRemove }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Vouchers" subtitle="Apply Voucher" z={145}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3">
        <p className="text-xs text-slate-500 font-medium">Target selected line: <span className="font-bold text-slate-800">{selectedCartItem ? selectedCartItem.name : "None selected (tap a line item first)"}</span></p>
      </div>
      {appliedVoucher && (
        <div className="mb-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Active Coupon</p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">{appliedVoucher.code}</p>
          <button
            onClick={onRemove}
            className="mt-2.5 w-full h-9 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold"
          >
            Remove Voucher discount
          </button>
        </div>
      )}
      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
        {vouchers.length === 0 ? (
          <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-400 text-xs font-medium text-center">No structural active vouchers found.</div>
        ) : (
          vouchers.map((v) => {
            const disabled = !selectedCartItem;
            return (
              <button
                key={v.id}
                disabled={disabled}
                onClick={() => onApply(v)}
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-40"
              >
                <p className="text-sm font-bold text-slate-800">{v.code}</p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">{v.reward_text}</p>
                <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                  {v.reward_type === "birthday" ? "🎂 Birthday Special" : "🎁 Points Voucher"}
                  {v.expires_at ? ` • Exp: ${new Date(v.expires_at).toLocaleDateString()}` : ""}
                </p>
              </button>
            );
          })
        )}
      </div>
      <button
        onClick={onClose}
        className="w-full mt-4 h-11 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider"
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
    <ModalShell open={!!item} onClose={onClose} title={item.editData ? "Modify Line Item" : "Configure Item Add"} subtitle={item.name} z={145}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
        Base ₱{basePrice.toFixed(0)}{variantPrice > 0 ? ` • Modifiers: +₱${variantPrice.toFixed(0)}` : ""}
      </div>
      
      <div className="mt-4">
        <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Quantity Selection</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "") { setQuantity(""); return; }
            const num = Number(val);
            if (!isNaN(num) && num >= 1) setQuantity(Math.floor(num));
          }}
          onBlur={() => { if (!quantity || quantity < 1) setQuantity(1); }}
          className="w-full h-11 bg-white border border-slate-200 rounded-xl text-center text-base font-bold text-slate-800 outline-none focus:border-[#FC687D]"
        />
      </div>

      {Array.isArray(item.variants) && item.variants.length > 0 && (
        <div className="mt-4 space-y-4 max-h-[30vh] overflow-y-auto pr-1">
          {item.variants.map((g) => {
            const isCollapsed = !!collapsed[g.id];
            const selectedCount = (selections[g.id] || []).length;

            return (
              <div key={g.id} className="space-y-2 border-b border-slate-50 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700">{g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{g.isMultiSelect ? "Multi-select" : "Single-select"}{selectedCount > 0 ? ` • Active: ${selectedCount}` : ""}</p>
                  </div>
                  {!g.isRequired && (
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [g.id]: !p[g.id] }))}
                      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 bg-white"
                    >
                      {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(g.options || []).map((o) => {
                      const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(g, o)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left ${
                            sel ? "border-rose-400 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span>{o.name}</span>
                          <span className="text-slate-400 text-[11px]">{Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "FREE"}</span>
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
        <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Special Instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Less sweetener, separate packing, modifiers info..."
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none h-16 resize-none font-medium text-slate-700"
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
        className="w-full mt-5 h-12 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition disabled:opacity-50"
      >
        {item.editData ? `Save Changes • ₱${totalLine}` : `Append to order • ₱${totalLine}`}
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
    isNaN(amt) ||
    amt <= 0 ||
    (isCash && amt < due);

  return (
    <ModalShell open={open} onClose={onClose} title="Payment" subtitle="Select Payment Type" z={150}>
      <div className="space-y-4">
        {(paymentTypes || []).length === 0 ? (
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
            No system configurations available for merchant settlement modes.
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
                className={`h-11 rounded-xl border text-xs font-bold uppercase tracking-wider transition ${
                  selectedPayment === p.name
                    ? "border-rose-300 bg-rose-50 text-[#FC687D]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 shadow-inner">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">{isCash ? "Cash Collected tender" : "Processing Value"}</p>
            <div className="mt-1.5 flex items-center gap-2 bg-white px-3 h-11 border border-slate-200 rounded-lg">
              <span className="text-slate-400 font-bold text-sm">₱</span>
              <input
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  setPaymentAmount(v);
                }}
                placeholder={String(Number(total || 0).toFixed(2))}
                className="w-full bg-transparent font-bold text-slate-800 text-sm outline-none"
              />
            </div>
          </div>

          <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200/60 font-semibold text-slate-600">
            <div className="flex justify-between"><span>Bill Total Due</span><span className="text-slate-900 font-bold">{peso2(due)}</span></div>
            <div className="flex justify-between"><span>Tendered</span><span>{peso2(amt)}</span></div>
            {isCash ? (
              <div className="flex justify-between text-emerald-600 font-bold border-t border-dashed border-slate-200 pt-1.5 mt-1">
                <span>Change Allocation</span>
                <span className="text-sm font-extrabold">{peso2(change)}</span>
              </div>
            ) : remaining > 0 ? (
              <div className="flex justify-between text-orange-600"><span>Unsettled Margin</span><span className="font-bold">{peso2(remaining)}</span></div>
            ) : null}
            {isCash && amt < due ? <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ Warning: Tendered value lower than order subtotal due.</p> : null}
          </div>
        </div>

        <button
          disabled={disableConfirm}
          onClick={() => onConfirm({ amountPaid: amt, changeDue: change })}
          className="w-full h-12 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition disabled:opacity-40"
        >
          Finalize Transaction • {peso0(total)}
        </button>
      </div>
    </ModalShell>
  );
}

function ReceiptPreviewModal({ open, onClose, receiptText }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Receipt Printout" subtitle="Slip Log Preview" z={160}>
      <pre className="whitespace-pre-wrap text-xs bg-slate-900 text-slate-100 font-mono rounded-xl p-4 shadow-inner max-h-[40vh] overflow-y-auto">{receiptText || "No active buffer logged."}</pre>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider"
        >
          Dismiss
        </button>
        <button
          onClick={() => printReceiptText(receiptText, { widthMm: 80 })}
          className="w-full h-11 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider shadow-sm"
        >
          Print Thermal
        </button>
      </div>
    </ModalShell>
  );
}
// ================= PRINT HELPERS / TEXT BUILDERS END =================

function discountAmountFromRule(rule, subtotal) {
  if (!rule) return 0;
  const type = String(rule.type || "").toLowerCase();
  const value = Number(rule.value || 0);

  if (type === "percent") return subtotal * (value / 100);
  if (type === "fixed") return value;
  if (type === "comp") return subtotal;
  return 0;
}
// ================= MAIN TERMINAL SCREEN =================

export default function POSPage() {
  const supabase = getSupabaseClient();
  const [storeId, setStoreId] = useState(null);
  const [isMounted, setIsMounted] = useState(false);

  // PWA Add To Home Screen Hook States
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const [printerConfig, setPrinterConfig] = useState({ receipt: null, order_slip: null, cup_label: null });
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);
  const [tables] = useState([]);

  const [paymentTypes, setPaymentTypes] = useState([]);
  const [, setTicketTemplates] = useState([]);
  const [, setDiscountRules] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(null);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [diningOption, setDiningOption] = useState("");
  const hasInitializedDining = useRef(false);

  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [availableVouchers, setAvailableVouchers] = useState([]);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherTargetCartItemId, setVoucherTargetCartItemId] = useState(null);
  const [appliedDiscount, setAppliedDiscount] = useState(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptText, setReceiptText] = useState("");

  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedTickets, setSavedTickets] = useState([]);
  const [savedMode, setSavedMode] = useState("resume");
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState([]);
  const [diningOptionPickOpen, setDiningOptionPickOpen] = useState(false);

  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [moving, setMoving] = useState(false);

  const selectedDining = useMemo(
    () => (diningOptions || []).find((d) => String(d.id) === String(diningOption)) || null,
    [diningOptions, diningOption]
  );

  const diningOptionName = selectedDining?.name || "";

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 2200);
  };

  const calcTotal = (lines) =>
    (lines || []).reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0);

  const subtotal = useMemo(() => calcTotal(cart), [cart]);

  const discountAmount = useMemo(() => {
    const amt = discountAmountFromRule(appliedDiscount, subtotal);
    return Math.max(0, Math.min(subtotal, amt));
  }, [appliedDiscount, subtotal]);

  const totalDue = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0), [cart]);

  const selectedCartItem = useMemo(() => cart.find((x) => x.cartItemId === voucherTargetCartItemId) || null, [cart, voucherTargetCartItemId]);
  const ticketTitle = diningOptionName || "Select Dining Option";
  const ticketSubtitle = attachedCustomer?.name ? `Loyalty Member: ${attachedCustomer.name}` : "Walk-in Customer";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ================= PWA INSTALLATION EVENT HANDLER =================
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent standard browser trigger overlay automatically
      e.preventDefault();
      // Cache event payload locally inside dynamic component states
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Close banner if the terminal environment discovers it is already running standalone
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleExecuteInstall = async () => {
    if (!installPrompt) return;
    
    // Open standard browser system prompt modal window overlay
    installPrompt.prompt();
    
    const { outcome } = await installPrompt.userChoice;
    console.log(`PWA native setup dialogue window complete selection outcome: ${outcome}`);
    
    // Clear back buffer allocation tracking cleanly
    setInstallPrompt(null);
    setShowInstallBanner(false);
  };

  // REALTIME LISTENER: Vetted connection logic to capture live web order alerts
  useEffect(() => {
    if (!storeId) return;

    console.log("📡 Initializing permanent live web checkout tracking channel for store ID:", storeId);

    const channel = supabaseGlobalInstance
      .channel("pos-incoming-web-orders")
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "orders" 
        },
        (payload) => {
          const incomingOrder = payload.new;
          console.log("🔔 Database row insert intercepted by POS page:", incomingOrder);

          const isTargetedBranch = String(incomingOrder.branch_id).trim().toLowerCase() === String(storeId).trim().toLowerCase();

          if (isTargetedBranch) {
            console.log("🎯 Order matched this station code parameters successfully!", incomingOrder);
            
            showToast(
              "success", 
              "Incoming Web Order 🍽️", 
              `New order placed by customer: ${incomingOrder.customer_name || "Web Client"}`
            );
            
            try {
              const alertSound = new Audio("/sounds/notification.mp3");
              alertSound.play();
            } catch (audioErr) {
              console.warn("Audio Context message warning: Browser playback requires client element interaction pass:", audioErr);
            }
          } else {
            console.log(`⏭️ Order skipped: Intended for branch "${incomingOrder.branch_id}", but this station is running "${storeId}"`);
          }
        }
      )
      .subscribe((status) => {
        console.log("🛰️ Realtime channel handshake registration status:", status);
      });

    return () => {
      supabaseGlobalInstance.removeChannel(channel);
    };
  }, [storeId]);

  // TEMPORARY GLOBAL DEBUG LISTENER
  useEffect(() => {
    const channel = supabase
      .channel("pos-global-debug")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          console.log("🚨 DEBUG SNOOPER INTERCEPTED ROW:", payload.new);
          alert(`Order Detected! Branch column value is: ${payload.new.branch_id}`);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!ticketDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [ticketDrawerOpen]);

  useEffect(() => {
    if (!attachedCustomer?.id) return;
    let isActive = true;

    (async () => {
      const v = await fetchActiveVouchers(attachedCustomer.id);
      if (v.length > 0 && isActive) setVoucherModalOpen(true);
    })();

    return () => { isActive = false; };
  }, [attachedCustomer?.id]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, role, store_id, full_name")
        .eq("id", session.user.id)
        .single();

      if (pErr || !profile) {
        console.error("Profile Trace Error:", pErr);
        showToast("error", "Profile Error", "Failed to resolve terminal footprint.");
        return;
      }

      const role = String(profile?.role || "").toLowerCase();
      if (role !== "cashier" && role !== "admin") {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      const activeStoreId = profile.store_id;
      localStorage.setItem("pos_store_id", activeStoreId);
      setStoreId(activeStoreId);

      await fetchData(activeStoreId);
    };

    init();
  }, []);

  async function loadPrinters(sid) {
    if (!sid) return;
    const { data, error } = await supabase
      .from("pos_printers")
      .select("*")
      .eq("store_id", sid)
      .eq("is_active", true);

    if (error) {
      showToast("error", "Printer Error", error.message);
      return;
    }

    const map = { receipt: null, order_slip: null, cup_label: null };
    (data || []).forEach((p) => { map[p.role] = p; });
    setPrinterConfig(map);
  }

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
        reward_type: x.reward_type || (String(x.code || "").toUpperCase().startsWith("BDAY") ? "birthday" : "reward"),
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

  async function loadPosSettings(sid) {
    if (!sid) return;
    const normalize = (s) => String(s ?? "").trim().toLowerCase();

    const mergeGlobalThenStore = (rows) => {
      const map = new Map();
      (rows || []).filter((r) => r.store_id == null).forEach((r) => {
        const key = normalize(r.name);
        if (key) map.set(key, r);
      });
      (rows || []).filter((r) => r.store_id === sid).forEach((r) => {
        const key = normalize(r.name);
        if (key) map.set(key, r);
      });
      return Array.from(map.values()).sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      });
    };

    const [payRes, dineRes, ticketRes, discRes, receiptRes] = await Promise.all([
      supabase.from("pos_payment_types").select("*").or(`store_id.eq.${sid},store_id.is.null`).eq("is_active", true),
      supabase.from("pos_dining_options").select("*").eq("store_id", sid).eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("pos_open_ticket_templates").select("*").eq("store_id", sid),
      supabase.from("pos_discounts").select("*").eq("store_id", sid),
      supabase.from("pos_receipt_settings").select("*").eq("store_id", sid).maybeSingle(),
    ]);

    const mergedPaymentTypes = mergeGlobalThenStore(payRes.data || []);
    setPaymentTypes(mergedPaymentTypes);
    setDiningOptions(dineRes.data || []);
    setTicketTemplates(ticketRes.data || []);
    setDiscountRules(discRes.data || []);
    setReceiptSettings(receiptRes.data || null);

    if (!hasInitializedDining.current && (dineRes.data || []).length > 0) {
      setDiningOption(dineRes.data[0].id);
      hasInitializedDining.current = true;
    }
  }

  async function fetchData(sid) {
    if (!sid) return;
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

      await loadPosSettings(sid);
      await loadPrinters(sid);
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

  async function handleDiningChange(optionId) {
    setDiningOption(optionId);
    const opt = (diningOptions || []).find((d) => String(d.id) === String(optionId));
    const name = opt?.name || "";

    if (!name) {
      setOriginalTicketId(null);
      setCart([]);
      setAttachedCustomer(null);
      return;
    }

    await loadDiningOptionOrder(name);
  }

  async function saveTableOrder() {
    if (!diningOption) return;
    const name = diningOptionName;
    if (!name) return;

    const payload = {
      ticket_name: name,
      order_type: name,
      customer_id: attachedCustomer?.id || null,
      items: cart,
      total_amount: Number(subtotal || 0),
    };

    if (originalTicketId) {
      const { error } = await supabase.from("open_tickets").update(payload).eq("id", originalTicketId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("open_tickets").insert([payload]);
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

  async function resumeTicket(t) {
    setOriginalTicketId(t.id);
    setCart(t.items || []);
    const name = t.order_type || t.ticket_name || "";
    const opt = (diningOptions || []).find((d) => d.name === name);
    setDiningOption(opt?.id || "");
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

  async function handleSaveTicket() {
    if (savingTicket) return;
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before saving.");
    if (!diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");

    const confirmSave = confirm(`Are you sure you want to park this current ticket to "${diningOptionName || "Dining Option"}"?`);
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
    if (!diningOptionName) return showToast("error", "Dining Option Required", "Please select a dining option.");

    const confirmVoid = confirm(`Void entire current live ticket for "${diningOptionName}"? This clears all items permanently.`);
    if (!confirmVoid) return;

    setSavingTicket(true);
    try {
      await supabase.from("open_tickets").delete().eq("order_type", diningOption);
      await supabase.from("open_tickets").delete().eq("order_type", diningOptionName);
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
    if (!diningOptionName) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (!storeId) return showToast("error", "Store not set", "Set workspace identifier strings.");
    setPaymentOpen(true);
  }

  async function confirmCharge() {
    if (charging) return;
    if (!selectedPayment) return showToast("error", "Payment Required", "Select a payment type.");
    if (!storeId) return showToast("error", "Store not set", "Store code identifier mismatch.");
    if (!diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (!diningOptionName) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before charging.");

    setCharging(true);
    try {
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

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert([{
          store_id: storeId,
          customer_id: attachedCustomer?.id || null,
          total,
          discount,
          payment_method: selectedPayment,
          dining_option: diningOptionName,
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

      const now = new Date();
      const excelTimestamp = now.toLocaleString('en-US', {
        year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }).replace(/,/g, '');

      const generatedReceiptNumber = `2-${Math.floor(1000 + Math.random() * 9000)}`;
      const calculatedGrossSales = cart.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 0)), 0);
      const calculatedNetSales = calculatedGrossSales - discount;

      const csvDescriptionString = cart
        .map(item => `${item.quantity} x ${item.name}${item.variantDetails ? ` (${item.variantDetails})` : ''}`)
        .join(', ');

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
        dining_option: diningOptionName || "TAKEOUT",
        pos: "Cashier - Main",
        store: storeId,
        cashier_name: "Owner",
        customer_name: attachedCustomer?.name || "",
        customer_contacts: "",
        status: "Closed"
      };

      const { error: masterLogError } = await supabase.from("receipts").insert([masterReceiptLogPayload]);
      if (masterLogError) console.warn("Excel Master Log insertion error: ", masterLogError.message);

      const itemBreakdownLogPayloads = cart.map((item) => {
        const itemGross = Number(item.unitPrice || 0) * Number(item.quantity || 0);
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
          quantity: Number(item.quantity || 0).toFixed(3),
          gross_sales: itemGross.toFixed(2),
          discounts: lineProRatedDiscount.toFixed(2),
          net_sales: itemNet.toFixed(2),
          cost_of_goods: "0.00",
          gross_profit: itemNet.toFixed(2),
          taxes: "0.00",
          dining_option: diningOptionName || "TAKEOUT",
          pos: "Cashier - Main",
          store: storeId,
          cashier_name: "Owner",
          customer_name: attachedCustomer?.name || "",
          customer_contacts: "",
          comment: "",
          status: "Closed"
        };
      });

      const { error: itemsLogError } = await supabase.from("receipts_by_item").insert(itemBreakdownLogPayloads);
      if (itemsLogError) console.warn("Excel Item Log insertion error: ", itemsLogError.message);

      const receipt = buildReceiptText({
        receiptSettings, order: orderRow, cart, diningOptionName, payment: selectedPayment,
        customer: attachedCustomer, subtotal, discount, total, voucher: appliedVoucher, appliedDiscount,
      });

      setReceiptText(receipt);
      setReceiptOpen(true);

      if (receiptSettings?.auto_print) {
        await printByRole("receipt", receipt, printerConfig);
        if (selectedDining?.print_kitchen) {
          const slip = buildOrderSlipText({ orderId: orderRow.id, cart });
          await printByRole("order_slip", slip, printerConfig);
        }
        if (selectedDining?.print_labels) {
          const labels = buildCupLabels({ orderId: orderRow.id, cart });
          for (const l of labels) {
            await printByRole("cup_label", l, printerConfig);
          }
        }
      }

      await supabase.from("open_tickets").delete().eq("order_type", diningOptionName);
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
      setSavedOpen(false);
      showToast("success", "Moved", "Items moved to selected saved ticket.");
    } catch (err) {
      showToast("error", "Merge Error", err.message);
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
    } catch (err) {
      showToast("error", "Merge Error", err.message);
    } finally {
      setMoving(false);
    }
  };

  const onAddToCart = (addedLineItem) => {
    setCart((prevCart) => {
      const existsIdx = prevCart.findIndex(
        (x) =>
          x.id === addedLineItem.id &&
          x.variantDetails === addedLineItem.variantDetails &&
          x.instructions === addedLineItem.instructions &&
          !x.appliedVoucher
      );

      if (selectedItemForModal?.editData) {
        return prevCart.map((item, idx) =>
          idx === selectedItemForModal.editIndex ? addedLineItem : item
        );
      }

      if (existsIdx > -1) {
        return prevCart.map((item, idx) =>
          idx === existsIdx
            ? { ...item, quantity: item.quantity + addedLineItem.quantity }
            : item
        );
      }

      return [...prevCart, addedLineItem];
    });

    setSelectedItemForModal(null);
    showToast("success", "Item Added", addedLineItem.name);
  };

  return (
    <div className="min-h-screen bg-[#FFF5F7] pb-24 lg:pb-0 font-sans antialiased text-slate-800">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* PERSISTENT PWA INSTALLATION TRIGGER BANNER LAYOUT */}
      {showInstallBanner && (
        <div className="bg-gradient-to-r from-rose-500 to-[#FC687D] text-white py-2 px-4 shadow-sm flex items-center justify-between text-xs font-semibold select-none animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span>📱</span>
            <span>Run Juja POS directly as a fast desktop app on your terminal setup window dashboard footprint.</span>
          </div>
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
            <button 
              onClick={handleExecuteInstall} 
              className="bg-white text-slate-900 rounded-lg px-3 py-1 text-[11px] active:scale-95 transition"
            >
              Add To Screen
            </button>
            <button 
              onClick={() => setShowInstallBanner(false)} 
              className="text-white/80 hover:text-white px-2 py-1 text-sm font-normal"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-6 transition-all">
        
        {/* HEADER BAR */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-100 bg-white rounded-b-2xl p-4 shadow-sm mb-4 lg:mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">Juja POS Terminal</h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">Store Ref Footprint: {storeId || "DISCONNECTED"}</p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-600 font-bold tracking-wide">
                {isMounted && typeof window !== "undefined" ? (localStorage.getItem("cashier_name") || "Operator") : ""}
              </span>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                if (typeof window !== "undefined") {
                  localStorage.removeItem("pos_store_id");
                  localStorage.removeItem("cashier_name");
                }
                window.location.href = "/login";
              }}
              className="h-9 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-500 transition"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* MAIN TERMINAL RESPONSIVE GRID LAYOUT FLOW */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_450px] gap-4 lg:gap-6 items-start">
          
          {/* CATALOG AND MENU SHELF VIEW PANELS */}
          <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm space-y-4">
            
            {/* Catalog Controller Sorting filters bars */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <button
                onClick={() => setCategoryOpen(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition flex items-center justify-between gap-3"
                type="button"
              >
                <span>Category: <span className="text-[#FC687D]">{activeCategory || "None"}</span></span>
                <span>▼</span>
              </button>
              
              <div className="relative w-full sm:w-64">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                <input
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search catalogue items..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 outline-none border border-slate-200 focus:bg-white focus:border-rose-200 transition"
                />
              </div>
            </div>

            {/* Scaled Responsive Multi-Column Item Grid */}
            {loading ? (
              <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto" /></div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-4 gap-3 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
                {items
                  .filter((i) => i.category === activeCategory)
                  .filter((i) => (i.name || "").toLowerCase().includes(menuSearch.toLowerCase()))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemForModal(item)}
                      className="group bg-white border border-slate-100 rounded-2xl p-2.5 text-left hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col h-full justify-between"
                    >
                      <div className="w-full">
                        <div className="w-full aspect-square bg-[#FFF9FA] border border-rose-50/50 flex items-center justify-center overflow-hidden rounded-xl relative">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover p-1 group-hover:scale-102 transition" />
                          ) : (
                            <span className="text-2xl text-rose-200/50">📷</span>
                          )}
                        </div>
                        <div className="mt-2.5 px-0.5">
                          <p className="text-[9px] uppercase font-extrabold tracking-wider text-[#FC687D]">{item.category || "General"}</p>
                          <p className="text-xs font-bold text-slate-800 leading-tight truncate mt-1">{item.name}</p>
                        </div>
                      </div>
                      <p className="text-xs font-black text-slate-800 mt-2 px-0.5 pt-2 border-t border-slate-50 w-full">
                        {item.is_variable_price ? "Variable Price" : `₱${Number(item.price || 0).toFixed(0)}`}
                      </p>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* SIDEBAR TICKET INTERACTION LAYER PANEL */}
          <aside className="hidden lg:block bg-white border border-rose-100 rounded-2xl p-4 shadow-sm sticky top-6 max-h-[calc(100vh-140px)] overflow-y-auto">
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
                if (splitMode) { toggleSplitSelect(line.cartItemId); return; }
                setVoucherTargetCartItemId(line.cartItemId);
                const base = items.find((i) => i.id === line.id) || null;
                if (!base) return;
                setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
              }}
            />
          </aside>

        </div>
      </div>

      {/* MOBILE HUD INTERFACE BOTTOM FLOATING TRIGGER ACTION LAYER FOOTER */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white shadow-[0_-8px_30px_rgba(0,0,0,0.15)] px-4 py-3 pb-safe border-t border-slate-800">
        <button
          onClick={() => setTicketDrawerOpen(true)}
          className="w-full h-12 bg-[#FC687D] hover:bg-rose-500 rounded-xl px-4 flex items-center justify-between transition shadow-md active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-black">{itemCount}</span>
            <div className="text-left leading-tight">
              <p className="text-[10px] uppercase font-bold tracking-wider text-rose-100">Review Ticket Balance</p>
              <p className="text-sm font-black">{peso0(totalDue)}</p>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider bg-black/10 px-2.5 py-1 rounded-lg">View Cart 🛒</span>
        </button>
      </div>

      {/* MOBILE DRILLDOWN OVERLAY SLIDEUP DRAWER FOR TOUCH DEVICES */}
      {ticketDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end lg:hidden animate-in fade-in duration-200" onClick={() => setTicketDrawerOpen(false)}>
          <div className="w-full max-h-[85vh] bg-white rounded-t-[2rem] p-4 pb-safe overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛒</span>
                <h3 className="font-black text-slate-800 text-base">Active Order Ticket</h3>
              </div>
              <button
                onClick={() => setTicketDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
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
                  if (splitMode) { toggleSplitSelect(line.cartItemId); return; }
                  setVoucherTargetCartItemId(line.cartItemId);
                  const base = items.find((i) => i.id === line.id) || null;
                  if (!base) return;
                  setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
                }}
                onCloseMobile={() => setTicketDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* PORTALS LAYER MODAL SYSTEMS OVERLAYS */}
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
      
      {selectedItemForModal && (
        <AddToCartModal 
          item={selectedItemForModal} 
          onClose={() => setSelectedItemForModal(null)} 
          onAddToCart={onAddToCart} 
        />
      )}
      
      <ConfirmModal open={confirmOpen} title="Clear live workspace?" message="This will remove un-saved current entries from active memory." onCancel={() => setConfirmOpen(false)} onConfirm={clearTicket} />
      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} paymentTypes={paymentTypes} selectedPayment={selectedPayment} onSelect={(name) => setSelectedPayment(name)} onConfirm={confirmCharge} total={totalDue} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} />
      <ReceiptPreviewModal open={receiptOpen} onClose={() => setReceiptOpen(false)} receiptText={receiptText} />
    </div>
  );
}