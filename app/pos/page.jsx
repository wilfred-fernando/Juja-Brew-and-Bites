"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStableSession } from "@/lib/supabase/session";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { deductInventoryForOrder, restoreInventoryForOrder } from "@/lib/inventory";
import { markKdsTicketItemVoided, markKdsTicketStatus, upsertKdsTicket } from "@/lib/kds";
import TicketPanel from "@/components/pos/TicketPanel";
import { Bluetooth, Printer, RotateCcw, Save, Search, Trash2 } from "lucide-react";

// Initialize Supabase Client instance cleanly at layout bundle level
const supabaseGlobalInstance = getSupabaseClient();

const DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";
const THERMAL_PAPER_WIDTH_MM = 50;
const RECEIPT_COLUMNS = 32;
const RECEIPT_LOGO_URL = "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";
const POS_AUTO_REFRESH_MS = 5000;
const bluetoothPrinterDeviceCache = new Map();
const PRINTER_ROLE_LABELS = {
  receipt: "Bar",
  order_slip: "Kitchen",
  cup_label: "Cup Labels",
};
const PRINTER_ROLE_DEFAULT_WIDTH = {
  receipt: THERMAL_PAPER_WIDTH_MM,
  order_slip: 58,
  cup_label: 50,
};
const PRINTER_ROLE_HINTS = {
  receipt: "Receipt printer for bills and final receipts.",
  order_slip: "Kitchen order slip printer.",
  cup_label: "XP-Z58C Bluetooth label printer, 50mm x 40mm thermal sticker. Pairing password: 0000.",
};
const PRINTER_ROLE_STATUS = {
  receipt: "Final receipts",
  order_slip: "Kitchen tickets",
  cup_label: "50x40 labels",
};

function createPrinterProfile(role, source = {}) {
  return {
    id: source?.id || null,
    enabled: Boolean(source?.id || source?.is_active),
    name: source?.ble_device_name || source?.name || `${PRINTER_ROLE_LABELS[role] || "POS"} Printer`,
    model: source?.model || "Other model",
    interface: source?.interface || "Bluetooth",
    paper_width_mm: role === "cup_label" ? 50 : Number(source?.paper_width_mm || PRINTER_ROLE_DEFAULT_WIDTH[role] || THERMAL_PAPER_WIDTH_MM),
    service_uuid: source?.ble_service_uuid || DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID,
    characteristic_uuid: source?.ble_characteristic_uuid || DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID,
    device_id: source?.ble_device_id || "",
  };
}

function createPrinterProfiles(savedByRole = {}) {
  return Object.keys(PRINTER_ROLE_LABELS).reduce((profiles, role) => {
    profiles[role] = createPrinterProfile(role, savedByRole[role]);
    return profiles;
  }, {});
}

function normalizeBluetoothUuid(value, fallback = "") {
  return String(value || fallback).trim().toLowerCase();
}

function bluetoothDeviceCacheKeys(device, cfg = {}) {
  return [
    device?.id,
    device?.name,
    cfg?.ble_device_id,
    cfg?.ble_device_name,
    cfg?.name,
    "default",
  ].filter(Boolean);
}

function cacheBluetoothPrinterDevice(device, cfg = {}) {
  bluetoothDeviceCacheKeys(device, cfg).forEach((key) => {
    bluetoothPrinterDeviceCache.set(key, device);
  });
}

// ================= PRINT HELPERS =================

function print58mmTextBrowser(text) {
  const safe = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; margin: 0; padding: 0; background: #fff; }
      body { color: #020617; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.25; }
      .receipt { padding: 7px 8px 10px; }
      .logo { display: block; width: 30mm; max-width: 78%; margin: 4px auto 10px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: "Courier New", ui-monospace, monospace; font-size: 10.5px; line-height: 1.35; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <img class="logo" src="${RECEIPT_LOGO_URL}" alt="Juja Brew & Bites" />
      <pre>${safe}</pre>
    </div>
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

async function findSavedBluetoothDevice(cfg, serviceUuid) {
  const deviceKey = cfg?.ble_device_id || cfg?.ble_device_name || cfg?.name || cfg?.id || "default";
  const cached = bluetoothPrinterDeviceCache.get(deviceKey);
  if (cached) return cached;

  if (navigator.bluetooth?.getDevices) {
    const devices = await navigator.bluetooth.getDevices();
    const match = devices.find((device) => {
      if (cfg?.ble_device_id && device.id === cfg.ble_device_id) return true;
      if (cfg?.ble_device_name && device.name === cfg.ble_device_name) return true;
      if (cfg?.name && device.name === cfg.name) return true;
      const configuredName = String(cfg?.ble_device_name || cfg?.name || "").trim().toLowerCase();
      const deviceName = String(device.name || "").trim().toLowerCase();
      if (configuredName && deviceName && (configuredName.includes(deviceName) || deviceName.includes(configuredName))) return true;
      return false;
    });
    if (match) {
      cacheBluetoothPrinterDevice(match, cfg);
      return match;
    }
  }

  throw new Error("Bluetooth printer permission is not available in this browser. Open POS Settings, choose Select Xprinter Bluetooth Device, select the paired Xprinter once, then save it.");
}

async function bleConnect(cfg) {
  const serviceUuid = normalizeBluetoothUuid(cfg?.ble_service_uuid, DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID);
  const characteristicUuid = normalizeBluetoothUuid(
    cfg?.ble_characteristic_uuid,
    DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID
  );
  const device = await findSavedBluetoothDevice(cfg, serviceUuid);

  const server = await device.gatt?.connect();
  const service = await server?.getPrimaryService(serviceUuid);
  const characteristic = await service?.getCharacteristic(characteristicUuid);

  return characteristic;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

function buildEscPosPrintBytes(text, role) {
  const encoder = new TextEncoder();
  const safeText = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const isCupLabel = role === "cup_label";
  const init = Uint8Array.from([0x1b, 0x40]);
  const codePage = Uint8Array.from([0x1b, 0x74, 0x00]);
  const alignLeft = Uint8Array.from([0x1b, 0x61, 0x00]);
  const lineSpacing = isCupLabel ? Uint8Array.from([0x1b, 0x33, 0x18]) : Uint8Array.from([0x1b, 0x32]);
  const normalFont = Uint8Array.from([0x1b, 0x21, 0x00]);
  const textBytes = encoder.encode(`${safeText}\n`);
  const finish = isCupLabel
    ? Uint8Array.from([0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00])
    : Uint8Array.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);

  return concatBytes([init, codePage, alignLeft, lineSpacing, normalFont, textBytes, finish]);
}

async function blePrint(characteristic, text, role = "receipt") {
  const bytes = buildEscPosPrintBytes(text, role);

  for (let i = 0; i < bytes.length; i += 180) {
    await characteristic.writeValueWithoutResponse(bytes.slice(i, i + 180));
  }
}

// ================= PRINT ROUTER =================

async function printByRole(role, text, printerConfig, opts = {}) {
  const cfg = printerConfig?.[role];
  const fallbackToBrowser = opts.fallbackToBrowser !== false;

  if (!cfg) {
    if (fallbackToBrowser) print58mmTextBrowser(text);
    return false;
  }

  if (cfg.transport === "browser") {
    print58mmTextBrowser(text);
    return true;
  }

  try {
    const characteristic = await bleConnect(cfg);
    await blePrint(characteristic, text, role);
    return true;
  } catch (err) {
    console.warn("Bluetooth printing failed", err);
    throw err;
  }
}

// ================= TEXT BUILDERS =================

function receiptLine(char = "-", width = RECEIPT_COLUMNS) {
  return char.repeat(width);
}

function centerReceiptText(value, width = RECEIPT_COLUMNS) {
  const text = String(value || "");
  if (text.length >= width) return text;
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}`;
}

function splitReceiptText(value, width = RECEIPT_COLUMNS) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function receiptAmount(value) {
  return peso2(value).replace("₱", "P");
}

function coerceReceiptTimestamp(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const normalizedTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  return new Date(normalizedTimestamp);
}

function customerDisplayName(customer) {
  return customer?.name || customer?.customer_name || customer?.full_name || "";
}

function customerDisplayCode(customer) {
  return customer?.code || customer?.customer_code || "";
}

function customerAvailablePoints(customer) {
  return Number(customer?.availablePoints ?? customer?.available_points ?? customer?.["Available points"] ?? 0);
}

function formatReceiptFooterDate(value) {
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

function receiptPair(left, right, width = RECEIPT_COLUMNS) {
  const l = String(left || "");
  const r = String(right || "");
  const maxLeft = Math.max(0, width - r.length - 1);
  const safeLeft = l.length > maxLeft ? l.slice(0, Math.max(0, maxLeft - 1)) + "…" : l;
  return `${safeLeft}${" ".repeat(Math.max(1, width - safeLeft.length - r.length))}${r}`;
}

function formatReceiptDate(value) {
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return formatDateTime(new Date());
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function formatReceiptTime(value) {
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortReceiptNumber(value) {
  const text = String(value || "");
  const match = text.match(/(\d+)[^\d]*(\d+)$/);
  if (match) return `${match[1]}-${match[2]}`;
  return text.slice(-8) || text;
}

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
  printedAt,
  copyLabel,
  store,
  cashierName,
}) {
  const rs = receiptSettings || {};
  const lines = [];

  const header = (rs.header_text || "").trim();
  const footer = (rs.footer_text || "").trim();
  const branchName = store?.store_name || store?.name || store?.branch_name || "Pasong Tamo";
  const businessName = store?.business_name || "Juja Brew & Bites";
  const receiptTitle = store?.receipt_title || `${branchName}`;
  const address = store?.address || "36D Visayas Ave., Pasong Tamo, Quezon City";
  const receiptId = order.receipt_number || order.order_number || order.id;
  const dining = diningOptionName || order.dining_option || order.order_type || "-";
  const employee = cashierName || order.cashier_name || "Owner";
  const posName = `Cashier - ${branchName}`;
  const paidBy = payment || order.payment_method || "QRPH";
  const subtotalValue = Number(subtotal || 0);
  const discountValue = Number(discount || 0);
  const totalValue = Number(total || subtotalValue - discountValue || 0);
  const customerName = customerDisplayName(customer);
  const customerCode = customerDisplayCode(customer);
  const pointsEarned = customerName ? calcLoyaltyPoints(totalValue) : 0;
  const availablePoints = customerName ? Number((customerAvailablePoints(customer) + pointsEarned).toFixed(2)) : 0;

  lines.push(centerReceiptText(businessName));
  lines.push(centerReceiptText(header || receiptTitle));
  splitReceiptText(address, RECEIPT_COLUMNS).forEach((line) => lines.push(centerReceiptText(line)));
  lines.push(receiptLine());
  if (copyLabel) lines.push(centerReceiptText(copyLabel));
  lines.push(centerReceiptText(receiptAmount(totalValue)));
  lines.push(centerReceiptText("Total"));
  lines.push(receiptLine());

  if (rs.show_order_number !== false) lines.push(`Order: ${receiptId}`);
  if (rs.show_cashier !== false) lines.push(`Employee: ${employee}`);
  if (rs.show_store_name !== false) lines.push(`POS: ${posName}`);
  lines.push(receiptLine());

  if (customerName) {
    lines.push(`Customer: ${customerName}`);
    if (customerCode) lines.push(`Code: ${customerCode}`);
    lines.push(receiptLine());
  }

  lines.push(String(dining).toUpperCase());
  lines.push(receiptLine());

  if (voucher?.code) lines.push(`Voucher: ${voucher.code}`);
  if (appliedDiscount?.name) lines.push(`Discount: ${appliedDiscount.name}`);
  if (voucher?.code || appliedDiscount?.name) lines.push(receiptLine());

  cart.forEach((x) => {
    const quantity = Number(x.quantity || 1);
    const unitPrice = Number(x.unitPrice || 0);
    const lineTotal = unitPrice * quantity;
    const nameLines = splitReceiptText(x.name || "Item", RECEIPT_COLUMNS - 12);
    lines.push(receiptPair(nameLines[0], receiptAmount(lineTotal)));
    nameLines.slice(1).forEach((line) => lines.push(line));
    lines.push(`${quantity} x ${receiptAmount(unitPrice)}`);
    const variants = normalizeLabelLine(x.variantDetails || "");
    const instructions = normalizeLabelLine(x.instructions || x.specialInstructions || x.special_instructions || "");
    if (variants) splitReceiptText(variants, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    if (instructions) splitReceiptText(`Note: ${instructions}`, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
  });
  lines.push(receiptLine());
  if (customerName) {
    lines.push(receiptPair("Points earned", receiptAmount(pointsEarned)));
    lines.push(receiptPair("Available points", receiptAmount(availablePoints)));
    lines.push(receiptLine());
  }
  if (discountValue > 0) {
    lines.push(receiptPair("Subtotal", receiptAmount(subtotalValue)));
    lines.push(receiptPair("Discount", `-${receiptAmount(discountValue)}`));
  }
  lines.push(receiptPair("Total", receiptAmount(totalValue)));
  if (rs.show_payment_type !== false) lines.push(receiptPair(paidBy, receiptAmount(totalValue)));
  lines.push(receiptLine());

  lines.push(centerReceiptText("THIS IS NOT VALID"));
  lines.push(centerReceiptText("FOR CLAIM OF INPUT TAX"));
  lines.push(centerReceiptText("For Orders: 0939 9228383"));

  if (footer) {
    lines.push("");
    splitReceiptText(footer, RECEIPT_COLUMNS).forEach((line) => lines.push(centerReceiptText(line)));
  }

  lines.push("");
  lines.push(receiptPair(rs.show_datetime === false ? "" : formatReceiptFooterDate(printedAt || new Date()), `N° ${shortReceiptNumber(receiptId)}`));

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

function getLineCategoryId(line) {
  return line?.categoryId || line?.category_id || line?.menu_category_id || line?.category?.id || null;
}

function normalizeLabelLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildCupLabels({ orderId, cart, diningOptionName, printedAt, barCategoryIds = [], barCategoryNames = [] }) {
  const barIds = new Set((barCategoryIds || []).map((id) => String(id)));
  const barNames = new Set((barCategoryNames || []).map((name) => String(name || "").trim().toLowerCase()).filter(Boolean));
  if (barIds.size === 0 && barNames.size === 0) return [];

  const labels = [];
  cart.forEach((x) => {
    const categoryId = getLineCategoryId(x);
    const categoryName = String(x.category || x.categoryName || x.category_name || "").trim().toLowerCase();
    const matchesCategory = (categoryId && barIds.has(String(categoryId))) || (categoryName && barNames.has(categoryName));
    if (!matchesCategory) return;

    const dining = normalizeLabelLine(diningOptionName || "POS ORDER").toUpperCase();
    const itemName = normalizeLabelLine(x.name || "Item");
    const variants = normalizeLabelLine(x.variantDetails || "")
      .split(",")
      .map((value) => normalizeLabelLine(value))
      .filter(Boolean);
    const instructions = normalizeLabelLine(x.instructions || x.specialInstructions || x.special_instructions || "");
    const footer = normalizeLabelLine(`${formatReceiptDate(printedAt || new Date())}  #${shortReceiptNumber(orderId)}`);

    for (let i = 0; i < x.quantity; i++) {
      const lines = [
        dining,
        itemName,
        receiptLine("-", RECEIPT_COLUMNS),
        ...variants,
      ];
      if (instructions) lines.push(`Note: ${instructions}`);
      lines.push("");
      lines.push(footer);
      labels.push(lines.join("\n"));
    }
  });
  return labels;
}

const peso0 = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const peso2 = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function printReceiptText(receiptText, opts = {}) {
  const { title = "Receipt", widthMm = THERMAL_PAPER_WIDTH_MM, fontSize = 11, lineHeight = 1.25 } = opts;

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
      font-family: Arial, sans-serif;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      padding: 7px 8px 10px;
      color: #000;
    }
    .logo { display: block; width: 30mm; max-width: 78%; margin: 4px auto 10px; }
    .receipt { white-space: pre-wrap; word-break: break-word; font-family: "Courier New", ui-monospace, monospace; }
  </style>
</head>
<body>
  <img class="logo" src="${RECEIPT_LOGO_URL}" alt="Juja Brew & Bites" />
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
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200"
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
      : "bg-slate-700";

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

const TARGET_WEB_STATUSES = ["pending", "scheduled", "accepted", "ready", "completed", "Pending", "Scheduled", "Accepted", "Ready", "Completed"];
const calcLoyaltyPoints = (amount) => Number(((Number(amount) || 0) * 0.04).toFixed(2));
const SHIFT_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const POS_RECEIPT_HISTORY_DAYS = 15;

const getWebOrderStoreId = (order) => order?.store_id || order?.branch_id || null;
const buildStoreOrderFilter = (storeId) => `store_id.eq.${storeId},branch_id.eq.${storeId}`;
const isScheduledWebOrder = (order) => {
  const status = String(order?.status || order?.order_status || "").toLowerCase();
  if (status === "scheduled") return true;
  if (!order?.scheduled_for) return false;
  const scheduledAt = new Date(order.scheduled_for).getTime();
  return Number.isFinite(scheduledAt) && scheduledAt > Date.now() + 30 * 60 * 1000;
};

function playPosAlertSound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sound/notification.mp3");
  audio.volume = 0.95;
  audio.play().catch(() => playGeneratedPosTone());
}

function playGeneratedPosTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
    gain.connect(ctx.destination);

    [740, 988, 740].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.16);
      osc.connect(gain);
      osc.start(ctx.currentTime + idx * 0.16);
      osc.stop(ctx.currentTime + idx * 0.16 + 0.12);
    });
    setTimeout(() => ctx.close(), 800);
  } catch (err) {
    console.warn("POS alert sound skipped:", err);
  }
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

function PrinterPermissionModal({ open, roleLabel, onAllow, onCancel }) {
  return (
    <ModalShell open={open} onClose={onCancel} title="Printer Permission" subtitle={`Connect ${roleLabel || "Bluetooth Printer"}`} z={180}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
              <Printer size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Bluetooth permission is required.</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                Select the paired thermal printer in the next browser popup, then allow the connection so POS can print to this printer.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-600">
          Use Chrome or Edge on HTTPS or localhost. Keep the printer powered on and near this device before continuing.
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="h-12 rounded-xl bg-cyan-700 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-700/20 transition hover:bg-cyan-800 active:scale-[0.98]"
          >
            Allow & Select
          </button>
        </div>
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

function isVoidedLine(line) {
  const status = String(line?.status || line?.item_status || "").toLowerCase();
  return Boolean(line?.voided || line?.isVoided || line?.is_voided || status.includes("void") || status.includes("refund"));
}

function SavedTicketsModal({ open, onClose, tickets, onSelect, onRefresh, onVoid, onVoidItem, mode = "resume" }) {
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
          {tickets.map((t) => {
            const activeItems = (t.items || []).filter((line) => !isVoidedLine(line));
            return (
            <div key={t.id} className="p-3.5 border rounded-xl bg-white shadow-sm hover:border-rose-100 transition">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 text-left">
                  <p className="font-bold text-slate-800 text-sm truncate">{t.order_type || t.ticket_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Active lines: {activeItems.length} / {(t.items || []).length} • <span className="font-bold text-slate-700">{peso0(t.total_amount)}</span></p>
                  <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">Client: {t._customerName || "Walk-in"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onVoid(t)}
                  className="text-xs text-red-500 font-bold hover:text-red-700 transition px-2 py-1 bg-red-50 rounded-md"
                >
                  VOID TICKET
                </button>
              </div>
              <div className="mt-3 space-y-1.5">
                {(t.items || []).map((line, idx) => {
                  const voided = isVoidedLine(line);
                  return (
                    <div key={line.cartItemId || line.id || idx} className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs ${voided ? "border-red-200 bg-red-50 text-red-700 line-through decoration-2" : "border-slate-100 bg-slate-50 text-slate-700"}`}>
                      <span className="min-w-0 truncate font-semibold">{line.quantity || 1} x {line.name}</span>
                      {voided ? (
                        <span className="shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700 no-underline">Voided</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onVoidItem(t, line, idx)}
                          className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600 transition hover:bg-red-100"
                        >
                          Void Item
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onSelect(t)}
                disabled={activeItems.length === 0}
                className="mt-3 w-full text-center h-9 rounded-lg bg-slate-50 hover:bg-rose-50 hover:text-[#FC687D] text-xs font-bold text-slate-700 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {mode === "move" ? "Move selected lines here" : "Resume This Order"}
              </button>
            </div>
          );
          })}
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

function WebOrdersModal({ open, onClose, orders, onRefresh, onEdit, onReady, onDelivered }) {
  const statusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (s === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "ready") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "completed") return "bg-slate-100 text-slate-600 border-slate-200";
    return "bg-rose-50 text-rose-700 border-rose-200";
  };
  const activeOrders = orders.filter((order) => String(order.status || "").toLowerCase() !== "completed");

  return (
    <ModalShell open={open} onClose={onClose} title="Web Orders" subtitle="Pending & Accepted" z={145}>
      <div className="flex mb-3">
        <button
          onClick={onRefresh}
          className="px-4 h-9 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
        >
          ↻ Refresh List
        </button>
      </div>
      {activeOrders.length === 0 ? (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium">
          No pending or accepted web orders located.
        </div>
      ) : (
        <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
          {activeOrders.map((order) => {
            const status = String(order.status || "accepted").toLowerCase();
            const readyDisabled = status === "ready" || status === "completed";
            const deliveredDisabled = status === "completed";
            const total = Number(order.total || order.subtotal || 0);

            return (
              <div key={order.id} className="p-3.5 border rounded-xl bg-white shadow-sm hover:border-rose-100 transition">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 text-left">
                    <p className="font-bold text-slate-800 text-sm truncate">{order.customer_name || "Web Customer"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Lines: {(order.items || []).length} • <span className="font-bold text-slate-700">{peso2(total)}</span>
                    </p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">
                      {order.dining_option || "Web order"} {order.fulfillment_time ? `• ${order.fulfillment_time}` : ""}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-wider ${statusClass(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(order)}
                    className="h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={readyDisabled}
                    onClick={() => onReady(order)}
                    className="h-9 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700 transition disabled:opacity-40"
                  >
                    Ready
                  </button>
                  <button
                    type="button"
                    disabled={deliveredDisabled}
                    onClick={() => onDelivered(order)}
                    className="h-9 rounded-lg bg-[#FC687D] hover:bg-rose-500 text-xs font-bold text-white transition disabled:opacity-40"
                  >
                    Delivered
                  </button>
                </div>
              </div>
            );
          })}
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
      <button onClick={onClose} className="w-full mt-4 h-11 bg-rose-950 text-white rounded-xl font-bold text-xs uppercase tracking-wider">Close</button>
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
                  {v.expires_at ? ` • Exp: ${formatDate(v.expires_at)}` : ""}
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

/* ──────────────────────────────────────────────────────────────
    AddToCartModal Configuration Component
────────────────────────────────────────────────────────────── */
function optionGroupMaxSelection(group) {
  const value = Number(group?.maxSelection ?? group?.max_selection ?? group?.maxSelections ?? group?.max_selections);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
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
    (item.variants || []).filter((g) => g.isAvailable !== false && g.is_available !== false).forEach((g) => (c[g.id] = !g.isRequired));
    setCollapsed(c);
  }, [item]);

  if (!item) return null;

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find((o) => o.id === opt.id);
      const maxSelection = optionGroupMaxSelection(group);
      if (!exists && maxSelection && current.length >= maxSelection) return;
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
  const availableVariantGroups = (item.variants || []).filter((g) => g.isAvailable !== false && g.is_available !== false);
  const canAdd = availableVariantGroups.every((g) => !g.isRequired || (selections[g.id] || []).length > 0);

  const variantDetails = Object.values(selections)
    .flat()
    .map((o) => o.name)
    .join(", ");
  const selectedOptions = Object.entries(selections).flatMap(([groupId, options]) => {
    const group = availableVariantGroups.find((entry) => String(entry.id) === String(groupId)) || {};
    return (options || []).map((option) => ({
      id: option.id,
      name: option.name,
      price: Number(option.price) || 0,
      groupId,
      groupName: group.name || group.label || group.id || "Options",
    }));
  });

  const totalLine = (unitPrice * quantity).toFixed(0);
  const submitLine = () =>
    onAddToCart({
      id: item.id,
      name: item.name,
      category: item.category || item.category_name || null,
      categoryId: item.category_id || item.menu_category_id || null,
      unitPrice,
      quantity,
      variantDetails,
      selectedOptions,
      instructions,
      cartItemId: item.editData?.cartItemId || Date.now(),
    });

  return (
    <ModalShell open={!!item} onClose={onClose} title={item.editData ? "Modify Line Item" : "Configure Item Add"} subtitle={item.name} z={145}>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[16px] font-semibold text-slate-600">
          {peso0(basePrice)}{variantPrice > 0 ? ` • Modifiers: +${peso0(variantPrice)}` : ""}
        </p>
        <button
          disabled={!canAdd}
          onClick={submitLine}
          className="h-9 px-3 rounded-lg bg-slate-200 text-white text-[12px] font-semibold uppercase tracking-wider shadow-sm transition disabled:opacity-50 shrink-0"
        >
          {item.editData ? `Save • ₱${totalLine}` : `Add • ₱${totalLine}`}
        </button>
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

      {availableVariantGroups.length > 0 && (
        <div className="mt-4 space-y-4 max-h-[30vh] overflow-y-auto pr-1">
          {availableVariantGroups.map((g) => {
            const isCollapsed = !!collapsed[g.id];
            const selectedCount = (selections[g.id] || []).length;

            return (
              <div key={g.id} className="space-y-2 border-b border-slate-50 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700">{g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}</p>
                    <p className="text-[10px] text-slate-400 font-normal italic">
                      {g.isMultiSelect ? `Multi-select${optionGroupMaxSelection(g) ? ` up to ${optionGroupMaxSelection(g)}` : ""}` : "Single-select"}
                      {selectedCount > 0 ? ` • Active: ${selectedCount}` : ""}
                    </p>
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
                    {(g.options || []).filter((o) => o.isAvailable !== false && o.is_available !== false).map((o) => {
                      const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                      const maxSelection = optionGroupMaxSelection(g);
                      const blocked = !!(g.isMultiSelect && !sel && maxSelection && (selections[g.id] || []).length >= maxSelection);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(g, o)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left ${
                            sel ? "border-rose-400 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } ${blocked ? "opacity-45" : ""}`}
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

    </ModalShell>
  );
}

function PaymentModal({ open, onClose, paymentTypes, selectedPayment, onSelect, onConfirm, total, paymentAmount, setPaymentAmount }) {
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [splitPayments, setSplitPayments] = useState([]);
  const isCash = String(selectedPayment || "").toLowerCase().includes("cash");
  const amt = Number(paymentAmount || 0);
  const due = Number(total || 0);
  const availableTypes = paymentTypes || [];

  useEffect(() => {
    if (!open) return;
    setUseSplitPayment(false);
    setSplitPayments([
      { id: "split-1", method: availableTypes[0]?.name || selectedPayment || "", amount: "" },
      { id: "split-2", method: availableTypes[1]?.name || availableTypes[0]?.name || selectedPayment || "", amount: "" },
    ]);
  }, [open, selectedPayment, paymentTypes]);

  const change = isCash ? Math.max(0, amt - due) : 0;
  const remaining = Math.max(0, due - amt);
  const splitTotal = splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const splitRemaining = Math.max(0, due - splitTotal);
  const splitChange = Math.max(0, splitTotal - due);
  const splitReady = splitPayments.length > 1 && splitPayments.every((p) => p.method && Number(p.amount || 0) > 0) && splitTotal >= due;
  const roundCash = (value) => {
    if (value <= 100) return Math.ceil(value / 10) * 10;
    if (value <= 500) return Math.ceil(value / 50) * 50;
    return Math.ceil(value / 100) * 100;
  };
  const cashTenderSuggestions = Array.from(new Set([
    roundCash(due),
    ...[200, 500, 1000, 2000].filter((n) => n >= due),
  ]))
    .filter((n) => Number(n) > 0 && Number(n) >= due)
    .sort((a, b) => a - b)
    .slice(0, 6);

  const disableConfirm =
    useSplitPayment
      ? !splitReady
      : !selectedPayment ||
        !paymentAmount ||
        isNaN(amt) ||
        amt <= 0 ||
        (isCash && amt < due);

  const updateSplitPayment = (idx, patch) => {
    setSplitPayments((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addSplitRow = () => {
    setSplitPayments((prev) => [
      ...prev,
      { id: `split-${Date.now()}`, method: availableTypes[0]?.name || "", amount: "" },
    ]);
  };

  const removeSplitRow = (idx) => {
    setSplitPayments((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Payment" subtitle="Select Payment Type" z={150}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
          <div>
            <p className="text-xs font-black text-slate-800">Split Payment</p>
            <p className="text-[10px] font-semibold text-slate-500">Use two or more payment methods.</p>
          </div>
          <button
            type="button"
            onClick={() => setUseSplitPayment((v) => !v)}
            className={`h-7 w-12 rounded-full p-1 transition ${useSplitPayment ? "bg-[#FC687D]" : "bg-slate-200"}`}
            aria-label="Toggle split payment"
          >
            <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition ${useSplitPayment ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {(paymentTypes || []).length === 0 ? (
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
            No system configurations available for merchant settlement modes.
          </div>
        ) : useSplitPayment ? (
          <div className="space-y-2">
            {splitPayments.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center rounded-xl border border-slate-200 bg-white p-2">
                <select
                  value={row.method}
                  onChange={(e) => updateSplitPayment(idx, { method: e.target.value })}
                  className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none"
                >
                  {availableTypes.map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
                </select>
                <div className="flex items-center gap-1 h-10 rounded-lg border border-slate-200 bg-slate-50 px-2">
                  <span className="text-slate-400 font-bold text-xs">₱</span>
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateSplitPayment(idx, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                    className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSplitRow(idx)}
                  disabled={splitPayments.length <= 2}
                  className="h-10 w-10 rounded-lg border border-slate-200 text-slate-400 font-black disabled:opacity-30"
                >
                  x
                </button>
              </div>
            ))}
            <button type="button" onClick={addSplitRow} className="w-full h-9 rounded-xl border border-dashed border-rose-200 bg-rose-50 text-[10px] font-black uppercase tracking-wider text-[#FC687D]">
              Add Payment Line
            </button>
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
            {!useSplitPayment && isCash && (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {cashTenderSuggestions.map((suggestion, idx) => (
                  <button
                    key={`${suggestion}-${idx}`}
                    type="button"
                    onClick={() => setPaymentAmount(Number(suggestion).toFixed(2))}
                    className="h-8 rounded-lg border border-rose-100 bg-white text-[10px] font-black text-[#FC687D] hover:bg-rose-50"
                  >
                    {idx === 0 && Number(suggestion) === due ? "Exact" : peso0(suggestion)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200/60 font-semibold text-slate-600">
            <div className="flex justify-between"><span>Bill Total Due</span><span className="text-slate-900 font-bold">{peso2(due)}</span></div>
            <div className="flex justify-between"><span>Tendered</span><span>{peso2(useSplitPayment ? splitTotal : amt)}</span></div>
            {useSplitPayment ? (
              <>
                {splitRemaining > 0 ? <div className="flex justify-between text-orange-600"><span>Remaining</span><span className="font-bold">{peso2(splitRemaining)}</span></div> : null}
                {splitChange > 0 ? <div className="flex justify-between text-emerald-600"><span>Over Tender</span><span className="font-bold">{peso2(splitChange)}</span></div> : null}
              </>
            ) : isCash ? (
              <div className="flex justify-between text-emerald-600 font-bold border-t border-dashed border-slate-200 pt-1.5 mt-1">
                <span>Change Allocation</span>
                <span className="text-sm font-extrabold">{peso2(change)}</span>
              </div>
            ) : remaining > 0 ? (
              <div className="flex justify-between text-orange-600"><span>Unsettled Margin</span><span className="font-bold">{peso2(remaining)}</span></div>
            ) : null}
            {!useSplitPayment && isCash && amt < due ? <p className="text-[10px] text-red-500 font-bold mt-1">Warning: Tendered value lower than order subtotal due.</p> : null}
          </div>
        </div>

        <button
          disabled={disableConfirm}
          onClick={() => onConfirm(useSplitPayment
            ? {
                payments: splitPayments.map((p) => ({ method: p.method, amount: Number(p.amount || 0) })),
                amountPaid: splitTotal,
                changeDue: splitChange,
              }
            : { amountPaid: amt, changeDue: change })}
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
      <pre className="whitespace-pre-wrap text-xs bg-rose-950 text-rose-50 font-mono rounded-xl p-4 shadow-inner max-h-[40vh] overflow-y-auto">{receiptText || "No active buffer logged."}</pre>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider"
        >
          Dismiss
        </button>
        <button
          onClick={() => printReceiptText(receiptText, { widthMm: THERMAL_PAPER_WIDTH_MM })}
          className="w-full h-11 rounded-xl bg-rose-950 text-white text-xs font-bold uppercase tracking-wider shadow-sm"
        >
          Print Thermal
        </button>
      </div>
    </ModalShell>
  );
}

function PrinterEditField({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-100">{children}</div>
    </label>
  );
}

function PrinterSwitch({ label, checked, onChange, disabled = false }) {
  const hasLabel = Boolean(label);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${hasLabel ? "w-full justify-between py-3" : "shrink-0 justify-center"}`}
      aria-label={hasLabel ? label : "Toggle printer"}
    >
      {hasLabel ? <span className="text-sm font-semibold text-slate-800">{label}</span> : null}
      <span className={`relative h-7 w-12 rounded-full border transition ${checked ? "border-cyan-500 bg-cyan-600 shadow-lg shadow-cyan-500/20" : "border-slate-200 bg-slate-200"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

function PrinterStatusPill({ children, active = false, tone = "slate" }) {
  const tones = {
    cyan: active ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-slate-50 text-slate-500",
    emerald: active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
    amber: active ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-500",
    slate: active ? "border-slate-300 bg-slate-100 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-500",
  };
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-black uppercase tracking-wider ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function ShiftCashModal({ open, mode, counts, onChange, onClose, onSave }) {
  if (!open) return null;
  const title = mode === "open" ? "Open Shift" : "Close Shift";
  const total = SHIFT_DENOMINATIONS.reduce((sum, denom) => sum + denom * Number(counts[denom] || 0), 0);

  return (
    <ModalShell open={open} onClose={onClose} title={title} subtitle="Cash denomination count" z={170}>
      <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
        {SHIFT_DENOMINATIONS.map((denom) => {
          const count = Number(counts[denom] || 0);
          return (
            <div key={denom} className="grid grid-cols-[70px_1fr_110px] gap-2 items-center rounded-xl border border-slate-100 bg-slate-50 p-2">
              <span className="text-xs font-black text-slate-700">₱{denom}</span>
              <input
                type="number"
                min="0"
                value={counts[denom] || ""}
                onChange={(e) => onChange(denom, e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none"
                placeholder="0"
              />
              <span className="text-right text-xs font-black text-[#FC687D]">{peso2(denom * count)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-rose-500">Overall Total</span>
        <span className="text-lg font-black text-slate-900">{peso2(total)}</span>
      </div>
      <button type="button" onClick={() => onSave(total)} className="mt-4 w-full h-11 rounded-xl bg-[#FC687D] text-white text-xs font-black uppercase tracking-wider">
        Save {title}
      </button>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────
    NEW MODULE: Interactive Incoming Order Intercept overlay
────────────────────────────────────────────────────────────── */
function IncomingOrderModal({ open, order, onAccept, onEdit, onReject }) {
  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-rose-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-300 border border-rose-100 flex flex-col max-h-[90vh]">
        
        {/* Urgent Header */}
        <div className="flex items-center gap-3 border-b border-rose-50 pb-4">
          <div className="w-12 h-12 bg-rose-50 text-2xl flex items-center justify-center rounded-2xl animate-bounce shrink-0">
            🛎️
          </div>
          <div>
            <span className="text-[10px] font-extrabold tracking-[0.2em] text-[#FC687D] uppercase block animate-pulse">High Priority Transaction</span>
            <h3 className="text-xl font-black text-slate-800 warmth-tight">Incoming Remote Order</h3>
          </div>
        </div>

        {/* Customer Profiles Breakdown metadata block */}
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs text-slate-600 font-semibold shadow-inner">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-extrabold mb-1">Customer Overview</p>
          <div className="flex justify-between"><span>Name Reference</span><span className="text-slate-900 font-bold">{order.customer_name || "Web Guest"}</span></div>
          <div className="flex justify-between"><span>System User ID</span><span className="font-mono text-slate-700">{order.user_id?.slice(0,12)}...</span></div>
          <div className="flex justify-between border-t border-slate-200/60 pt-2 text-slate-900 text-sm">
            <span>Subtotal Calculated</span>
            <span className="font-black text-[#FC687D]">{peso0(order.subtotal || order.total)}</span>
          </div>
        </div>

        {/* Item Configurations Sublist */}
        <div className="mt-4 flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-3 bg-white space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-extrabold px-1 mb-1">Items Summary</p>
          {Array.isArray(order.items) && order.items.map((line, idx) => (
            <div key={line.cartItemId || idx} className="p-3 border border-slate-100 rounded-xl bg-[#FFF9FA]/40 flex flex-col gap-1">
              <div className="flex justify-between text-xs font-bold text-slate-800">
                <span className="truncate max-w-[75%]">{line.name} <span className="text-[#FC687D]">x{line.quantity}</span></span>
                <span>{peso0(Number(line.unitPrice || line.price || 0) * Number(line.quantity || 0))}</span>
              </div>
              {line.variantDetails && <p className="text-[11px] text-slate-400 font-medium italic">Modifiers: {line.variantDetails}</p>}
              {line.instructions && <p className="text-[11px] text-[#FC687D] font-bold mt-0.5">Note: {line.instructions}</p>}
            </div>
          ))}
        </div>

        {/* Trigger Controls Dashboard */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onReject}
            className="h-12 rounded-xl bg-red-50 border border-red-100 text-red-600 font-black text-xs uppercase tracking-wider active:scale-95 transition"
          >
            Reject ✕
          </button>
          <button
            onClick={onEdit}
            className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider active:scale-95 transition"
          >
            Edit ✏️
          </button>
          <button
            onClick={onAccept}
            className="h-12 rounded-xl bg-[#FC687D] hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider active:scale-95 transition shadow-sm"
          >
            Accept ✓
          </button>
        </div>
      </div>
    </div>
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

function getLatestShiftRecord(records, storeId) {
  const rows = Array.isArray(records) ? records : [];
  const scoped = storeId ? rows.filter((row) => String(row.store_id || "") === String(storeId)) : rows;
  return [...scoped].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;
}

function getShiftRecordMode(record) {
  return String(record?.mode || record?.shift_type || record?.type || record?.action || "").toLowerCase();
}

function getShiftStatusFromRecords(records, storeId) {
  const latest = getLatestShiftRecord(records, storeId);
  return getShiftRecordMode(latest).includes("open") ? "open" : "closed";
}

// ================= MAIN TERMINAL SCREEN =================

export default function POSPage() {
  const supabase = getSupabaseClient();
  const [storeId, setStoreId] = useState(null);
  const [currentStore, setCurrentStore] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  // PWA Add To Home Screen Hook States
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Incoming Order Realtime states
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [incomingOrderModalOpen, setIncomingOrderModalOpen] = useState(false);
  const audioIntervalRef = useRef(null);
  const seenIncomingOrderIds = useRef(new Set());
  const autoRefreshInFlightRef = useRef(false);

  const [printerConfig, setPrinterConfig] = useState({ receipt: null, order_slip: null, cup_label: null });
  const [barPrinterCategoryIds, setBarPrinterCategoryIds] = useState([]);
  const [barPrinterCategoryNames, setBarPrinterCategoryNames] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);

  const [paymentTypes, setPaymentTypes] = useState([]);
  const [, setTicketTemplates] = useState([]);
  const [, setDiscountRules] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(null);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("");
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
  const [webOrdersOpen, setWebOrdersOpen] = useState(false);
  const [webOrders, setWebOrders] = useState([]);
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState([]);
  const [diningOptionPickOpen, setDiningOptionPickOpen] = useState(false);
  const [posMenuOpen, setPosMenuOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementView, setManagementView] = useState("receipts");
  const [itemsManagementTab, setItemsManagementTab] = useState("items");
  const [receiptRows, setReceiptRows] = useState([]);
  const [receiptItemRows, setReceiptItemRows] = useState([]);
  const [receiptRefunds, setReceiptRefunds] = useState({});
  const [selectedReceiptNumber, setSelectedReceiptNumber] = useState("");
  const [reprintingReceipt, setReprintingReceipt] = useState(false);
  const [startingCash, setStartingCash] = useState("");
  const [shiftCashOpen, setShiftCashOpen] = useState(false);
  const [shiftCashMode, setShiftCashMode] = useState("open");
  const [shiftDenominations, setShiftDenominations] = useState({});
  const [shiftRecords, setShiftRecords] = useState([]);
  const [shiftStatus, setShiftStatus] = useState("loading");
  const [printerForm, setPrinterForm] = useState(() => createPrinterProfiles());

  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printerPermissionRole, setPrinterPermissionRole] = useState(null);
  const [charging, setCharging] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [moving, setMoving] = useState(false);

  // New persistent pointer reference state to bind edited web orders back cleanly
  const [activeWebOrderId, setActiveWebOrderId] = useState(null);
  const [activeWebOrderBranchId, setActiveWebOrderBranchId] = useState(null);

  const selectedDining = useMemo(
    () => (diningOptions || []).find((d) => String(d.id) === String(diningOption)) || null,
    [diningOptions, diningOption]
  );

  const diningOptionName = selectedDining?.name || "";
  const getResolvedBranchId = () => {
    if (activeWebOrderBranchId) return activeWebOrderBranchId;
    if (storeId) return storeId;
    if (typeof window !== "undefined") return localStorage.getItem("pos_store_id") || null;
    return null;
  };

  const enrichOrderItemsForKds = (orderItems = []) => {
    const menuItemsById = new Map((items || []).map((item) => [String(item.id), item]));
    return (Array.isArray(orderItems) ? orderItems : []).map((line) => {
      const menuItemId = line?.menuItemId || line?.menu_item_id || line?.id || null;
      const menuItem = menuItemId ? menuItemsById.get(String(menuItemId)) : null;
      return {
        ...line,
        menuItemId,
        menu_item_id: menuItemId,
        category: line?.category || line?.categoryName || line?.category_name || menuItem?.category || menuItem?.category_name || null,
        categoryId: line?.categoryId || line?.category_id || line?.menu_category_id || menuItem?.category_id || menuItem?.menu_category_id || null,
      };
    });
  };

  const buildWebOrderForKds = (order, overrides = {}) => ({
    ...order,
    ...overrides,
    store_id: overrides.store_id || getWebOrderStoreId(order) || activeWebOrderBranchId || storeId || null,
    branch_id: overrides.branch_id || getWebOrderStoreId(order) || activeWebOrderBranchId || storeId || null,
    items: enrichOrderItemsForKds(overrides.items || order?.items || []),
  });

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 3500);
  };

  const calcTotal = (lines) =>
    (lines || []).reduce((sum, i) => {
      if (isVoidedLine(i)) return sum;
      return sum + (Number(i.unitPrice || i.price || 0) * Number(i.quantity || 0));
    }, 0);

  const subtotal = useMemo(() => calcTotal(cart), [cart]);

  const removeCartItemAt = (index) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
    setVoucherTargetCartItemId(null);
    showToast("info", "Item Removed", "The item was removed from the active ticket.");
  };

  const discountAmount = useMemo(() => {
    const amt = discountAmountFromRule(appliedDiscount, subtotal);
    return Math.max(0, Math.min(subtotal, amt));
  }, [appliedDiscount, subtotal]);

  const totalDue = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0), [cart]);

  const selectedCartItem = useMemo(() => cart.find((x) => x.cartItemId === voucherTargetCartItemId) || null, [cart, voucherTargetCartItemId]);
  const ticketTitle = activeWebOrderId ? `Web Order: #${activeWebOrderId.slice(0,8).toUpperCase()}` : (diningOptionName || "Select Dining Option");
  const ticketSubtitle = attachedCustomer?.name ? `Loyalty Member: ${attachedCustomer.name}` : "Walk-in Customer";
  const selectedReceipt = useMemo(
    () => receiptRows.find((row) => row.receipt_number === selectedReceiptNumber) || receiptRows[0] || null,
    [receiptRows, selectedReceiptNumber]
  );
  const selectedReceiptItems = useMemo(
    () => receiptItemRows.filter((row) => row.receipt_number === selectedReceipt?.receipt_number),
    [receiptItemRows, selectedReceipt]
  );
  const shiftSummary = useMemo(() => {
    const rows = receiptRows || [];
    const isRefunded = (r) => String(r.status || "").toLowerCase().includes("refund");
    const paymentTotal = (needle) =>
      rows
        .filter((r) => String(r.payment_type || "").toLowerCase().includes(needle.toLowerCase()))
        .filter((r) => !isRefunded(r))
        .reduce((sum, r) => sum + Number(r.total_collected || 0), 0);
    const cashPayments = paymentTotal("cash");
    const cashRefunds = rows
      .filter((r) => String(r.payment_type || "").toLowerCase().includes("cash"))
      .filter(isRefunded)
      .reduce((sum, r) => sum + Number(r.total_collected || 0), 0);
    return {
      cashPayments,
      cashRefunds,
      expectedCash: Number(startingCash || 0) + cashPayments - cashRefunds,
      payments: {
        Gcash: paymentTotal("gcash"),
        QRPH: paymentTotal("qrph"),
        GrabFood: paymentTotal("grabfood"),
        "Grab Dine Out": paymentTotal("grab dine out"),
        Card: paymentTotal("card"),
        Panda: paymentTotal("panda"),
      },
    };
  }, [receiptRows, startingCash]);
  const shiftSalesRows = useMemo(() => {
    const todayKey = formatDate(new Date());
    const todaysRows = (receiptRows || []).filter((row) => {
      if (!row.created_at) return true;
      return formatDate(row.created_at) === todayKey;
    });
    return todaysRows.map((row) => ({
      receipt: row.receipt_number,
      time: row.created_at ? formatReceiptTime(row.created_at) : row.date,
      payment: row.payment_type || "Other",
      dining: row.description || row.dining_option || "POS Order",
      status: row.status || "Closed",
      total: Number(row.total_collected || row.net_sales || 0),
    }));
  }, [receiptRows]);
  const itemsByManagementCategory = useMemo(() => {
    const map = new Map();
    const categoryNames = (categories || []).map((cat) => cat?.name || cat?.label || cat).filter(Boolean);
    categoryNames.forEach((name) => map.set(name, []));
    (items || []).forEach((item) => {
      const key = item.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return Array.from(map.entries())
      .map(([name, rows]) => ({ name, rows: rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))) }))
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, items]);

  const visibleMenuItems = useMemo(() => {
    const search = menuSearch.trim().toLowerCase();
    return (items || [])
      .filter((item) => item.is_available !== false)
      .filter((item) => (activeCategory ? item.category === activeCategory : item.is_featured === true))
      .filter((item) => !search || (item.name || "").toLowerCase().includes(search));
  }, [items, activeCategory, menuSearch]);

  const optionSelectionGroups = useMemo(() => {
    const map = new Map();
    (items || []).forEach((item) => {
      (Array.isArray(item.variants) ? item.variants : []).forEach((group) => {
        const groupName = String(group.name || group.id || "").trim();
        if (!groupName) return;
        (Array.isArray(group.options) ? group.options : []).forEach((option) => {
          const optionName = String(option.name || option.label || option.id || "").trim();
          if (!optionName) return;
          const key = `${groupName}::${optionName}`;
          const enabled = (option.isAvailable ?? option.is_available ?? true) !== false;
          if (!map.has(key)) {
            map.set(key, { key, groupName, optionName, count: 0, enabledCount: 0 });
          }
          const row = map.get(key);
          row.count += 1;
          if (enabled) row.enabledCount += 1;
        });
      });
    });
    const byGroup = new Map();
    Array.from(map.values())
      .map((row) => ({ ...row, enabled: row.enabledCount > 0 }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.optionName.localeCompare(b.optionName))
      .forEach((row) => {
        if (!byGroup.has(row.groupName)) byGroup.set(row.groupName, []);
        byGroup.get(row.groupName).push(row);
      });
    return Array.from(byGroup.entries()).map(([groupName, options]) => ({ groupName, options }));
  }, [items]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setReceiptRefunds(JSON.parse(localStorage.getItem("pos_receipt_refunds") || "{}"));
    } catch {
      setReceiptRefunds({});
    }
    try {
      const localShiftRows = JSON.parse(localStorage.getItem("pos_shift_records") || "[]");
      setShiftRecords(Array.isArray(localShiftRows) ? localShiftRows : []);
      setStartingCash(localStorage.getItem("pos_shift_starting_cash") || "");
    } catch {
      setShiftRecords([]);
    }
  }, []);

  const saveReceiptRefunds = (next) => {
    setReceiptRefunds(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_receipt_refunds", JSON.stringify(next));
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  async function fetchPendingCount(sid) {
    if (!sid) return;
    const { count, error } = await supabase
      .from("web_orders")
      .select('*', { count: 'exact', head: true })
      .in("status", ["pending", "Pending"])
      .or(buildStoreOrderFilter(sid));

    if (!error) {
      setPendingCount(count || 0);
    }
  }

  function applyShiftState(records, sid) {
    const rows = Array.isArray(records) ? records : [];
    const nextStatus = getShiftStatusFromRecords(rows, sid);
    const latest = getLatestShiftRecord(rows, sid);
    const latestStartingCash = latest?.cash_total ?? latest?.starting_cash ?? 0;

    setShiftRecords(rows);
    setShiftStatus(nextStatus);

    if (typeof window !== "undefined") {
      localStorage.setItem("pos_shift_records", JSON.stringify(rows.slice(0, 20)));
      if (nextStatus === "open") {
        localStorage.setItem("pos_shift_starting_cash", String(latestStartingCash || 0));
      } else {
        localStorage.removeItem("pos_shift_starting_cash");
      }
    }

    setStartingCash(nextStatus === "open" ? String(latestStartingCash || 0) : "");
  }

  async function loadShiftState(sid) {
    if (!sid) {
      setShiftStatus("closed");
      return;
    }

    let localRows = [];
    if (typeof window !== "undefined") {
      try {
        const parsed = JSON.parse(localStorage.getItem("pos_shift_records") || "[]");
        localRows = Array.isArray(parsed) ? parsed : [];
      } catch {
        localRows = [];
      }
    }

    const { data, error } = await supabase
      .from("cashier_pos")
      .select("*")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      applyShiftState(localRows, sid);
      return;
    }

    applyShiftState(data || [], sid);
  }

  // ================= PWA INSTALLATION EVENT HANDLER =================
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleExecuteInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`PWA native setup user decision: ${outcome}`);
    setInstallPrompt(null);
    setShowInstallBanner(false);
  };

  // ================= CONTINUOUS LOOP AUDIO NOTIFICATION SYSTEM CONTROLLER =================
  const startContinuousAlertChime = () => {
    stopContinuousAlertChime();

    const triggerPlay = () => {
      playPosAlertSound();
    };

    triggerPlay();
    audioIntervalRef.current = setInterval(triggerPlay, 2500);
  };

  const stopContinuousAlertChime = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopContinuousAlertChime();
  }, []);

  // ================= DYNAMIC REALTIME CUSTOMER ORDER EVENT LISTENER =================
  useEffect(() => {
    if (!storeId || shiftStatus !== "open") return;

    console.log(`📡 Connecting web order alerts for store ${storeId}`);

    const showIncomingOrder = async (orderLike) => {
      const incomingId = orderLike?.id || orderLike?.order_id;
      if (!incomingId) return;
      if (seenIncomingOrderIds.current.has(incomingId)) return;

      let order = orderLike;
      if (!order.items) {
        const { data } = await supabase
          .from("web_orders")
          .select("*")
          .eq("id", incomingId)
          .maybeSingle();
        if (data) order = data;
      }

      const currentStatus = String(order?.status || "pending").toLowerCase();
      if (!["pending", "scheduled"].includes(currentStatus)) return;

      seenIncomingOrderIds.current.add(incomingId);
      setIncomingOrder(order);
      setIncomingOrderModalOpen(true);
      fetchPendingCount(storeId);
      fetchAcceptedWebOrders();
      startContinuousAlertChime();
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("New Web Order", {
          body: `${order.customer_name || "Customer"} - ${peso2(order.total || order.subtotal || 0)}`,
          icon: "/images/juja-logo.png",
          badge: "/images/juja-logo.png",
          tag: String(incomingId),
          requireInteraction: true,
        });
      }
    };

    const dbChannel = supabase
      .channel(`web-orders-db:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "web_orders",
        },
        (payload) => {
          const incomingStore = getWebOrderStoreId(payload.new);
          if (String(incomingStore) === String(storeId)) {
            showIncomingOrder(payload.new || {});
          }
        }
      )
      .subscribe();

    const branchAlertIds = [storeId].filter(Boolean);

    const broadcastChannels = branchAlertIds.map((branchId) =>
      supabase
        .channel(`store-alerts:${branchId}`)
        .on("broadcast", { event: "NEW_CUSTOMER_ORDER" }, (response) => {
          showIncomingOrder(response.payload || {});
        })
        .subscribe()
    );

    return () => {
      supabase.removeChannel(dbChannel);
      broadcastChannels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [storeId, shiftStatus, supabase]);

  // ================= INTERCEPT OVERLAY lifecycle actions dashboards =================
  const acceptIncomingWebOrder = async () => {
    if (!incomingOrder) return;
    stopContinuousAlertChime();

    try {
      const acceptedAt = new Date().toISOString();
      const scheduledOrder = isScheduledWebOrder(incomingOrder);
      const acceptedStatus = scheduledOrder ? "scheduled" : "accepted";
      const { error: updateErr } = await supabase
        .from("web_orders")
        .update({ status: acceptedStatus, order_status: acceptedStatus, accepted_at: acceptedAt })
        .eq("id", incomingOrder.id);
      if (updateErr) throw updateErr;

      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "web",
        order: buildWebOrderForKds(incomingOrder, { status: acceptedStatus, order_status: acceptedStatus, accepted_at: acceptedAt }),
        status: acceptedStatus,
      });
      if (kdsErr) showToast("warn", "KDS Sync Warning", kdsErr.message);
      await autoPrintBarCupLabels({
        orderId: incomingOrder.id,
        labelCart: incomingOrder.items || [],
        labelDining: incomingOrder.dining_option || incomingOrder.fulfillment_type || "WEB ORDER",
        printedAt: acceptedAt,
        askBeforePrint: true,
        promptContext: "this accepted web order",
      });
      if (!scheduledOrder) {
        window.setTimeout(() => {
          markKdsTicketStatus(supabase, { sourceType: "web", sourceId: incomingOrder.id, status: "preparing" });
        }, 5000);
      }

      await fetchPendingCount(storeId);
      await fetchAcceptedWebOrders();
      showToast("success", "Order Accepted", "Web order moved to accepted web orders.");
    } catch (err) {
      showToast("error", "Acceptance Failed", err.message);
    } finally {
      setIncomingOrderModalOpen(false);
      setIncomingOrder(null);
    }
  };

  const editIncomingWebOrder = () => {
    if (!incomingOrder) return;
    stopContinuousAlertChime();

    // Route attributes into workspace memory cache tracking rows
    setCart(enrichOrderItemsForKds(incomingOrder.items || []));
    setOriginalTicketId(null);
    setActiveWebOrderId(incomingOrder.id); // Secure the unique ID link 
    setActiveWebOrderBranchId(getWebOrderStoreId(incomingOrder) || storeId || null);

    const linkedCustomer = customers.find((c) => c.name === incomingOrder.customer_name);
    if (linkedCustomer) setAttachedCustomer(linkedCustomer);

    showToast("info", "Web Order Loaded", "Modifiers loaded inside active register workspace frame.");
    
    setIncomingOrderModalOpen(false);
    setIncomingOrder(null);
  };

  const rejectIncomingWebOrder = async () => {
    if (!incomingOrder) return;
    const confirmCancel = confirm("Are you completely certain you want to REJECT and scrub this customer order entry?");
    if (!confirmCancel) return;

    stopContinuousAlertChime();

    try {
      const { error } = await supabase
        .from("web_orders")
        .update({ status: "rejected" })
        .eq("id", incomingOrder.id);

      if (error) throw error;
      await fetchPendingCount(storeId);
      showToast("warn", "Order Refused", "Remote order cancelled and updated flags inside log tracking rows.");
    } catch (err) {
      showToast("error", "Reject Sync Failed", err.message);
    } finally {
      setIncomingOrderModalOpen(false);
      setIncomingOrder(null);
    }
  };

  // ================= CORE BACKGROUND LOGISTICS FUNCTIONS =================
  useEffect(() => {
    if (!storeId || shiftStatus !== "open") return;

    const channel = supabase
      .channel("pos-global-debug")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "web_orders" },
        (payload) => {
          console.log("🚨 DEBUG SNOOPER INTERCEPTED ROW:", payload.new);
          const orderStore = getWebOrderStoreId(payload.new);
          if (String(orderStore) === String(storeId)) {
            fetchPendingCount(storeId);
            fetchAcceptedWebOrders();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId, shiftStatus]);

  useEffect(() => {
    const channel = supabase
      .channel('open_tickets_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'open_tickets' }, () => {
        fetchSavedTickets(); 
      })
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
      const { session, error: sessionError } = await getStableSession(supabase);

      if (sessionError || !session) {
        window.location.replace("/pos/login");
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
        window.location.replace("/pos/login");
        return;
      }

      const activeStoreId = profile.store_id;
      setCurrentUserId(session.user.id);
      localStorage.setItem("pos_store_id", activeStoreId);
      setStoreId(activeStoreId);

      await fetchPendingCount(activeStoreId); 
      await loadShiftState(activeStoreId);
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
    setPrinterForm(createPrinterProfiles(map));
  }

  async function loadBarPrinterCategories(sid, categoryRows = categories) {
    if (!sid) return;
    const { data: groups, error: groupError } = await supabase
      .from("pos_printer_groups")
      .select("id, name, is_active")
      .eq("store_id", sid);

    if (groupError) {
      console.warn("Unable to load printer groups", groupError);
      setBarPrinterCategoryIds([]);
      setBarPrinterCategoryNames([]);
      return;
    }

    const barGroupIds = (groups || [])
      .filter((group) => String(group.name || "").trim().toLowerCase() === "bar")
      .filter((group) => group.is_active !== false)
      .map((group) => group.id);

    if (barGroupIds.length === 0) {
      setBarPrinterCategoryIds([]);
      setBarPrinterCategoryNames([]);
      return;
    }

    const { data: mapping, error: mappingError } = await supabase
      .from("pos_printer_group_categories")
      .select("menu_category_id")
      .eq("store_id", sid)
      .in("printer_group_id", barGroupIds);

    if (mappingError) {
      console.warn("Unable to load Bar printer categories", mappingError);
      setBarPrinterCategoryIds([]);
      setBarPrinterCategoryNames([]);
      return;
    }

    const mappedIds = Array.from(new Set((mapping || []).map((row) => row.menu_category_id).filter(Boolean)));
    const mappedIdSet = new Set(mappedIds.map((id) => String(id)));
    const mappedNames = (categoryRows || [])
      .filter((category) => mappedIdSet.has(String(category.id)))
      .map((category) => category.name)
      .filter(Boolean);

    setBarPrinterCategoryIds(mappedIds);
    setBarPrinterCategoryNames(Array.from(new Set(mappedNames)));
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

    const [payRes, dineRes, ticketRes, discRes, receiptRes, storeRes] = await Promise.all([
      supabase.from("pos_payment_types").select("*").or(`store_id.eq.${sid},store_id.is.null`).eq("is_active", true),
      supabase.from("pos_dining_options").select("*").eq("store_id", sid).eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("pos_open_ticket_templates").select("*").eq("store_id", sid),
      supabase.from("pos_discounts").select("*").eq("store_id", sid),
      supabase.from("pos_receipt_settings").select("*").eq("store_id", sid).maybeSingle(),
      supabase.from("stores").select("*").eq("id", sid).maybeSingle(),
    ]);

    const mergedPaymentTypes = mergeGlobalThenStore(payRes.data || []);
    setPaymentTypes(mergedPaymentTypes);
    setDiningOptions(dineRes.data || []);
    setTicketTemplates(ticketRes.data || []);
    setDiscountRules(discRes.data || []);
    setReceiptSettings(receiptRes.data || null);
    setCurrentStore(storeRes.data || null);

    if (!hasInitializedDining.current && (dineRes.data || []).length > 0) {
      setDiningOption(dineRes.data[0].id);
      hasInitializedDining.current = true;
    }
  }

  async function fetchData(sid, opts = {}) {
    if (!sid) return;
    const showLoadingState = opts.showLoading !== false;
    if (showLoadingState) setLoading(true);
    try {
      const [iRes, catRes, cRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("name"),
        supabase.from("menu_categories").select("*").order("name", { ascending: true }),
        supabase.from("loyalty_members").select("*"),
      ]);

      const cats = catRes.data || [];
      setItems(iRes.data || []);
      setCategories(cats);
      setCustomers((cRes.data || []).map((row) => ({
        ...row,
        name: row.customer_name || row.name || row.full_name || "",
        code: row.customer_code || row.code || "",
        availablePoints: row["Available points"] ?? row.available_points ?? 0,
        pointsBalance: row["Points balance"] ?? row.points_balance ?? 0,
      })));

      await loadPosSettings(sid);
      await loadPrinters(sid);
      await loadBarPrinterCategories(sid, cats);
    } catch (e) {
      showToast("error", "Loading Error", e.message);
    } finally {
      if (showLoadingState) setLoading(false);
    }
  }

  async function autoPrintBarCupLabels({
    orderId,
    labelCart = cart,
    labelDining = diningOptionName || "WEB ORDER",
    printedAt = new Date(),
    askBeforePrint = false,
    promptContext = "this order",
  } = {}) {
    const labels = buildCupLabels({
      orderId,
      cart: labelCart,
      diningOptionName: labelDining,
      printedAt,
      barCategoryIds: barPrinterCategoryIds,
      barCategoryNames: barPrinterCategoryNames,
    });

    if (labels.length === 0) return;

    if (askBeforePrint) {
      const labelCount = labels.length;
      const confirmed = window.confirm(`Print ${labelCount} cup label${labelCount === 1 ? "" : "s"} for ${promptContext}?`);
      if (!confirmed) return;
    }

    try {
      for (const label of labels) {
        await printByRole("cup_label", label, printerConfig, { fallbackToBrowser: false });
      }
    } catch (printError) {
      showToast("warn", "Cup Label Not Printed", printError?.message || "Select and save the Bluetooth cup label printer in POS Settings.");
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
      if (cart.length > 0) {
        setOriginalTicketId(null);
        setActiveWebOrderId(null);
        setActiveWebOrderBranchId(null);
        showToast("info", "Dining Option Changed", `${optionName} has a saved ticket. Your current cart was kept.`);
        return;
      }

      setOriginalTicketId(data.id);
      setCart(data.items || []);
      setActiveWebOrderId(null); // Clear web tracking context when switching to a physical table
      setActiveWebOrderBranchId(null);
      const linkedCustomer = customers.find((c) => c.id === data.customer_id);
      setAttachedCustomer(linkedCustomer || null);
      showToast("info", "Table Loaded", optionName);
    } else {
      setOriginalTicketId(null);
      setActiveWebOrderId(null);
      setActiveWebOrderBranchId(null);
      showToast("info", "Dining Option Changed", optionName);
    }
  }

  async function handleDiningChange(optionId) {
    setDiningOption(optionId);
    const opt = (diningOptions || []).find((d) => String(d.id) === String(optionId));
    const name = opt?.name || "";

    if (!name) {
      setOriginalTicketId(null);
      setActiveWebOrderId(null);
      setActiveWebOrderBranchId(null);
      return;
    }

    await loadDiningOptionOrder(name);
  }

  async function saveTableOrder() {
    if (activeWebOrderId) {
      // Direct rewrite update to keep the active web order synchronized 
      const { error } = await supabase
        .from("web_orders")
        .update({
          items: enrichOrderItemsForKds(cart),
          subtotal: Number(subtotal),
          total: Number(subtotal),
          dining_option: diningOptionName || null,
          fulfillment_type: diningOptionName || null,
        })
        .eq("id", activeWebOrderId);
      if (error) throw error;
      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "web",
        order: {
          id: activeWebOrderId,
          store_id: activeWebOrderBranchId || storeId,
          branch_id: activeWebOrderBranchId || storeId,
          customer_name: attachedCustomer?.name || "Web Customer",
          dining_option: diningOptionName || "Web Order",
          fulfillment_type: diningOptionName || "Web Order",
          items: enrichOrderItemsForKds(cart),
          subtotal: Number(subtotal),
          total: Number(subtotal),
          accepted_at: new Date().toISOString(),
        },
        status: "preparing",
      });
      if (kdsErr) throw kdsErr;
      await autoPrintBarCupLabels({
        orderId: activeWebOrderId,
        labelCart: cart,
        labelDining: diningOptionName || "WEB ORDER",
        printedAt: new Date(),
        askBeforePrint: true,
        promptContext: "this saved web order",
      });
      return;
    }

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
      const { data: ticketRow, error } = await supabase.from("open_tickets").update(payload).eq("id", originalTicketId).select("*").single();
      if (error) throw error;
      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "pos",
        order: {
          id: ticketRow.id,
          store_id: storeId,
          branch_id: storeId,
          customer_name: attachedCustomer?.name || "Walk-in",
          order_type: name,
          dining_option: name,
          items: enrichOrderItemsForKds(cart),
          total_amount: Number(subtotal || 0),
          created_at: ticketRow.created_at,
        },
        status: "preparing",
      });
      if (kdsErr) throw kdsErr;
      await autoPrintBarCupLabels({
        orderId: ticketRow.id,
        labelCart: cart,
        labelDining: name,
        printedAt: ticketRow.updated_at || ticketRow.created_at || new Date(),
        askBeforePrint: true,
        promptContext: "this saved ticket",
      });
    } else {
      const { data: ticketRow, error } = await supabase.from("open_tickets").insert([payload]).select("*").single();
      if (error) throw error;
      setOriginalTicketId(ticketRow.id);
      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "pos",
        order: {
          id: ticketRow.id,
          store_id: storeId,
          branch_id: storeId,
          customer_name: attachedCustomer?.name || "Walk-in",
          order_type: name,
          dining_option: name,
          items: enrichOrderItemsForKds(cart),
          total_amount: Number(subtotal || 0),
          created_at: ticketRow.created_at,
        },
        status: "preparing",
      });
      if (kdsErr) throw kdsErr;
      await autoPrintBarCupLabels({
        orderId: ticketRow.id,
        labelCart: cart,
        labelDining: name,
        printedAt: ticketRow.created_at || new Date(),
        askBeforePrint: true,
        promptContext: "this saved ticket",
      });
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

  async function fetchAcceptedWebOrders() {
    if (!storeId) return;

    const { data, error } = await supabase
      .from("web_orders")
      .select("*")
      .in("status", TARGET_WEB_STATUSES)
      .or(buildStoreOrderFilter(storeId))
      .order("created_at", { ascending: false });

    if (error) {
      showToast("error", "Web Orders Failed", error.message);
      setWebOrders([]);
      return;
    }

    setWebOrders(data || []);
  }

  useEffect(() => {
    if (!storeId || shiftStatus === "loading") return;

    let cancelled = false;
    const refreshPos = async () => {
      if (autoRefreshInFlightRef.current || cancelled) return;
      autoRefreshInFlightRef.current = true;

      try {
        await Promise.all([
          fetchPendingCount(storeId),
          loadShiftState(storeId),
          fetchData(storeId, { showLoading: false }),
          fetchSavedTickets(),
          fetchAcceptedWebOrders(),
          managementOpen ? fetchReceiptLogs() : Promise.resolve(),
        ]);
      } catch (err) {
        console.warn("POS auto refresh failed", err);
      } finally {
        autoRefreshInFlightRef.current = false;
      }
    };

    const timer = window.setInterval(refreshPos, POS_AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [storeId, shiftStatus, managementOpen]);

  async function openAcceptedWebOrders() {
    await fetchAcceptedWebOrders();
    setWebOrdersOpen(true);
  }

  function editAcceptedWebOrder(order) {
    setCart(enrichOrderItemsForKds(order.items || []));
    setOriginalTicketId(null);
    setActiveWebOrderId(order.id); // Secure tracking context parameter link
    setActiveWebOrderBranchId(getWebOrderStoreId(order) || storeId || null);

    const optionName = order.dining_option || "";
    const option = (diningOptions || []).find((d) => String(d.name).toLowerCase() === String(optionName).toLowerCase());
    setDiningOption(option?.id || "");
    const customer = customers.find(
      (c) =>
        c.id === order.customer_id ||
        String(c.name || "").toLowerCase() === String(order.customer_name || "").toLowerCase()
    );
    setAttachedCustomer(customer || null);
    setWebOrdersOpen(false);
    showToast("info", "Web Order Loaded", "Edit the order in the active ticket workspace.");
  }

  async function markWebOrderReady(order) {
    if (!order?.id) return;

    const { error } = await supabase
      .from("web_orders")
      .update({ status: "ready", order_status: "ready", ready_at: new Date().toISOString() })
      .eq("id", order.id);

    if (error) {
      showToast("error", "Ready Failed", error.message);
      return;
    }

    await markKdsTicketStatus(supabase, { sourceType: "web", sourceId: order.id, status: "ready" });

    if (order.user_id) {
      await supabase.from("notifications").insert([{
        type: "web_order_ready",
        title: "Order Ready",
        message: "Your order is ready for pickup or delivery.",
        web_order_id: order.id,
        store_id: getWebOrderStoreId(order),
        target_user_id: order.user_id,
        target_role: "customer",
        metadata: { status: "ready" },
      }]);
    }

    await fetchAcceptedWebOrders();
    showToast("success", "Customer Alert Sent", "Order status is now ready for pickup or delivery.");
  }

  function openWebOrderCharge(order) {
    if (!order?.id) return;
    editAcceptedWebOrder(order);
    setSelectedPayment("");
    setPaymentAmount("");
    window.setTimeout(() => setPaymentOpen(true), 0);
    showToast("info", "Charge Web Order", "Select payment details to complete this web order.");
  }

  async function createPointRewardVouchers(memberId, lifetimePoints) {
    if (!memberId) return;
    const earnedVoucherCount = Math.floor(Number(lifetimePoints || 0) / 100);
    if (earnedVoucherCount <= 0) return;

    const { data: existing, error } = await supabase
      .from("vouchers")
      .select("id, code, reward_text, reward_type")
      .eq("member_id", memberId);
    if (error) return;

    const existingPointsVouchers = (existing || []).filter((v) => {
      const code = String(v.code || "").toUpperCase();
      const rewardText = String(v.reward_text || "").toLowerCase();
      return v.reward_type === "points" || code.startsWith("PTS") || rewardText.includes("100 points");
    }).length;
    const missingCount = earnedVoucherCount - existingPointsVouchers;
    if (missingCount <= 0) return;

    const now = Date.now();
    const rows = Array.from({ length: missingCount }, (_, idx) => {
      const voucherNumber = existingPointsVouchers + idx + 1;
      return {
        member_id: memberId,
        code: `PTS100-${voucherNumber}-${Math.floor(1000 + Math.random() * 9000)}`,
        reward_text: "FREE 16oz Drink or Waffle (100 Points Reward)",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 90 * 86400000).toISOString(),
        status: "active",
        reward_type: "points",
      };
    });

    await supabase.from("vouchers").insert(rows);
  }

  async function awardWebOrderLoyaltyPoints(order, pointsEarned) {
    if (!order?.user_id || !pointsEarned) return;

    try {
      const { data: member, error: findErr } = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("user_id", order.user_id)
        .maybeSingle();

      if (findErr || !member) return;

      const currentBalance = Number(member["Points balance"] || 0);
      const currentAvailable = Number(member["Available points"] || 0);
      const currentVisits = Number(member["Total visits"] || 0);
      const nextBalance = Number((currentBalance + pointsEarned).toFixed(2));
      const nextAvailable = Number((currentAvailable + pointsEarned).toFixed(2));

      await supabase
        .from("loyalty_members")
        .update({
          "Points balance": nextBalance,
          "Available points": nextAvailable,
          "Total visits": currentVisits + 1,
        })
        .eq("id", member.id);

      await createPointRewardVouchers(member.id, nextBalance);
    } catch (err) {
      console.warn("Loyalty point update skipped:", err);
    }
  }

  async function fetchReceiptLogs() {
    const receiptCutoff = new Date();
    receiptCutoff.setDate(receiptCutoff.getDate() - POS_RECEIPT_HISTORY_DAYS);
    const receiptCutoffIso = receiptCutoff.toISOString();

    const [receiptRes, webReceiptRes] = await Promise.all([
      supabase
      .from("orders")
      .select("*")
      .gte("created_at", receiptCutoffIso)
      .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("web_orders")
        .select("*")
        .in("status", ["completed", "Completed"])
        .gte("created_at", receiptCutoffIso)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);
    if (receiptRes.error) {
      showToast("error", "Receipts Failed", receiptRes.error.message);
      return;
    }

    let refunds = receiptRefunds;
    if (typeof window !== "undefined") {
      try {
        refunds = JSON.parse(localStorage.getItem("pos_receipt_refunds") || "{}");
      } catch {
        refunds = {};
      }
    }
    const posRows = (receiptRes.data || []).map((order) => ({
      ...order,
      receipt_number: order.receipt_number || order.order_number || String(order.id),
      order_id: order.id,
      date: order.created_at ? formatDateTime(order.created_at) : "",
      gross_sales: Number(order.total || 0) + Number(order.discount || 0),
      discounts: Number(order.discount || 0),
      net_sales: Number(order.total || 0),
      total_collected: Number(order.total || 0),
      payment_type: order.payment_method || "Other",
      description: order.dining_option || "POS Order",
      status: refunds[order.receipt_number || order.order_number || String(order.id)]?.receipt || "Closed",
    }));
    const chargedWebOrderIds = new Set(
      (receiptRes.data || [])
        .map((order) => order.source_web_order_id)
        .filter(Boolean)
        .map((id) => String(id))
    );
    const webRows = (webReceiptRes.data || [])
      .filter((order) => !chargedWebOrderIds.has(String(order.id)))
      .map((order) => ({
        ...order,
        id: `WEB-${order.id}`,
        receipt_number: order.receipt_number || `WEB-${String(order.id).slice(0, 8).toUpperCase()}`,
        date: order.created_at ? formatDateTime(order.created_at) : "",
        gross_sales: Number(order.total || order.subtotal || 0),
        discounts: 0,
        net_sales: Number(order.total || order.subtotal || 0),
        total_collected: Number(order.total || order.subtotal || 0),
        payment_type: order.payment_method || "Web Order",
        description: `${order.dining_option || "Web Order"}${order.delivery_address ? ` - ${order.delivery_address}` : ""}`,
        status: refunds[`WEB-${order.id}`]?.receipt || "Closed",
        source: "web_order",
        web_items: order.items || [],
      }));
    const rows = [...posRows, ...webRows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    setReceiptRows(rows);
    const activeReceipt = rows.some((row) => row.receipt_number === selectedReceiptNumber) ? selectedReceiptNumber : rows[0]?.receipt_number || "";
    setSelectedReceiptNumber(activeReceipt);

    const posOrderIds = posRows.map((r) => r.order_id).filter(Boolean);
    const receiptNumberByOrderId = new Map(posRows.map((row) => [String(row.order_id), row.receipt_number]));
    if (posOrderIds.length === 0) {
      setReceiptItemRows(webRows.flatMap((order) =>
        (order.web_items || []).map((item, idx) => ({
          id: `${order.receipt_number}-${idx}`,
          receipt_number: order.receipt_number,
          item: item.name,
          quantity: item.quantity || item.qty || 1,
          net_sales: Number(item.unitPrice || item.price || 0) * Number(item.quantity || item.qty || 1),
          gross_sales: Number(item.unitPrice || item.price || 0) * Number(item.quantity || item.qty || 1),
          status: "Closed",
        }))
      ));
      return;
    }

    const itemRes = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", posOrderIds);
    if (!itemRes.error) {
      const posItems = (itemRes.data || []).map((item) => ({
          ...item,
          receipt_number: receiptNumberByOrderId.get(String(item.order_id)) || String(item.order_id),
          item: item.name,
          net_sales: item.line_total,
          gross_sales: item.line_total,
          status: refunds[receiptNumberByOrderId.get(String(item.order_id)) || String(item.order_id)]?.items?.[item.id || item.name] || "Closed",
        }));
      const webItems = webRows.flatMap((order) =>
        (order.web_items || []).map((item, idx) => ({
          id: `${order.receipt_number}-${idx}`,
          receipt_number: order.receipt_number,
          item: item.name,
          quantity: item.quantity || item.qty || 1,
          net_sales: Number(item.unitPrice || item.price || 0) * Number(item.quantity || item.qty || 1),
          gross_sales: Number(item.unitPrice || item.price || 0) * Number(item.quantity || item.qty || 1),
          status: refunds[order.receipt_number]?.items?.[`${order.receipt_number}-${idx}`] || "Closed",
        }))
      );
      setReceiptItemRows([...posItems, ...webItems]);
    }
  }

  function openManagement(view) {
    setManagementView(view);
    setPosMenuOpen(false);
    setManagementOpen(true);
    if (view === "receipts" || view === "shift") fetchReceiptLogs();
  }

  async function refundReceipt(receipt) {
    if (!receipt?.receipt_number) return;
    if (receipt.source !== "web_order" && receipt.id) {
      try {
        const restoreResult = await restoreInventoryForOrder(supabase, receipt.id, currentUserId);
        if (restoreResult?.duplicate) {
          showToast("info", "Inventory Already Restored", receipt.receipt_number);
        } else {
          showToast("success", "Inventory Restored", `${restoreResult?.restored || 0} stock movement${Number(restoreResult?.restored || 0) === 1 ? "" : "s"} returned.`);
        }
      } catch (error) {
        showToast("warn", "Inventory Restore Skipped", error.message || "Receipt refund saved, but inventory restore needs review.");
      }
      const refundAmount = Number(receipt.net_sales || receipt.total_collected || receipt.total || 0);
      const { error: refundError } = await supabase
        .from("orders")
        .update({
          status: "refunded",
          refund_amount: refundAmount,
          refunded_at: new Date().toISOString(),
          refunded_by: currentUserId || null,
          refund_reason: "POS receipt refund",
        })
        .eq("id", receipt.id);
      if (refundError) {
        showToast("warn", "Refund Audit Skipped", refundError.message);
      }
      await markKdsTicketStatus(supabase, { sourceType: "pos", sourceId: receipt.id, status: "voided" });
    }
    const key = String(receipt.receipt_number);
    const next = { ...receiptRefunds, [key]: { ...(receiptRefunds[key] || {}), receipt: "Refunded" } };
    saveReceiptRefunds(next);
    setReceiptRows((prev) => prev.map((row) => row.receipt_number === key ? { ...row, status: "Refunded" } : row));
    setReceiptItemRows((prev) => prev.map((row) => row.receipt_number === key ? { ...row, status: "Refunded" } : row));
    showToast("success", "Receipt Refunded", receipt.receipt_number);
  }

  async function reprintReceipt(receipt) {
    if (!receipt?.receipt_number || reprintingReceipt) return;
    const items = receiptItemRows.filter((row) => row.receipt_number === receipt.receipt_number);
    if (items.length === 0) {
      showToast("error", "Reprint Failed", "No receipt items were found for this receipt.");
      return;
    }

    const cartForReceipt = items.map((row) => {
      const quantity = Number(row.quantity || 1);
      const lineTotal = Number(row.net_sales ?? row.gross_sales ?? 0);
      return {
        name: row.item || row.name || "Item",
        quantity,
        unitPrice: quantity > 0 ? lineTotal / quantity : lineTotal,
      };
    });
    const gross = Number(receipt.gross_sales || 0);
    const discount = Number(receipt.discounts || 0);
    const total = Number(receipt.net_sales || receipt.total_collected || receipt.total || 0);

    const receiptCopy = buildReceiptText({
      receiptSettings,
      order: {
        ...receipt,
        id: receipt.receipt_number,
        store_id: receipt.store_id || receipt.branch_id || storeId,
      },
      cart: cartForReceipt,
      diningOptionName: receipt.dining_option || receipt.order_type || receipt.description || "Receipt",
      payment: receipt.payment_type || receipt.payment_method || "Other",
      subtotal: gross || cartForReceipt.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
      discount,
      total,
      printedAt: receipt.created_at || receipt.receipt_date || new Date(),
      copyLabel: "*** REPRINT ***",
      store: currentStore,
      cashierName,
    });

    setReprintingReceipt(true);
    try {
      setReceiptText(receiptCopy);
      setReceiptOpen(true);
      await printByRole("receipt", receiptCopy, printerConfig);
      showToast("success", "Receipt Reprinted", receipt.receipt_number);
    } catch (error) {
      showToast("error", "Reprint Failed", error?.message || "Unable to reprint receipt.");
    } finally {
      setReprintingReceipt(false);
    }
  }

  async function refundReceiptItem(itemRow) {
    if (!itemRow?.receipt_number || !itemRow?.item) return;
    const receiptKey = String(itemRow.receipt_number);
    const itemKey = itemRow.id || itemRow.item;
    if (itemRow.order_id || receiptKey) {
      const orderId = itemRow.order_id || receiptKey;
      const { data: orderAudit } = await supabase
        .from("orders")
        .select("refund_amount")
        .eq("id", orderId)
        .maybeSingle();
      const nextRefundAmount = Number(orderAudit?.refund_amount || 0) + Number(itemRow.net_sales || itemRow.gross_sales || 0);
      const { error: refundError } = await supabase
        .from("orders")
        .update({
          status: "partial_refund",
          refund_amount: nextRefundAmount,
          refunded_at: new Date().toISOString(),
          refunded_by: currentUserId || null,
          refund_reason: "POS item refund",
        })
        .eq("id", orderId);
      if (refundError) {
        showToast("warn", "Refund Audit Skipped", refundError.message);
      }
      await markKdsTicketItemVoided(supabase, {
        sourceType: "pos",
        sourceId: orderId,
        itemId: itemRow.id,
        itemName: itemRow.item,
      });
    }
    const next = {
      ...receiptRefunds,
      [receiptKey]: {
        ...(receiptRefunds[receiptKey] || {}),
        receipt: receiptRefunds[receiptKey]?.receipt === "Refunded" ? "Refunded" : "Partial Refund",
        items: { ...(receiptRefunds[receiptKey]?.items || {}), [itemKey]: "Refunded" },
      },
    };
    saveReceiptRefunds(next);
    setReceiptRows((prev) => prev.map((row) => row.receipt_number === receiptKey && row.status !== "Refunded" ? { ...row, status: "Partial Refund" } : row));
    setReceiptItemRows((prev) => prev.map((row) => row.receipt_number === receiptKey && (row.id || row.item) === itemKey ? { ...row, status: "Refunded" } : row));
    showToast("success", "Item Refunded", itemRow.item);
  }

  async function toggleMenuItemAvailability(item) {
    if (!item?.id) return;
    const nextAvailable = item.is_available === false;
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: nextAvailable })
      .eq("id", item.id);
    if (error) return showToast("error", "Item Update Failed", error.message);
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_available: nextAvailable } : row)));
  }

  async function toggleOptionSelectionAvailability(groupName, optionName) {
    const row = optionSelectionGroups.flatMap((group) => group.options).find((option) => option.groupName === groupName && option.optionName === optionName);
    const nextAvailable = !row?.enabled;
    const updates = (items || [])
      .map((item) => {
        const groups = Array.isArray(item.variants) ? item.variants : [];
        let touched = false;
        const nextGroups = groups.map((group) => {
          if (String(group.name || group.id || "").trim() !== groupName) return group;
          const options = Array.isArray(group.options) ? group.options : [];
          const nextOptions = options.map((option) => {
            if (String(option.name || option.label || option.id || "").trim() !== optionName) return option;
            touched = true;
            return { ...option, isAvailable: nextAvailable, is_available: nextAvailable };
          });
          return touched ? { ...group, options: nextOptions } : group;
        });
        return touched ? { item, nextGroups } : null;
      })
      .filter(Boolean);

    const results = await Promise.all(
      updates.map(({ item, nextGroups }) =>
        supabase.from("menu_items").update({ variants: nextGroups }).eq("id", item.id)
      )
    );
    const failed = results.find((res) => res.error);
    if (failed?.error) return showToast("error", "Option Update Failed", failed.error.message);

    setItems((prev) =>
      prev.map((item) => {
        const update = updates.find((u) => u.item.id === item.id);
        return update ? { ...item, variants: update.nextGroups } : item;
      })
    );
    showToast("success", "Option Updated", `${optionName} is now ${nextAvailable ? "available" : "unavailable"}.`);
  }

  function updatePrinterRole(role, enabled) {
    setPrinterForm((prev) => {
      return {
        ...prev,
        [role]: {
          ...(prev?.[role] || createPrinterProfile(role)),
          enabled,
        },
      };
    });
  }

  function updatePrinterProfile(role, patch) {
    setPrinterForm((prev) => ({
      ...prev,
      [role]: {
        ...(prev?.[role] || createPrinterProfile(role)),
        ...patch,
      },
    }));
  }

  function resetPrinterProfile(role) {
    setPrinterForm((prev) => ({
      ...prev,
      [role]: createPrinterProfile(role),
    }));
    showToast("info", "Printer Defaults Restored", `${PRINTER_ROLE_LABELS[role]} settings were reset. Save All to apply.`);
  }

  function buildPrinterConfigFromForm(role) {
    const form = printerForm?.[role] || createPrinterProfile(role);
    const serviceUuid = normalizeBluetoothUuid(form.service_uuid, DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID);
    const characteristicUuid = normalizeBluetoothUuid(form.characteristic_uuid, DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID);
    return {
      role,
      transport: "ble",
      ble_device_name: form.name?.trim() || `${PRINTER_ROLE_LABELS[role]} Printer`,
      paper_width_mm: role === "cup_label" ? 50 : Number(form.paper_width_mm || PRINTER_ROLE_DEFAULT_WIDTH[role] || THERMAL_PAPER_WIDTH_MM),
      ble_service_uuid: serviceUuid,
      ble_characteristic_uuid: characteristicUuid,
      ble_device_id: form.device_id || null,
      is_active: true,
    };
  }

  async function savePrinterSettings() {
    if (!storeId) return showToast("error", "Store Missing", "Store profile is not loaded.");
    const selectedRoles = Object.entries(printerForm || {})
      .filter(([, form]) => form?.enabled)
      .map(([role]) => role);
    if (selectedRoles.length === 0) return showToast("error", "Printer Group Required", "Turn on at least one printer group.");

    for (const role of Object.keys(PRINTER_ROLE_LABELS)) {
      const existing = printerConfig?.[role];
      if (selectedRoles.includes(role)) {
        const form = printerForm?.[role] || createPrinterProfile(role);
        if (!form.name?.trim()) return showToast("error", "Printer Name Required", `Enter a name for ${PRINTER_ROLE_LABELS[role]}.`);
        const payload = {
          store_id: storeId,
          ...buildPrinterConfigFromForm(role),
        };
        const res = existing?.id
          ? await supabase.from("pos_printers").update(payload).eq("id", existing.id)
          : await supabase.from("pos_printers").insert([payload]);
        if (res.error) return showToast("error", "Printer Save Failed", res.error.message);
      } else if (existing?.id) {
        const { error } = await supabase.from("pos_printers").update({ is_active: false }).eq("id", existing.id);
        if (error) return showToast("error", "Printer Save Failed", error.message);
      }
    }

    const receiptPayload = {
      store_id: storeId,
      ...(receiptSettings || {}),
      auto_print: !!receiptSettings?.auto_print,
      updated_at: new Date().toISOString(),
    };
    const { error: receiptError } = await supabase
      .from("pos_receipt_settings")
      .upsert(receiptPayload, { onConflict: "store_id" });
    if (receiptError) return showToast("error", "Printer Save Failed", receiptError.message);

    await loadPrinters(storeId);
    showToast("success", "Printers Saved", "Receipt, order slip, and cup label printers were updated.");
  }

  async function updateAutoPrintSetting(enabled) {
    const nextSettings = { ...(receiptSettings || {}), store_id: storeId, auto_print: enabled };
    setReceiptSettings(nextSettings);
    if (!storeId) return;
    const { error } = await supabase
      .from("pos_receipt_settings")
      .upsert({ ...nextSettings, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
    if (error) showToast("error", "Auto Print Save Failed", error.message);
  }

  async function printPrinterTest(role = "receipt") {
    const form = printerForm?.[role] || createPrinterProfile(role);
    const sample = role === "cup_label"
      ? [
          "TABLE 1",
          "Spanish Latte",
          receiptLine("-", RECEIPT_COLUMNS),
          "Iced (R)",
          "Less Ice",
          "Note: sample label",
          "",
          `${formatReceiptDate(new Date())}  #TEST`,
        ].join("\n")
      : [
          centerReceiptText("JUJA BREW & BITES"),
          receiptLine(),
          centerReceiptText(`${PRINTER_ROLE_LABELS[role]} TEST`),
          `Paper width: ${Number(form.paper_width_mm || PRINTER_ROLE_DEFAULT_WIDTH[role] || THERMAL_PAPER_WIDTH_MM)} mm`,
          `Interface: ${form.interface || "Bluetooth"}`,
          `Printer: ${form.name || "Bluetooth Printer"}`,
          receiptLine(),
          "Bluetooth print ready.",
        ].join("\n");

    try {
      await printByRole(role, sample, { ...printerConfig, [role]: buildPrinterConfigFromForm(role) }, { fallbackToBrowser: false });
      showToast("success", "Print Test Sent", "Check the Xprinter output.");
    } catch (error) {
      showToast("error", "Print Test Failed", error?.message || "Unable to print the test receipt.");
    }
  }

  async function deletePrinterSettings(role) {
    if (!storeId) return;
    const ok = confirm(`Delete the ${PRINTER_ROLE_LABELS[role] || "selected"} printer from POS settings?`);
    if (!ok) return;
    const id = printerConfig?.[role]?.id;
    if (!id) {
      updatePrinterProfile(role, createPrinterProfile(role));
      showToast("info", "No Printer Saved", "There is no saved printer to delete.");
      return;
    }
    const { error } = await supabase.from("pos_printers").update({ is_active: false }).eq("id", id);
    if (error) return showToast("error", "Delete Failed", error.message);
    setPrinterConfig((prev) => ({ ...prev, [role]: null }));
    updatePrinterProfile(role, createPrinterProfile(role));
    showToast("success", "Printer Deleted", "Printer was removed from active POS settings.");
  }

  function selectBluetoothPrinterDevice(role) {
    setPrinterPermissionRole(role);
  }

  async function requestBluetoothPrinterDevice(role) {
    if (typeof navigator === "undefined" || !navigator.bluetooth) {
      showToast(
        "error",
        "Bluetooth Not Supported",
        "Use Chrome or Edge on a Bluetooth-capable device over HTTPS or localhost."
      );
      setPrinterPermissionRole(null);
      return;
    }

    const form = printerForm?.[role] || createPrinterProfile(role);
    const serviceUuid = normalizeBluetoothUuid(form.service_uuid, DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID);
    const characteristicUuid = normalizeBluetoothUuid(
      form.characteristic_uuid,
      DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID
    );

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [serviceUuid],
      });

      let connectionVerified = false;
      try {
        const server = await device.gatt?.connect();
        const service = await server?.getPrimaryService(serviceUuid);
        await service?.getCharacteristic(characteristicUuid);
        connectionVerified = true;
        device.gatt?.disconnect?.();
      } catch (err) {
        console.warn("Bluetooth printer validation skipped or failed", err);
      }

      updatePrinterProfile(role, {
        enabled: true,
        name: form.name?.trim() || device.name || `${PRINTER_ROLE_LABELS[role]} Printer`,
        service_uuid: serviceUuid,
        characteristic_uuid: characteristicUuid,
        device_id: device.id || "",
      });
      cacheBluetoothPrinterDevice(device, {
        ble_device_id: device.id,
        ble_device_name: device.name || form.name,
        name: form.name,
      });
      showToast(
        connectionVerified ? "success" : "info",
        connectionVerified ? "Bluetooth Printer Selected" : "Bluetooth Device Selected",
        connectionVerified
          ? "The printer was found and the Bluetooth settings were filled in."
          : "The device was selected. Save it, then test printing from this browser."
      );
      setPrinterPermissionRole(null);
    } catch (err) {
      if (err?.name === "NotFoundError") {
        showToast("info", "Bluetooth Selection Cancelled", "No printer was selected.");
        setPrinterPermissionRole(null);
        return;
      }
      showToast("error", "Bluetooth Selection Failed", err?.message || "Unable to open Bluetooth device picker.");
      setPrinterPermissionRole(null);
    }
  }

  function openShiftCashModal(mode) {
    setShiftCashMode(mode);
    setShiftDenominations({});
    setShiftCashOpen(true);
  }

  function updateShiftDenomination(denom, value) {
    const clean = String(value || "").replace(/[^\d]/g, "");
    setShiftDenominations((prev) => ({ ...prev, [denom]: clean }));
  }

  async function saveShiftCash(totalCash) {
    const record = {
      id: `${shiftCashMode}-${Date.now()}`,
      store_id: storeId,
      mode: shiftCashMode,
      cashier_name: cashierName || "Operator",
      cash_total: Number(totalCash || 0),
      denominations: shiftDenominations,
      sales_summary: shiftSummary,
      created_at: new Date().toISOString(),
    };

    const nextRecords = [record, ...shiftRecords].slice(0, 20);
    setShiftRecords(nextRecords);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_shift_records", JSON.stringify(nextRecords));
      if (shiftCashMode === "open") {
        localStorage.setItem("pos_shift_starting_cash", String(totalCash || 0));
      } else {
        localStorage.removeItem("pos_shift_starting_cash");
      }
    }
    if (shiftCashMode === "open") {
      setStartingCash(String(totalCash || 0));
      setShiftStatus("open");
    } else {
      setStartingCash("");
      setShiftStatus("closed");
      setManagementOpen(false);
      setPosMenuOpen(false);
      setTicketDrawerOpen(false);
    }

    const { error } = await supabase.from("cashier_pos").insert([record]);
    if (error) {
      showToast("info", shiftCashMode === "open" ? "Shift Opened Locally" : "Shift Closed Locally", "Create or alter cashier_pos in Supabase to store shift records online.");
    } else {
      showToast("success", shiftCashMode === "open" ? "Shift Opened" : "Shift Closed", "Shift record saved.");
    }

    setShiftCashOpen(false);
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
    await markKdsTicketStatus(supabase, { sourceType: "pos", sourceId: ticketId, status: "voided" });
    await fetchSavedTickets();
    showToast("success", "Ticket Voided", "Ticket removed successfully.");
  }

  async function voidSavedTicketItem(ticket, line, index) {
    if (!ticket?.id || !line) return;
    const confirmVoid = confirm(`Void "${line.name}" from ${ticket.order_type || ticket.ticket_name || "saved ticket"}?`);
    if (!confirmVoid) return;

    const timestamp = new Date().toISOString();
    const nextItems = (ticket.items || []).map((item, idx) => {
      const sameItem =
        idx === index ||
        (line.cartItemId && item.cartItemId === line.cartItemId) ||
        (line.id && item.id === line.id && item.name === line.name);
      if (!sameItem) return item;
      return {
        ...item,
        voided: true,
        isVoided: true,
        status: "voided",
        voidedAt: item.voidedAt || timestamp,
        voided_at: item.voided_at || timestamp,
      };
    });
    const nextTotal = calcTotal(nextItems);

    const { error } = await supabase
      .from("open_tickets")
      .update({ items: nextItems, total_amount: nextTotal })
      .eq("id", ticket.id);

    if (error) {
      showToast("error", "Void Item Failed", error.message);
      return;
    }

    const { error: kdsError } = await markKdsTicketItemVoided(supabase, {
      sourceType: "pos",
      sourceId: ticket.id,
      itemId: line.cartItemId || line.id || line.menuItemId || line.menu_item_id,
      itemName: line.name,
    });
    if (kdsError) showToast("warn", "KDS Void Warning", kdsError.message);

    setSavedTickets((prev) =>
      prev.map((row) => (row.id === ticket.id ? { ...row, items: nextItems, total_amount: nextTotal } : row))
    );

    if (String(originalTicketId || "") === String(ticket.id)) {
      setCart(nextItems.filter((item) => !isVoidedLine(item)));
    }

    showToast("success", "Item Voided", `${line.name} marked voided.`);
  }

  async function resumeTicket(t) {
    setOriginalTicketId(t.id);
    setCart((t.items || []).filter((line) => !isVoidedLine(line)));
    setActiveWebOrderId(null); // This layout block references physical tickets, clear web target references
    setActiveWebOrderBranchId(null);
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
    if (!activeWebOrderId && !diningOption) return showToast("error", "Dining Option Required", "Please select a dining option.");

    const promptMessage = activeWebOrderId 
      ? "Save adjustments directly back to this active web order?" 
      : `Are you sure you want to park this current ticket to "${diningOptionName || "Dining Option"}"?`;

    const confirmSave = confirm(promptMessage);
    if (!confirmSave) return;

    setSavingTicket(true);
    try {
      await saveTableOrder();
      showToast("success", "Saved successfully", activeWebOrderId ? "Web order values updated." : "Ticket updated in system.");
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
    
    if (activeWebOrderId) {
      const confirmWebVoid = confirm("Completely scrub and cancel this live web order transaction entry?");
      if (!confirmWebVoid) return;
      setSavingTicket(true);
      try {
        await supabase.from("web_orders").update({ status: "rejected", order_status: "rejected", rejected_at: new Date().toISOString() }).eq("id", activeWebOrderId);
        await markKdsTicketStatus(supabase, { sourceType: "web", sourceId: activeWebOrderId, status: "rejected" });
        clearTicketSoft();
        showToast("warn", "Web Order Cancelled", "Order updated to rejected status rows.");
      } catch (err) {
        showToast("error", "Cancellation Failed", err.message);
      } finally {
        setSavingTicket(false);
      }
      return;
    }

    if (!diningOption) return showToast("error", "Dining Option Required", "No explicit table option linked.");

    const confirmVoid = confirm(`Void entire current live ticket for "${diningOptionName}"? This clears all items permanently.`);
    if (!confirmVoid) return;

    setSavingTicket(true);
    try {
      if (originalTicketId) {
        await markKdsTicketStatus(supabase, { sourceType: "pos", sourceId: originalTicketId, status: "voided" });
      }
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
    if (!activeWebOrderId && (!diningOption || !diningOptionName)) {
      return showToast("error", "Dining Option Required", "Please select a dining option.");
    }
    setPaymentOpen(true);
  }

  async function confirmCharge(paymentPayload = {}) {
    if (charging) return;
    const splitPaymentsPayload = Array.isArray(paymentPayload.payments) ? paymentPayload.payments.filter((p) => p.method && Number(p.amount || 0) > 0) : [];
    const paymentLabel = splitPaymentsPayload.length > 0
      ? splitPaymentsPayload.map((p) => `${p.method} ${peso2(p.amount)}`).join(" + ")
      : selectedPayment;
    if (!paymentLabel) return showToast("error", "Payment Required", "Select a payment type.");
    const resolvedBranchId = getResolvedBranchId();
    if (!resolvedBranchId) return showToast("error", "Branch not set", "Please sign out and sign in again so POS can load your branch.");
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
      const grossTotal = Number(subtotal || 0);
      const { data: receiptData, error: receiptErr } = await supabase.rpc("generate_receipt_number", {
        p_store_id: resolvedBranchId,
      });
      if (receiptErr) return showToast("error", "Receipt Number Failed", receiptErr.message);

      const receiptRow = Array.isArray(receiptData) ? receiptData[0] : receiptData;
      const generatedReceiptNumber = receiptRow?.receipt_number;
      if (!generatedReceiptNumber) {
        return showToast("error", "Receipt Number Failed", "No receipt number was returned by the database.");
      }

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert([{
          order_number: generatedReceiptNumber,
          receipt_number: generatedReceiptNumber,
          receipt_sequence: receiptRow.receipt_sequence || null,
          receipt_date: receiptRow.receipt_date || null,
          source_web_order_id: activeWebOrderId || null,
          store_id: resolvedBranchId,
          branch_id: resolvedBranchId,
          customer_id: attachedCustomer?.id || null,
          items: enrichOrderItemsForKds(cart),
          subtotal: grossTotal,
          total,
          discount,
          gross_amount: grossTotal,
          discount_amount: discount,
          net_amount: total,
          order_type: diningOptionName || "WEB_ORDER",
          cashier_id: currentUserId || null,
          paid_at: new Date().toISOString(),
          status: "paid",
          payment_method: paymentLabel,
          dining_option: diningOptionName || "WEB_ORDER",
        }])
        .select("*")
        .single();
      if (orderErr) return showToast("error", "Charge Failed", orderErr.message);

      if (!activeWebOrderId) {
        const { error: kdsErr } = await upsertKdsTicket(supabase, {
          sourceType: "pos",
          order: { ...orderRow, items: enrichOrderItemsForKds(cart) },
          status: "preparing",
        });
        if (kdsErr) showToast("warn", "KDS Sync Warning", kdsErr.message);
      }

      const itemRows = cart.map((line) => ({
        order_id: orderRow.id,
        menu_item_id: line.id,
        name: line.name,
        category_name: line.category || line.categoryName || null,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: Number(line.unitPrice || 0) * Number(line.quantity || 0),
        gross_amount: Number(line.unitPrice || 0) * Number(line.quantity || 0),
        discount_amount: 0,
        net_amount: Number(line.unitPrice || 0) * Number(line.quantity || 0),
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) return showToast("error", "Charge Failed", itemsErr.message);

      try {
        const inventoryResult = await deductInventoryForOrder(supabase, orderRow.id, cart, currentUserId);
        const missing = Number(inventoryResult?.missingRecipes || 0);
        if (missing > 0) {
          showToast("warn", "Inventory Warning", `${missing} item recipe${missing === 1 ? "" : "s"} missing. Sale completed without those deductions.`);
        }
      } catch (inventoryError) {
        showToast("warn", "Inventory Not Deducted", inventoryError.message || "Sale completed, but inventory deduction needs review.");
      }

      // If updating an active web order, close out its row state inside web_orders table
      if (activeWebOrderId) {
        const { data: activeWebOrder } = await supabase
          .from("web_orders")
          .select("*")
          .eq("id", activeWebOrderId)
          .maybeSingle();

        await supabase
          .from("web_orders")
          .update({ 
            status: "completed",
            order_status: "completed",
            completed_at: new Date().toISOString(),
            receipt_number: generatedReceiptNumber,
            receipt_sequence: receiptRow.receipt_sequence || null,
            receipt_date: receiptRow.receipt_date || null,
            payment_method: paymentLabel,
            payment_status: "paid",
            items: enrichOrderItemsForKds(cart),
            subtotal: Number(subtotal),
            total: total
          })
          .eq("id", activeWebOrderId);

        await markKdsTicketStatus(supabase, { sourceType: "web", sourceId: activeWebOrderId, status: "completed" });

        await awardWebOrderLoyaltyPoints(activeWebOrder, calcLoyaltyPoints(total));
      } else {
        if (originalTicketId) {
          await markKdsTicketStatus(supabase, { sourceType: "pos", sourceId: originalTicketId, status: "completed" });
        }
        await supabase.from("open_tickets").delete().eq("order_type", diningOptionName);
      }

      const receipt = buildReceiptText({
        receiptSettings, order: { ...orderRow, id: generatedReceiptNumber }, cart, diningOptionName: diningOptionName || "WEB ORDER", payment: paymentLabel,
        customer: attachedCustomer, subtotal, discount, total, voucher: appliedVoucher, appliedDiscount, store: currentStore, cashierName,
      });

      setReceiptText(receipt);
      setReceiptOpen(true);

      const shouldAskCupLabelOnCharge = !originalTicketId && !activeWebOrderId;
      if (shouldAskCupLabelOnCharge) {
        await autoPrintBarCupLabels({
          orderId: generatedReceiptNumber,
          labelCart: cart,
          labelDining: diningOptionName || "WEB ORDER",
          printedAt: orderRow.paid_at || orderRow.created_at || new Date(),
          askBeforePrint: true,
          promptContext: "this charged order",
        });
      }

      if (receiptSettings?.auto_print) {
        try {
          await printByRole("receipt", receipt, printerConfig, { fallbackToBrowser: false });
          if (selectedDining?.print_kitchen || activeWebOrderId) {
            const slip = buildOrderSlipText({ orderId: generatedReceiptNumber, cart });
            await printByRole("order_slip", slip, printerConfig, { fallbackToBrowser: false });
          }
        } catch (printError) {
          showToast("warn", "Sale Saved, Printer Needs Permission", printError?.message || "Select the Xprinter in POS Settings, then reprint the receipt.");
        }
      }

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

  const removeAttachedCustomer = () => {
    setAttachedCustomer(null);
    setCustomerSearch("");
    setAppliedVoucher(null);
    setAvailableVouchers([]);
    setVoucherTargetCartItemId(null);
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
    showToast("info", "Customer Removed", "Ticket is now assigned to walk-in.");
  };

  const prepareCustomerChange = () => {
    const currentName = attachedCustomer?.name || attachedCustomer?.customer_name || "";
    setCustomerSearch(currentName);
    setIsCustListOpen(true);
    showToast("info", "Change Customer", "Search or scan the replacement customer.");
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
    setActiveWebOrderId(null); // Clear tracking target references safely
    setActiveWebOrderBranchId(null);
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

  const cashierName = isMounted && typeof window !== "undefined" ? (localStorage.getItem("cashier_name") || "Operator") : "Operator";

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("pos_store_id");
      localStorage.removeItem("cashier_name");
      window.location.href = "/pos/login";
    }
  };

  const shiftCashModal = (
    <ShiftCashModal
      open={shiftCashOpen}
      mode={shiftCashMode}
      counts={shiftDenominations}
      onChange={updateShiftDenomination}
      onClose={() => setShiftCashOpen(false)}
      onSave={saveShiftCash}
    />
  );

  if (shiftStatus === "loading") {
    return (
      <div className="min-h-screen bg-[#FFF5F7] font-sans antialiased text-slate-800">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="h-10 w-10 rounded-full border-4 border-rose-100 border-t-[#FC687D] animate-spin" />
        </div>
      </div>
    );
  }

  if (shiftStatus === "closed") {
    return (
      <div className="min-h-screen bg-[#FFF5F7] font-sans antialiased text-slate-800">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <div className="min-h-screen flex items-center justify-center p-6">
          <button
            type="button"
            disabled={!storeId}
            onClick={() => openShiftCashModal("open")}
            className="h-14 min-w-48 rounded-2xl bg-[#FC687D] px-8 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-rose-200/70 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-rose-200 disabled:shadow-none"
          >
            {storeId ? "Open Shift" : "Loading"}
          </button>
        </div>
        {shiftCashModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] pb-24 lg:pb-0 font-sans antialiased text-slate-800">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* PERSISTENT PWA INSTALLATION TRIGGER BANNER LAYOUT */}
      {showInstallBanner && (
        <div className="bg-gradient-to-r from-rose-500 to-[#FC687D] text-white py-2 px-4 shadow-sm flex items-center justify-between text-xs font-semibold select-none animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span>📱</span>
            <span>Run Juja POS directly as a standalone hardware desktop app window.</span>
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
        {posMenuOpen && (
          <div className="fixed inset-0 z-[145] bg-slate-800/30 backdrop-blur-sm p-4 flex items-center justify-center" onClick={() => setPosMenuOpen(false)}>
              <div className="w-full max-w-sm rounded-2xl border border-rose-100 bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="rounded-xl bg-slate-300/78 border border-rose-100 px-3 py-2 mb-3">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-rose-400">Cashier</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-black text-slate-800 truncate">{cashierName || "Operator"}</p>
                    <button
                      type="button"
                      onClick={signOut}
                      className="h-8 px-3 rounded-lg bg-white border border-rose-100 text-[10px] font-semibold uppercase tracking-wider text-rose-600"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["receipts", "Receipts"],
                    ["shift", "Shift"],
                    ["items", "Items"],
                    ["settings", "Settings"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openManagement(key)}
                      className={`h-10 rounded-xl border text-xs font-semibold uppercase tracking-wider ${
                        managementView === key
                          ? "border-rose-300 bg-slate-200/50 text-[#FC687D]"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setPosMenuOpen(false)} className="w-full mt-3 h-10 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase tracking-wider text-slate-500">
                  Close
                </button>
              </div>
          </div>
        )}

        {managementOpen && (
          <div className="fixed inset-0 z-[140] bg-slate-950/45 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center" onClick={() => setManagementOpen(false)}>
            <div className="w-full max-w-5xl max-h-[100vh] overflow-y-auto rounded-2xl border border-rose-100 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-rose-50 pb-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#FC687D]">POS Control</p>
              <h2 className="text-md font-black text-slate-800">
                {managementView === "receipts" ? "Receipts" : managementView === "shift" ? "Shift" : managementView === "items" ? "Items" : "Settings"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {(managementView === "receipts" || managementView === "shift") && (
                <button type="button" onClick={fetchReceiptLogs} className="h-9 px-3 rounded-xl bg-rose-50 border border-rose-100 text-[10px] font-semibold uppercase tracking-wider text-[#FC687D]">
                  Refresh
                </button>
              )}
              <button type="button" onClick={() => setManagementOpen(false)} className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 font-semibold">
                X
              </button>
            </div>
          </div>

          {managementView === "receipts" && (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                
                {receiptRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-400">No receipts found.</div>
                ) : receiptRows.map((r) => (
                  <button
                    key={r.receipt_number}
                    type="button"
                    onClick={() => setSelectedReceiptNumber(r.receipt_number)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedReceipt?.receipt_number === r.receipt_number ? "border-rose-300 bg-rose-50" : "border-slate-100 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-slate-800 truncate">{r.receipt_number}</p>
                      <span className="text-[12px] font-semibold text-[#FC687D]">{peso2(r.total_collected || r.net_sales || 0)}</span>
                    </div>
                    <p className="text-[10px] font-semibold italic text-slate-400 truncate">{r.date || ""} · {r.status || "Closed"}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 min-h-56">
                {!selectedReceipt ? (
                  <p className="text-xs font-semibold text-slate-400">Select a receipt to see details.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-black text-slate-800">{selectedReceipt.receipt_number}</h3>
                        <p className="text-xs font-semibold text-slate-500">{selectedReceipt.description || "Receipt details"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => reprintReceipt(selectedReceipt)}
                          disabled={reprintingReceipt}
                          className="h-9 px-3 rounded-xl bg-cyan-50 border border-cyan-100 text-[10px] font-bold uppercase tracking-wider text-cyan-700 disabled:opacity-60"
                        >
                          {reprintingReceipt ? "Reprinting..." : "Reprint Receipt"}
                        </button>
                        <button type="button" onClick={() => refundReceipt(selectedReceipt)} className="h-9 px-3 rounded-xl bg-red-50 border border-red-100 text-[10px] font-bold uppercase tracking-wider text-red-600">
                          Refund Receipt
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Gross</span><b>{peso2(selectedReceipt.gross_sales || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Discount</span><b>{peso2(selectedReceipt.discounts || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Net</span><b>{peso2(selectedReceipt.net_sales || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Payment</span><b>{selectedReceipt.payment_type || "-"}</b></div>
                    </div>
                    <div className="space-y-2">
                      {selectedReceiptItems.map((row, idx) => (
                        <div key={`${row.receipt_number}-${row.item}-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-100 bg-white p-2">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-800">{row.item}</p>
                            <p className="text-[10px] font-semibold italic text-slate-400">Qty {row.quantity} · {peso2(row.net_sales || row.gross_sales || 0)} · {row.status || "Closed"}</p>
                          </div>
                          <button type="button" onClick={() => refundReceiptItem(row)} className="h-8 px-3 rounded-lg border border-red-100 bg-red-50 text-[10px] font-bold uppercase tracking-wider text-red-600">
                            Refund Item
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {managementView === "shift" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <h3 className="text-sm font-black text-slate-800">Cash Drawer</h3>
                <div className="grid grid-cols-1 gap-2">
                  <button type="button" onClick={() => openShiftCashModal("close")} className="h-10 rounded-xl bg-[#FC687D] text-white text-[10px] font-black uppercase tracking-wider">Close Shift</button>
                </div>
                <div className="flex justify-between rounded-lg bg-white border border-slate-100 p-2 text-xs font-bold">
                  <span className="text-slate-500">Starting Cash</span><span>{peso2(startingCash || 0)}</span>
                </div>
                {[
                  ["Cash payments", shiftSummary.cashPayments],
                  ["Cash refunds", shiftSummary.cashRefunds],
                  ["Expected cash amount", shiftSummary.expectedCash],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between rounded-lg bg-white border border-slate-100 p-2 text-xs font-bold">
                    <span className="text-slate-500">{label}</span><span>{peso2(value)}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <h3 className="text-sm font-black text-slate-800">Sales Summary</h3>
                {Object.entries(shiftSummary.payments).map(([label, value]) => (
                  <div key={label} className="flex justify-between rounded-lg bg-white border border-slate-100 p-2 text-xs font-bold">
                    <span className="text-slate-500">{label}</span><span>{peso2(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-sm font-black text-slate-800 mb-3">Today's Sales Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase tracking-wider">
                      <th className="py-2">Time</th>
                      <th>Receipt</th>
                      <th>Payment</th>
                      <th>Dining</th>
                      <th>Status</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftSalesRows.length === 0 ? (
                      <tr><td colSpan="6" className="py-5 text-center text-slate-400 font-semibold">No sales loaded for today.</td></tr>
                    ) : shiftSalesRows.map((row) => (
                      <tr key={row.receipt} className="border-t border-slate-100 text-slate-700 font-semibold">
                        <td className="py-2">{row.time}</td>
                        <td>{String(row.receipt).slice(0, 8)}</td>
                        <td>{row.payment}</td>
                        <td>{row.dining}</td>
                        <td>{row.status}</td>
                        <td className="text-right font-black">{peso2(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}

          {managementView === "items" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-rose-50 border border-rose-100 p-1">
                {[
                  ["items", "Items"],
                  ["optionGroups", "Option Groups"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setItemsManagementTab(key)}
                    className={`h-9 rounded-lg text-xs font-black uppercase tracking-wider ${itemsManagementTab === key ? "bg-[#FC687D] text-white" : "text-rose-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {itemsManagementTab === "items" ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {itemsByManagementCategory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-400">No items found.</div>
                  ) : itemsByManagementCategory.map((category) => (
                    <div key={category.name} className="space-y-2">
                      <div className="sticky top-0 z-10 rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-700">
                        {category.name}
                      </div>
                      {category.rows.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                              <p className="text-[10px] font-semibold text-slate-400">{peso2(item.price || 0)}</p>
                            </div>
                            <button type="button" onClick={() => toggleMenuItemAvailability(item)} className={`h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-wider ${item.is_available === false ? "bg-slate-200 text-slate-500" : "bg-emerald-50 text-emerald-600 border border-emerald-100"}`}>
                              {item.is_available === false ? "Off" : "On"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {optionSelectionGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-400">No option selections found.</div>
                  ) : optionSelectionGroups.map((group) => (
                    <div key={group.groupName} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                      <div>
                        <p className="text-xs font-black text-slate-800 truncate">{group.groupName}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{group.options.length} option selection(s)</p>
                      </div>
                      {group.options.map((option) => (
                        <div key={option.key} className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white p-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{option.optionName}</p>
                            <p className="text-[10px] font-semibold text-slate-400">{option.count} item link(s)</p>
                          </div>
                          <button type="button" onClick={() => toggleOptionSelectionAvailability(option.groupName, option.optionName)} className={`h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-wider ${option.enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-200 text-slate-500"}`}>
                            {option.enabled ? "On" : "Off"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {managementView === "settings" && (
            <div className="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 bg-slate-700 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">Printer setup</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">Receipt, order slip, and cup label printers</p>
                </div>
                <button type="button" onClick={savePrinterSettings} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm transition hover:bg-cyan-50">
                  <Save size={15} />
                  Save All
                </button>
              </div>

              <div className="border-b border-slate-200 bg-slate-50 px-4 py-1">
                <PrinterSwitch label="Automatically print receipt" checked={!!receiptSettings?.auto_print} onChange={updateAutoPrintSetting} />
              </div>

              <div className="grid gap-4 px-4 py-5 lg:grid-cols-3">
                {Object.entries(PRINTER_ROLE_LABELS).map(([role, label]) => {
                  const roleForm = printerForm?.[role] || createPrinterProfile(role);
                  const isCupLabel = role === "cup_label";
                  const savedPrinter = printerConfig?.[role];
                  const hasDevice = Boolean(roleForm.device_id || savedPrinter?.ble_device_id);

                  return (
                    <div key={role} className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${roleForm.enabled ? "border-cyan-200 bg-cyan-50/40" : "border-slate-200 bg-white"}`}>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black uppercase tracking-wider text-slate-900">{label}</p>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{PRINTER_ROLE_HINTS[role]}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <PrinterStatusPill active={!!roleForm.enabled} tone="cyan">{roleForm.enabled ? "Enabled" : "Disabled"}</PrinterStatusPill>
                            <PrinterStatusPill active={!!savedPrinter?.id} tone="emerald">{savedPrinter?.id ? "Saved" : "Unsaved"}</PrinterStatusPill>
                            <PrinterStatusPill active={hasDevice} tone="amber">{hasDevice ? "Device linked" : "No device"}</PrinterStatusPill>
                          </div>
                        </div>
                        <PrinterSwitch label="" checked={!!roleForm.enabled} onChange={(v) => updatePrinterRole(role, v)} />
                      </div>

                      <div className="space-y-4">
                        <PrinterEditField label="Printer name">
                          <input
                            value={roleForm.name}
                            onChange={(e) => updatePrinterProfile(role, { name: e.target.value })}
                            className="h-8 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                            placeholder={`${label} Printer`}
                          />
                        </PrinterEditField>

                        <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Purpose</p>
                              <p className="text-xs font-semibold text-slate-800">{PRINTER_ROLE_STATUS[role]}</p>
                            </div>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                              <Bluetooth size={17} />
                            </div>
                          </div>
                          <p className="text-[11px] font-medium leading-4 text-slate-500">
                            {isCupLabel
                              ? "Use this for automatic drink cup labels after save, charge, or accepted web orders."
                              : role === "order_slip"
                              ? "Use this for prep slips and kitchen order copies."
                              : "Use this for customer receipts and reprints."}
                          </p>
                        </div>

                        <PrinterEditField label="Printer model">
                          <select
                            value={roleForm.model}
                            onChange={(e) => updatePrinterProfile(role, { model: e.target.value })}
                            className="h-10 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                          >
                            <option>Other model</option>
                            <option>XP-Z58C thermal label printer</option>
                            <option>Xprinter thermal printer</option>
                            <option>ESC/POS compatible</option>
                          </select>
                        </PrinterEditField>

                        <PrinterEditField label="Interface">
                          <select
                            value={roleForm.interface}
                            onChange={(e) => updatePrinterProfile(role, { interface: e.target.value })}
                            className="h-10 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                          >
                            <option>Bluetooth</option>
                          </select>
                        </PrinterEditField>

                        <div className="grid grid-cols-[1fr_92px] items-end gap-3">
                          <PrinterEditField label="Bluetooth printer">
                            <input
                              value={roleForm.device_id || roleForm.name}
                              readOnly
                              className="h-10 w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                              placeholder="Select paired printer"
                            />
                          </PrinterEditField>
                          <button type="button" onClick={() => selectBluetoothPrinterDevice(role)} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-100">
                            <Search size={14} />
                            Search
                          </button>
                        </div>

                        <PrinterEditField label={isCupLabel ? "Sticker size" : "Paper width"}>
                          {isCupLabel ? (
                            <div className="flex min-h-10 items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                              <span>50mm W x 40mm H</span>
                              <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-700">Thermal sticker</span>
                            </div>
                          ) : (
                            <select
                              value={String(roleForm.paper_width_mm)}
                              onChange={(e) => updatePrinterProfile(role, { paper_width_mm: Number(e.target.value) })}
                              className="h-10 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                            >
                              <option value="50">50 mm</option>
                              <option value="58">58 mm</option>
                              <option value="80">80 mm</option>
                            </select>
                          )}
                        </PrinterEditField>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Bluetooth UUID settings</p>
                              <p className="text-[11px] font-semibold text-slate-400">Default values work for most Xprinter XP-Z58C devices.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => updatePrinterProfile(role, {
                                service_uuid: DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID,
                                characteristic_uuid: DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID,
                              })}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-100"
                            >
                              UUID defaults
                            </button>
                          </div>
                          <div className="grid gap-2">
                            <PrinterEditField label="Service UUID">
                              <input
                                value={roleForm.service_uuid}
                                onChange={(e) => updatePrinterProfile(role, { service_uuid: e.target.value })}
                                className="h-9 w-full bg-transparent text-xs font-semibold text-slate-800 outline-none"
                              />
                            </PrinterEditField>
                            <PrinterEditField label="Characteristic UUID">
                              <input
                                value={roleForm.characteristic_uuid}
                                onChange={(e) => updatePrinterProfile(role, { characteristic_uuid: e.target.value })}
                                className="h-9 w-full bg-transparent text-xs font-semibold text-slate-800 outline-none"
                              />
                            </PrinterEditField>
                          </div>
                        </div>

                        {isCupLabel ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-4 text-amber-800">
                            XP-Z58C label setup: pair the printer first in the device Bluetooth settings using password 0000, then use Search here to grant browser permission.
                          </div>
                        ) : null}

                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <button type="button" onClick={() => printPrinterTest(role)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-black uppercase tracking-wider text-slate-800 transition hover:bg-slate-50">
                            <Printer size={16} className="text-slate-500" />
                            Test
                          </button>
                          <button type="button" onClick={() => resetPrinterProfile(role)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-50">
                            <RotateCcw size={15} />
                            Default
                          </button>
                          <button type="button" onClick={() => deletePrinterSettings(role)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 text-[11px] font-black uppercase tracking-wider text-red-600 transition hover:bg-red-100">
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
            </div>
          </div>
        )}

        {/* MAIN TERMINAL RESPONSIVE GRID LAYOUT FLOW */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-5 items-start">
          
          {/* CATALOG AND MENU SHELF VIEW PANELS */}
          <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm space-y-4">
            
            {/* Catalog Controller Sorting filters bars */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <label className="relative w-full sm:w-64">
                <span className="sr-only">Category</span>
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-rose-200 focus:bg-white"
                >
                  <option value="">Featured Menu Items</option>
                  {categories.map((cat) => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">▼</span>
              </label>
              
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

            {/* Product tile grid with category dropdown selection */}
            {loading ? (
              <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5 gap-3 max-h-[calc(100vh-190px)] overflow-y-auto pr-1">
                  {visibleMenuItems.length === 0 ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs font-semibold text-slate-500">
                      {activeCategory ? "No available items found in this category." : "No featured menu items found."}
                    </div>
                  ) : visibleMenuItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItemForModal(item)}
                        className="group bg-white border border-slate-100 rounded-xl p-2.5 text-left hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md transition-all duration-200 flex flex-col h-full justify-between"
                      >
                        <div className="w-full">
                          <div className="w-full aspect-square bg-[#FFF9FA] border border-rose-50/50 flex items-center justify-center overflow-hidden rounded-lg relative">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover p-1 group-hover:scale-102 transition" />
                            ) : (
                              <span className="text-2xl text-rose-200/50">📷</span>
                            )}
                          </div>
                          <div className="mt-2.5 px-0.5">                            
                            <p className="text-[14px] font-bold text-slate-800 leading-tight truncate mt-1">{item.name}</p>
                          </div>
                        </div>
                        <p className="text-[14px] font-semibold text-slate-800 mt-2 px-0.5 pt-2 border-t border-slate-50 w-full">
                          {item.is_variable_price ? "Variable Price" : `₱${Number(item.price || 0).toFixed(0)}`}
                        </p>
                      </button>
                    ))}
              </div>
            )}
          </div>

          {/* SIDEBAR TICKET INTERACTION LAYER PANEL */}
          <div className="hidden lg:block bg-white border border-rose-100 rounded-2xl p-3 shadow-sm sticky top-4 h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] overflow-hidden">
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
              onRemoveCustomer={removeAttachedCustomer}
              onChangeCustomer={prepareCustomerChange}
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
              onOpenWebOrdersModal={openAcceptedWebOrders}
              onOpenSavedTicketsModal={async () => {
                await fetchSavedTickets();
                setSavedMode("resume");
                setSavedOpen(true);
              }}
              onOpenPosMenu={() => setPosMenuOpen(true)}
              pendingCount={pendingCount}
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
              onRemoveCartItem={removeCartItemAt}
            />
          </div>
        </div>
      </div>

      {/* MOBILE HUD INTERFACE BOTTOM FLOATING TRIGGER ACTION LAYER FOOTER */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-rose-950 text-white shadow-[0_-8px_30px_rgba(252,104,125,0.22)] px-4 py-3 pb-safe border-t border-rose-800">
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
                onRemoveCustomer={removeAttachedCustomer}
                onChangeCustomer={prepareCustomerChange}
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
                onOpenWebOrdersModal={openAcceptedWebOrders}
                onOpenSavedTicketsModal={async () => {
                  await fetchSavedTickets();
                  setSavedMode("resume");
                  setSavedOpen(true);
                }}
                onOpenPosMenu={() => setPosMenuOpen(true)}
                pendingCount={pendingCount}
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
                onRemoveCartItem={removeCartItemAt}
                onCloseMobile={() => setTicketDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* PORTALS LAYER MODAL SYSTEMS OVERLAYS */}
      <IncomingOrderModal 
        open={incomingOrderModalOpen} 
        order={incomingOrder} 
        onAccept={acceptIncomingWebOrder} 
        onEdit={editIncomingWebOrder} 
        onReject={rejectIncomingWebOrder} 
      />
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
        onVoidItem={voidSavedTicketItem}
      />
      <WebOrdersModal
        open={webOrdersOpen}
        onClose={() => setWebOrdersOpen(false)}
        orders={webOrders}
        onRefresh={fetchAcceptedWebOrders}
        onEdit={editAcceptedWebOrder}
        onReady={markWebOrderReady}
        onDelivered={openWebOrderCharge}
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
      <PrinterPermissionModal
        open={!!printerPermissionRole}
        roleLabel={PRINTER_ROLE_LABELS[printerPermissionRole]}
        onCancel={() => setPrinterPermissionRole(null)}
        onAllow={() => requestBluetoothPrinterDevice(printerPermissionRole)}
      />
      {shiftCashModal}
      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} paymentTypes={paymentTypes} selectedPayment={selectedPayment} onSelect={(name) => setSelectedPayment(name)} onConfirm={confirmCharge} total={totalDue} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} />
      <ReceiptPreviewModal open={receiptOpen} onClose={() => setReceiptOpen(false)} receiptText={receiptText} />
    </div>
  );
}
