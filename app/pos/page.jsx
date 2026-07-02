"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStableSession } from "@/lib/supabase/session";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { deductInventoryForOrder, normalizeUnit, restoreInventoryForOrder } from "@/lib/inventory";
import { appendKdsTicketItems, markKdsTicketItemVoided, markKdsTicketStatus, upsertKdsTicket, webDiningOptionLabel } from "@/lib/kds";
import { applyAnnualPointResetToMember, resetMemberPointsIfExpired } from "@/lib/loyalty/annualReset";
import { isWelcomeVoucher, WELCOME_VOUCHER_REWARD_TEXT } from "@/lib/loyalty/welcomeVoucher";
import { loyaltyEligibleLineTotal } from "@/lib/menuPromos";
import TicketPanel from "@/components/pos/TicketPanel";
import { Barcode, Bluetooth, CalendarDays, DollarSign, MapPin, MessageSquare, Phone, Printer, RefreshCw, RotateCcw, Save, Search, ShoppingBasket, Star, Trash2 } from "lucide-react";

// Initialize Supabase Client instance cleanly at layout bundle level
const supabaseGlobalInstance = getSupabaseClient();

const DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";
const NIIMBOT_BLE_SERVICE_UUID = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const NIIMBOT_BLE_CHARACTERISTIC_UUID = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
const NIIMBOT_B1_PRO_MODEL = {
  label: "Niimbot B1 Pro",
  id: 4097,
  dpi: 300,
  protocol: "v4",
  task: "v4",
  density: 3,
  label_type: 1,
  speed: 1,
  name_prefixes: ["B1"],
};
const NIIMBOT_50X40_LABEL_SIZE = {
  label: "50 x 40 mm",
  code: "T50*40",
  w_mm: 50,
  h_mm: 40,
  w_px: 591,
  h_px: 472,
  margin: 10,
  dpi: 300,
};
const THERMAL_PAPER_WIDTH_MM = 50;
const RECEIPT_COLUMNS = 32;
const RECEIPT_LOGO_URL = "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";
const POS_AUTO_REFRESH_MS = 5000;
const bluetoothPrinterDeviceCache = new Map();
const bluetoothPrinterCharacteristicCache = new Map();
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
  cup_label: "Niimbot B1 Pro cup label printer, 50mm x 40mm thermal sticker. Reconnect uses saved browser Bluetooth permission.",
};
const PRINTER_ROLE_STATUS = {
  receipt: "Final receipts",
  order_slip: "Kitchen tickets",
  cup_label: "50x40 labels",
};
const POS_OFFLINE_CACHE_KEY = "juja_pos_cached_payload_v1";
const POS_OFFLINE_CHARGE_QUEUE_KEY = "juja_pos_offline_charge_queue_v1";

function createPrinterProfile(role, source = {}) {
  const isCupLabel = role === "cup_label";
  return {
    id: source?.id || null,
    enabled: Boolean(source?.id || source?.is_active),
    name: source?.ble_device_name || source?.name || (isCupLabel ? "NIIMBOT B1 Pro" : `${PRINTER_ROLE_LABELS[role] || "POS"} Printer`),
    model: source?.model || (isCupLabel ? "Niimbot B1 Pro label printer" : "Other model"),
    interface: source?.interface || "Bluetooth",
    paper_width_mm: isCupLabel ? 50 : Number(source?.paper_width_mm || PRINTER_ROLE_DEFAULT_WIDTH[role] || THERMAL_PAPER_WIDTH_MM),
    service_uuid: source?.ble_service_uuid || (isCupLabel ? NIIMBOT_BLE_SERVICE_UUID : DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID),
    characteristic_uuid: source?.ble_characteristic_uuid || (isCupLabel ? NIIMBOT_BLE_CHARACTERISTIC_UUID : DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID),
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

function bluetoothConnectionCacheKeys(cfg = {}) {
  return [
    cfg?.ble_device_id,
    cfg?.ble_device_name,
    cfg?.name,
    `${normalizeBluetoothUuid(cfg?.ble_service_uuid, DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID)}:${normalizeBluetoothUuid(
      cfg?.ble_characteristic_uuid,
      DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID
    )}`,
    "default",
  ].filter(Boolean);
}

function cacheBluetoothPrinterCharacteristic(cfg = {}, characteristic) {
  if (!characteristic) return;
  bluetoothConnectionCacheKeys(cfg).forEach((key) => {
    bluetoothPrinterCharacteristicCache.set(key, characteristic);
  });
}

function getCachedBluetoothPrinterCharacteristic(cfg = {}) {
  const keys = bluetoothConnectionCacheKeys(cfg);
  for (const key of keys) {
    const characteristic = bluetoothPrinterCharacteristicCache.get(key);
    const device = characteristic?.service?.device;
    if (characteristic && device?.gatt?.connected) return characteristic;
  }
  return null;
}

function forgetBluetoothPrinterCharacteristic(cfg = {}) {
  bluetoothConnectionCacheKeys(cfg).forEach((key) => bluetoothPrinterCharacteristicCache.delete(key));
}

function bluetoothDeviceMatchesConfig(device, cfg = {}) {
  if (!device) return false;
  if (cfg?.ble_device_id && device.id === cfg.ble_device_id) return true;
  if (cfg?.ble_device_name && device.name === cfg.ble_device_name) return true;
  if (cfg?.name && device.name === cfg.name) return true;
  const configuredName = String(cfg?.ble_device_name || cfg?.name || "").trim().toLowerCase();
  const deviceName = String(device.name || "").trim().toLowerCase();
  return Boolean(configuredName && deviceName && (configuredName.includes(deviceName) || deviceName.includes(configuredName)));
}

async function warmBluetoothPrinterDeviceCache(configByRole = {}) {
  if (typeof navigator === "undefined" || !navigator.bluetooth?.getDevices) return;
  const devices = await navigator.bluetooth.getDevices();
  Object.values(configByRole || {}).forEach((cfg) => {
    if (!cfg) return;
    const match = devices.find((device) => bluetoothDeviceMatchesConfig(device, cfg));
    if (match) cacheBluetoothPrinterDevice(match, cfg);
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
    const match = devices.find((device) => bluetoothDeviceMatchesConfig(device, cfg));
    if (match) {
      cacheBluetoothPrinterDevice(match, cfg);
      return match;
    }
  }

  throw new Error("Bluetooth printer permission is not available in this browser. Open POS Settings, choose the printer once, then save it. Browsers cannot keep a live Bluetooth connection after refresh or app close.");
}

async function bleConnect(cfg) {
  const cachedCharacteristic = getCachedBluetoothPrinterCharacteristic(cfg);
  if (cachedCharacteristic) return cachedCharacteristic;

  const serviceUuid = normalizeBluetoothUuid(cfg?.ble_service_uuid, DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID);
  const characteristicUuid = normalizeBluetoothUuid(
    cfg?.ble_characteristic_uuid,
    DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID
  );
  const device = await findSavedBluetoothDevice(cfg, serviceUuid);

  const server = await device.gatt?.connect();
  const service = await server?.getPrimaryService(serviceUuid);
  const characteristic = await service?.getCharacteristic(characteristicUuid);

  cacheBluetoothPrinterDevice(device, cfg);
  cacheBluetoothPrinterCharacteristic(cfg, characteristic);
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

function isNiimbotCupLabelConfig(role, cfg = {}) {
  if (role !== "cup_label") return false;
  const marker = `${cfg?.model || ""} ${cfg?.ble_device_name || ""} ${cfg?.name || ""}`.toLowerCase();
  return marker.includes("niimbot") || marker.includes("b1 pro") || marker.includes("b1");
}

function wrapLabelCanvasText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function renderNiimbotCupLabelImage(text) {
  if (typeof document === "undefined") throw new Error("Label rendering is only available in the browser.");
  const canvas = document.createElement("canvas");
  canvas.width = NIIMBOT_50X40_LABEL_SIZE.w_px;
  canvas.height = NIIMBOT_50X40_LABEL_SIZE.h_px;
  canvas.style.width = `${NIIMBOT_50X40_LABEL_SIZE.w_mm}mm`;
  canvas.style.height = `${NIIMBOT_50X40_LABEL_SIZE.h_mm}mm`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create cup label canvas.");

  const margin = 24;
  const width = canvas.width - margin * 2;
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dining = lines[0] || "ORDER";
  const itemName = lines[1] || "Item";
  const footerRaw = lines[lines.length - 1] || `#ORDER|${formatCupLabelDateTime(new Date())}`;
  const [footerLeftRaw, footerRightRaw] = footerRaw.split("|");
  const footerLeft = normalizeLabelLine(footerLeftRaw || "");
  const footerRight = normalizeLabelLine(footerRightRaw || "");
  const detailLines = lines.slice(2, -1).filter((line) => line !== "---");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = 18;
  const drawWrapped = (value, font, lineHeight, maxLines = 4) => {
    ctx.font = font;
    const wrapped = wrapLabelCanvasText(ctx, value, width).slice(0, maxLines);
    wrapped.forEach((line) => {
      ctx.fillText(line, margin, y);
      y += lineHeight;
    });
  };

  drawWrapped(dining, "800 54px Arial, sans-serif", 60, 1);
  y += 8;

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(canvas.width - margin, y);
  ctx.stroke();
  y += 20;

  drawWrapped(itemName, "800 42px Arial, sans-serif", 48, 2);
  y += 4;

  detailLines.forEach((line) => {
    const isNote = /^note:/i.test(line);
    drawWrapped(line, `${isNote ? "700" : "500"} ${isNote ? 31 : 34}px Arial, sans-serif`, isNote ? 37 : 38, isNote ? 2 : 1);
    y += isNote ? 4 : 0;
  });

  const footerY = canvas.height - 48;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin, footerY - 16);
  ctx.lineTo(canvas.width - margin, footerY - 16);
  ctx.stroke();

  ctx.font = "500 28px Arial, sans-serif";
  ctx.fillText(footerLeft, margin, footerY);
  const rightWidth = ctx.measureText(footerRight).width;
  ctx.fillText(footerRight, canvas.width - margin - rightWidth, footerY);
  return canvas.toDataURL("image/png");
}

async function getNiimbotDriver() {
  if (typeof window === "undefined") throw new Error("Niimbot printing is only available in the browser.");
  if (!window.Niimbot) await import("niimbot-web-bluetooth");
  if (!window.Niimbot?.isSupported?.()) throw new Error("Niimbot Web Bluetooth needs Chrome or Edge over HTTPS, or localhost.");
  return window.Niimbot;
}

async function withRememberedNiimbotDevice(cfg, callback) {
  if (typeof navigator === "undefined" || !navigator.bluetooth?.requestDevice) return callback();
  const originalRequestDevice = navigator.bluetooth.requestDevice.bind(navigator.bluetooth);
  let patched = false;
  try {
    navigator.bluetooth.requestDevice = async (options) => {
      try {
        return await findSavedBluetoothDevice(cfg, NIIMBOT_BLE_SERVICE_UUID);
      } catch {
        return originalRequestDevice(options);
      }
    };
    patched = true;
  } catch {}
  try {
    return await callback();
  } finally {
    if (patched) navigator.bluetooth.requestDevice = originalRequestDevice;
  }
}

async function printNiimbotCupLabel(text, cfg) {
  const Niimbot = await getNiimbotDriver();
  const imageUrl = renderNiimbotCupLabelImage(text);
  await withRememberedNiimbotDevice(cfg, () =>
    Niimbot.printImage(imageUrl, {
      model: NIIMBOT_B1_PRO_MODEL,
      size: NIIMBOT_50X40_LABEL_SIZE,
      copies: 1,
    })
  );
  return true;
}

// ================= PRINT ROUTER =================

async function printByRole(role, text, printerConfig, opts = {}) {
  const cfg = printerConfig?.[role];
  const fallbackToBrowser = opts.fallbackToBrowser !== false;

  if (!cfg) {
    if (fallbackToBrowser) print58mmTextBrowser(text);
    else throw new Error(`${PRINTER_ROLE_LABELS[role] || "Printer"} Bluetooth printer is not configured.`);
    return false;
  }

  if (cfg.transport === "browser") {
    if (!fallbackToBrowser) throw new Error(`${PRINTER_ROLE_LABELS[role] || "Printer"} is set to browser preview, not Bluetooth.`);
    print58mmTextBrowser(text);
    return true;
  }

  try {
    if (isNiimbotCupLabelConfig(role, cfg)) {
      return await printNiimbotCupLabel(text, cfg);
    }
    const characteristic = await bleConnect(cfg);
    await blePrint(characteristic, text, role);
    return true;
  } catch (err) {
    forgetBluetoothPrinterCharacteristic(cfg);
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

function customerDisplayPhone(customer) {
  return customer?.phone || customer?.Phone || customer?.contact_number || customer?.customer_contact || "";
}

function customerAvailablePoints(customer) {
  return Number(customer?.availablePoints ?? customer?.available_points ?? customer?.["Available points"] ?? 0);
}

function customerPointsBalance(customer) {
  return Number(customer?.pointsBalance ?? customer?.points_balance ?? customer?.["Points balance"] ?? customer?.["Points Balance"] ?? 0);
}

function customerField(customer, keys, fallback = "") {
  for (const key of keys) {
    const value = customer?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function formatCustomerDate(value) {
  if (!value) return "-";
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCustomerDateTime(value) {
  if (!value) return "-";
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(",", " at");
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

function formatCupLabelDateTime(value) {
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}-${String(parts.month || "").toUpperCase()} | ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

function formatReceiptDateTime(value) {
  const date = coerceReceiptTimestamp(value);
  if (isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

function receiptDisplayTimestamp(row) {
  return row?.paid_at || row?.completed_at || row?.closed_at || row?.receipt_date || row?.created_at || null;
}

function readJsonStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function isProbablyOfflineError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed",
    "timeout",
    "err_internet_disconnected",
    "fetch failed",
  ].some((needle) => message.includes(needle));
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
  loyaltyAlreadyAwarded = false,
  loyaltyEligibleTotal = null,
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
  const customerPhone = customerDisplayPhone(customer);
  const pointsBaseValue = loyaltyEligibleTotal === null || typeof loyaltyEligibleTotal === "undefined"
    ? totalValue
    : Number(loyaltyEligibleTotal || 0);
  const pointsEarned = customerName ? calcLoyaltyPoints(pointsBaseValue) : 0;
  const availablePoints = customerName
    ? Number((customerAvailablePoints(customer) + (loyaltyAlreadyAwarded ? 0 : pointsEarned)).toFixed(2))
    : 0;

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
    if (customerPhone) lines.push(customerPhone);
    lines.push(receiptLine());
  }

  lines.push(String(dining).toUpperCase());
  lines.push(receiptLine());

  if (voucher?.code) {
    lines.push(`Voucher: ${voucher.code}`);
    const voucherRewardText = displayVoucherRewardText(voucher);
    if (voucherRewardText) {
      splitReceiptText(voucherRewardText, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    }
  }
  if (appliedDiscount?.name) lines.push(`Discount: ${appliedDiscount.name}`);
  if (voucher?.code || appliedDiscount?.name) lines.push(receiptLine());

  cart.forEach((x) => {
    const quantity = Number(x.quantity || 1);
    const unitPrice = Number(x.unitPrice || 0);
    const lineTotal = unitPrice * quantity;
    const itemDiscount = lineDiscountAmount(x);
    const netLineTotal = Math.max(0, lineTotal - itemDiscount);
    const nameLines = splitReceiptText(x.name || "Item", RECEIPT_COLUMNS - 12);
    lines.push(receiptPair(nameLines[0], receiptAmount(netLineTotal)));
    nameLines.slice(1).forEach((line) => lines.push(line));
    lines.push(`${quantity} x ${receiptAmount(unitPrice)}`);
    const optionLines = selectedOptionReceiptLines(x);
    const instructions = normalizeLabelLine(x.instructions || x.specialInstructions || x.special_instructions || "");
    optionLines.forEach((optionLine) => {
      splitReceiptText(optionLine, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    });
    if (instructions) splitReceiptText(`Note: ${instructions}`, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    if (itemDiscount > 0) lines.push(receiptPair("  Item discount", `-${receiptAmount(itemDiscount)}`));
  });
  lines.push(receiptLine());
  if (customerName) {
    lines.push(receiptPair("Points earned", receiptAmount(pointsEarned)));
    lines.push(receiptPair("Points balance", receiptAmount(availablePoints)));
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

function buildOrderSlipText({ orderId, cart, diningOptionName, customerName, total, printedAt, slipTitle = "ORDER SLIP" }) {
  const lines = [
    centerReceiptText(slipTitle),
    centerReceiptText(normalizeLabelLine(diningOptionName || "POS ORDER").toUpperCase()),
    receiptLine(),
    `Order: ${orderId || "-"}`,
  ];
  const customer = normalizeLabelLine(customerName);
  if (customer) lines.push(`Customer: ${customer}`);
  lines.push(receiptLine());

  (cart || []).forEach((x) => {
    const quantity = Number(x.quantity || x.qty || 1);
    const name = normalizeLabelLine(x.name || "Item");
    splitReceiptText(`${quantity}x ${name}`, RECEIPT_COLUMNS).forEach((line) => lines.push(line));

    const variants = normalizeLabelLine(x.variantDetails || "");
    const instructions = normalizeLabelLine(x.instructions || x.specialInstructions || x.special_instructions || "");
    if (variants) splitReceiptText(variants, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    if (instructions) splitReceiptText(`Note: ${instructions}`, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
  });

  lines.push(receiptLine());
  lines.push(receiptPair("Printed", formatReceiptFooterDate(printedAt || new Date())));
  return lines.join("\n");
}

function buildBillText({ receiptSettings, orderId, cart, diningOptionName, customerName, subtotal, discount, total, printedAt, store }) {
  const rs = receiptSettings || {};
  const header = (rs.header_text || "").trim();
  const branchName = store?.store_name || store?.name || store?.branch_name || "Pasong Tamo";
  const businessName = store?.business_name || "Juja Brew & Bites";
  const receiptTitle = store?.receipt_title || `${branchName}`;
  const address = store?.address || "36D Visayas Ave., Pasong Tamo, Quezon City";
  const subtotalValue = Number(subtotal || 0);
  const discountValue = Number(discount || 0);
  const totalValue = Number(total ?? Math.max(0, subtotalValue - discountValue));
  const lines = [];
  lines.push(centerReceiptText(businessName));
  lines.push(centerReceiptText(header || receiptTitle));
  splitReceiptText(address, RECEIPT_COLUMNS).forEach((line) => lines.push(centerReceiptText(line)));
  lines.push(receiptLine());
  lines.push(centerReceiptText("BILL"));
  lines.push(receiptLine());
  lines.push(`Order: ${orderId || "-"}`);
  lines.push(`Dining: ${normalizeLabelLine(diningOptionName || "POS ORDER")}`);
  const customer = normalizeLabelLine(customerName);
  if (customer) lines.push(`Customer: ${customer}`);
  lines.push(receiptLine());

  (cart || []).forEach((x) => {
    const quantity = Number(x.quantity || x.qty || 1);
    const unitPrice = Number(x.price ?? x.unitPrice ?? x.unit_price ?? 0);
    const lineTotal = lineNetAmount({ ...x, unitPrice, quantity });
    const itemDiscount = lineDiscountAmount({ ...x, unitPrice, quantity });
    const nameLines = splitReceiptText(normalizeLabelLine(x.name || "Item"), RECEIPT_COLUMNS - 12);
    lines.push(receiptPair(nameLines[0], receiptAmount(lineTotal)));
    nameLines.slice(1).forEach((line) => lines.push(line));
    lines.push(`${quantity} x ${receiptAmount(unitPrice)}`);
    const optionLines = selectedOptionReceiptLines(x);
    const instructions = normalizeLabelLine(x.instructions || x.specialInstructions || x.special_instructions || "");
    optionLines.forEach((optionLine) => {
      splitReceiptText(optionLine, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    });
    if (instructions) splitReceiptText(`Note: ${instructions}`, RECEIPT_COLUMNS).forEach((line) => lines.push(`  ${line}`));
    if (itemDiscount > 0) lines.push(receiptPair("  Item discount", `-${receiptAmount(itemDiscount)}`));
    if (x.appliedVoucher?.code) {
      lines.push(`  Voucher: ${x.appliedVoucher.code}`);
      const voucherRewardText = displayVoucherRewardText(x.appliedVoucher);
      if (voucherRewardText) {
        splitReceiptText(voucherRewardText, RECEIPT_COLUMNS - 2).forEach((line) => lines.push(`  ${line}`));
      }
    }
  });

  lines.push(receiptLine());
  if (discountValue > 0) {
    lines.push(receiptPair("Subtotal", receiptAmount(subtotalValue)));
    lines.push(receiptPair("Discount", `-${receiptAmount(discountValue)}`));
  }
  lines.push(receiptPair("Total Due", receiptAmount(totalValue)));
  lines.push(receiptLine());
  lines.push(receiptPair("Printed", formatReceiptFooterDate(printedAt || new Date())));
  return lines.join("\n");
}

function buildEndDayReportText({ store, cashierName, startingCash, actualCash, denominations, summary, printedAt, title = "END DAY SALES REPORT" }) {
  const branchName = store?.store_name || store?.name || store?.branch_name || "Store";
  const expectedCash = Number(summary?.expectedCash || 0);
  const actualCashValue = Number(actualCash || 0);
  const difference = actualCashValue - expectedCash;
  const lines = [
    centerReceiptText(title),
    centerReceiptText(branchName),
    receiptLine(),
    receiptPair("Printed", formatReceiptFooterDate(printedAt || new Date())),
    receiptPair("Cashier", normalizeLabelLine(cashierName || "Operator")),
    receiptLine(),
    "CASH DRAWER",
    receiptPair("Starting cash", receiptAmount(startingCash || 0)),
    receiptPair("Cash payments", receiptAmount(summary?.cashPayments || 0)),
    receiptPair("Cash refunds", receiptAmount(summary?.cashRefunds || 0)),
    receiptPair("Expected cash", receiptAmount(expectedCash)),
    receiptPair("Actual cash", receiptAmount(actualCashValue)),
    receiptPair("Difference", `${difference < 0 ? "-" : ""}${receiptAmount(Math.abs(difference))}`),
    receiptLine(),
    "CASH BREAKDOWN",
  ];

  SHIFT_DENOMINATIONS.forEach((denom) => {
    const count = Number(denominations?.[denom] || 0);
    if (count > 0) lines.push(receiptPair(`${receiptAmount(denom)} x ${count}`, receiptAmount(denom * count)));
  });

  lines.push(receiptLine());
  lines.push("SALES SUMMARY");
  lines.push(receiptPair("Gross sales", receiptAmount(summary?.grossSales || 0)));
  lines.push(receiptPair("Refunds", receiptAmount(summary?.refunds || 0)));
  lines.push(receiptPair("Discounts", receiptAmount(summary?.discounts || 0)));
  lines.push(receiptPair("Net sales", receiptAmount(summary?.netSales || 0)));
  lines.push(receiptLine());
  Object.entries(summary?.payments || {}).forEach(([label, value]) => {
    lines.push(receiptPair(label, receiptAmount(value || 0)));
  });
  lines.push("");
  lines.push(centerReceiptText("END OF DAY"));
  return lines.join("\n");
}

function getLineCategoryId(line) {
  return line?.categoryId || line?.category_id || line?.menu_category_id || line?.category?.id || null;
}

function filterItemsByPrinterGroup(cart, categoryIds = [], categoryNames = []) {
  const groupIds = new Set((categoryIds || []).map((id) => String(id)));
  const groupNames = new Set((categoryNames || []).map((name) => String(name || "").trim().toLowerCase()).filter(Boolean));
  if (groupIds.size === 0 && groupNames.size === 0) return [];

  return (cart || []).filter((line) => {
    const categoryId = getLineCategoryId(line);
    const categoryName = String(line.category || line.categoryName || line.category_name || "").trim().toLowerCase();
    return (categoryId && groupIds.has(String(categoryId))) || (categoryName && groupNames.has(categoryName));
  });
}

function filterItemsByBarPrinterGroup(cart, barCategoryIds = [], barCategoryNames = []) {
  return filterItemsByPrinterGroup(cart, barCategoryIds, barCategoryNames);
}

function normalizeLabelLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseReceiptSelectedOptions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.entries(parsed).flatMap(([groupName, options]) => {
        const values = Array.isArray(options) ? options : [options];
        return values.map((option) => (
          typeof option === "object"
            ? { ...option, groupName: option.groupName || option.group_name || groupName }
            : { groupName, name: option }
        ));
      });
    } catch {
      return trimmed.split(",").map((name) => ({ name: normalizeLabelLine(name) })).filter((option) => option.name);
    }
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([groupName, options]) => {
      const values = Array.isArray(options) ? options : [options];
      return values.map((option) => (
        typeof option === "object"
          ? { ...option, groupName: option.groupName || option.group_name || groupName }
          : { groupName, name: option }
      ));
    });
  }
  return [];
}

function selectedOptionReceiptLines(item) {
  const selectedOptions = parseReceiptSelectedOptions(item?.selectedOptions || item?.selected_options || item?.options || item?.modifiers);

  if (selectedOptions.length > 0) {
    const grouped = new Map();
    selectedOptions.forEach((option) => {
      const groupName = normalizeLabelLine(option?.groupName || option?.group_name || option?.group || "Options");
      const optionName = normalizeLabelLine(option?.name || option?.label || option?.option_name || option?.value);
      if (!optionName) return;
      if (!grouped.has(groupName)) grouped.set(groupName, []);
      grouped.get(groupName).push(optionName);
    });

    return Array.from(grouped.entries())
      .map(([groupName, optionNames]) => `${groupName}: ${optionNames.join(", ")}`)
      .filter(Boolean);
  }

  const variantDetails = normalizeLabelLine(item?.variantDetails || item?.variant_details || item?.variant || "");
  return variantDetails ? [variantDetails] : [];
}

function receiptItemDisplayLines(item) {
  const lines = selectedOptionReceiptLines(item);
  const instructions = normalizeLabelLine(item?.instructions || item?.note || item?.specialInstructions || item?.special_instructions || "");
  if (instructions) lines.push(`Note: ${instructions}`);
  return lines;
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
    const footer = normalizeLabelLine(`${formatCupLabelDateTime(printedAt || new Date())}|${shortReceiptNumber(orderId)}`);

    for (let i = 0; i < x.quantity; i++) {
      const lines = [
        dining,
        itemName,
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

function CustomerAccountDetailsModal({ open, onClose, customer }) {
  const name = customerDisplayName(customer) || "Customer Account";
  const phone = customerDisplayPhone(customer) || "-";
  const code = customerDisplayCode(customer) || "-";
  const address = customerField(customer, ["city", "City", "address", "Address", "city_address", "City Address"], "-");
  const birthday = customerField(customer, ["birthday", "Birthday", "birthdate", "Birthdate", "Note", "note"], "-");
  const firstVisit = customerField(customer, ["First visit", "first_visit", "firstVisit"], "");
  const lastVisit = customerField(customer, ["Last visit", "last_visit", "lastVisit"], "");
  const visits = Number(customerField(customer, ["Total visits", "total_visits", "visits"], 0));
  const totalSpent = Number(customerField(customer, ["Total spent", "total_spent", "spent"], 0));
  const pointsBalance = customerPointsBalance(customer);
  const availablePoints = customerAvailablePoints(customer);

  return (
    <ModalShell open={open} onClose={onClose} title="Customer Account" subtitle={name} z={145}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-5 text-slate-900">
          <h3 className="text-center text-xl font-semibold tracking-tight">{name}</h3>
          <div className="mt-5 space-y-4 text-[12px] text-slate-800">
            {[
              { icon: Phone, value: phone },
              { icon: MapPin, value: address },
              { icon: Barcode, value: code },
              { icon: MessageSquare, value: birthday },
            ].map(({ icon: Icon, value }, index) => (
              <div key={`${value}-${index}`} className="grid grid-cols-[20px_1fr] items-center gap-4">
                <Icon className="h-4 w-4 text-slate-500" />
                <span className="leading-snug">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-slate-200 bg-slate-50 px-5 py-5 text-[12px] text-slate-900">
          {[
            { icon: CalendarDays, value: formatCustomerDate(firstVisit), label: "First visit" },
            { icon: CalendarDays, value: formatCustomerDateTime(lastVisit), label: "Last visit" },
            { icon: ShoppingBasket, value: visits.toLocaleString("en-PH"), label: "Visits" },
            { icon: DollarSign, value: peso2(totalSpent), label: "Total spent" },
            { icon: Star, value: pointsBalance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), label: "Points balance" },
            { icon: Star, value: availablePoints.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), label: "Available points" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="grid grid-cols-[22px_1fr] gap-3">
              <Icon className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="font-semibold leading-tight text-slate-950">{value}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
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

const TARGET_WEB_STATUSES = ["pending", "scheduled", "accepted", "preparing", "ready", "Pending", "Scheduled", "Accepted", "Preparing", "Ready"];
const ACTIVE_VOUCHER_STATUSES = ["active", "available"];
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

async function requestScannerCameraAccess() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not available in this browser. Use HTTPS or the installed POS app.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
  });
  stream.getTracks().forEach((track) => track.stop());
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
      await requestScannerCameraAccess();
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
      setErrMsg(e?.message || "Unable to start camera scanner. Allow camera access, then try again.");
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
                      {webDiningOptionLabel(order.fulfillment_type || order.dining_option)} {order.fulfillment_time ? `• ${order.fulfillment_time}` : ""}
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
                  {v.reward_type === "birthday" ? "Birthday Special" : v.reward_type === "welcome" ? "Welcome Voucher" : "Points Voucher"}
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

function AddToCartModal({ item, onClose, onAddToCart, discountRules = [] }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");
  const [itemDiscountRuleId, setItemDiscountRuleId] = useState("");
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    if (!item) return;
    const source = item.editData || item;

    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");
    setItemDiscountRuleId(source.discountRuleId || source.discount_rule_id || "");

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
  const itemDiscountRule = discountRules.find((rule) => String(rule.id) === String(itemDiscountRuleId));
  const discountValue = Math.max(0, Math.min(unitPrice * Number(quantity || 1), discountAmountFromRule(itemDiscountRule, unitPrice * Number(quantity || 1))));
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
      basePrice: option.basePrice ?? option.base_price ?? option.price ?? 0,
      priceChannel: option.priceChannel || item.priceChannel || item.price_channel || null,
      groupId,
      groupName: group.name || group.label || group.id || "Options",
    }));
  });

  const totalLine = Math.max(0, unitPrice * quantity - discountValue).toFixed(0);
  const submitLine = () =>
    onAddToCart({
      id: item.id,
      name: item.name,
      category: item.category || item.category_name || null,
      categoryId: item.category_id || item.menu_category_id || null,
      priceChannel: item.priceChannel || item.price_channel || null,
      basePrice: item.basePrice ?? item.base_price ?? item.price ?? null,
      unitPrice,
      quantity,
      discountAmount: discountValue,
      discountRuleId: itemDiscountRule?.id || null,
      discountName: itemDiscountRule?.name || itemDiscountRule?.discount_name || null,
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

      {discountRules.length > 0 && (
        <div className="mt-4">
          <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Item Discount</label>
          <select
            value={itemDiscountRuleId}
            onChange={(e) => setItemDiscountRuleId(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#FC687D]"
          >
            <option value="">No item discount</option>
            {discountRules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name || rule.discount_name || "Discount"}
              </option>
            ))}
          </select>
          {discountValue > 0 && (
            <p className="mt-1 text-[10px] font-semibold text-slate-500">
              Discount: -{peso2(discountValue)}
            </p>
          )}
        </div>
      )}

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
  const isZeroDue = due <= 0;
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
    isZeroDue
      ? false
      : useSplitPayment
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
            : { amountPaid: isZeroDue ? 0 : amt, changeDue: isZeroDue ? 0 : change })}
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
  const title = mode === "open" ? "Open Shift" : mode === "end_day" ? "End Day" : "Close Shift";
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

function lineGrossAmount(line) {
  return Number(line?.unitPrice || line?.price || 0) * Number(line?.quantity || line?.qty || 0);
}

function lineDiscountAmount(line) {
  return Math.max(0, Math.min(lineGrossAmount(line), Number(line?.discountAmount || line?.discount_amount || 0)));
}

function lineNetAmount(line) {
  return Math.max(0, lineGrossAmount(line) - lineDiscountAmount(line));
}

function voucherDiscountRate(voucher) {
  return isWelcomeVoucher(voucher) ? 0.5 : 1;
}

function displayVoucherRewardText(voucher) {
  return isWelcomeVoucher(voucher) ? WELCOME_VOUCHER_REWARD_TEXT : voucher?.reward_text;
}

function restoreVoucherLine(line) {
  const next = { ...line };
  if (typeof next._origUnitPrice === "number") next.unitPrice = next._origUnitPrice;
  if (typeof next._origDiscountAmount === "number") next.discountAmount = next._origDiscountAmount;
  else delete next.discountAmount;
  delete next._origUnitPrice;
  delete next._origDiscountAmount;
  delete next.appliedVoucher;
  return next;
}

function cartLoyaltyEligibleTotal(lines = []) {
  return (lines || []).reduce((sum, line) => sum + loyaltyEligibleLineTotal(line, lineNetAmount(line)), 0);
}

function jsonSafeValue(value) {
  return JSON.parse(JSON.stringify(value, (_key, current) => {
    if (typeof current === "number" && !Number.isFinite(current)) return 0;
    if (typeof current === "undefined" || typeof current === "function" || typeof current === "symbol") return null;
    return current;
  }));
}

function shiftStorageKey(storeId, cashierId, key) {
  return `pos_shift_${key}_${storeId || "no-store"}_${cashierId || "no-cashier"}`;
}

function getLatestShiftRecord(records, storeId, cashierId) {
  const rows = Array.isArray(records) ? records : [];
  const scoped = rows.filter((row) => {
    if (storeId && String(row.store_id || "") !== String(storeId)) return false;
    const mode = getShiftRecordMode(row);
    const isStoreEndDay = mode.includes("end_day") || mode.includes("end day");
    if (cashierId && String(row.cashier_id || "") !== String(cashierId) && !isStoreEndDay) return false;
    return true;
  });
  return [...scoped].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;
}

function getShiftRecordMode(record) {
  return String(record?.mode || record?.shift_type || record?.type || record?.action || "").toLowerCase();
}

function parseShiftJsonValue(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return typeof value === "object" ? value : fallback;
}

function getShiftStatusFromRecords(records, storeId, cashierId) {
  const latest = getLatestShiftRecord(records, storeId, cashierId);
  const mode = getShiftRecordMode(latest);
  if (mode.includes("end_day") || mode.includes("end day")) return "closed";
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
  const [orderSlipPrinterGroups, setOrderSlipPrinterGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);
  const [recipeRows, setRecipeRows] = useState([]);
  const [recipeInventoryItems, setRecipeInventoryItems] = useState([]);
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState("all");
  const [recipeMenuSearch, setRecipeMenuSearch] = useState("");

  const [paymentTypes, setPaymentTypes] = useState([]);
  const [, setTicketTemplates] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(null);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const [menuSearch, setMenuSearch] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [diningOption, setDiningOption] = useState("");
  const [grabOrderNumber, setGrabOrderNumber] = useState("");
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
  const [selectedShiftReportId, setSelectedShiftReportId] = useState("");
  const [printerForm, setPrinterForm] = useState(() => createPrinterProfiles());

  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printerPermissionRole, setPrinterPermissionRole] = useState(null);
  const [charging, setCharging] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [moving, setMoving] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // New persistent pointer reference state to bind edited web orders back cleanly
  const [activeWebOrderId, setActiveWebOrderId] = useState(null);
  const [activeWebOrderBranchId, setActiveWebOrderBranchId] = useState(null);
  const [activeWebOrderFulfillmentType, setActiveWebOrderFulfillmentType] = useState("");

  const selectedDining = useMemo(
    () => (diningOptions || []).find((d) => String(d.id) === String(diningOption)) || null,
    [diningOptions, diningOption]
  );

  const diningOptionName = selectedDining?.name || "";
  const isGrabDiningOption = /grab/i.test(diningOptionName || "");
  const isPandaDiningOption = /panda|foodpanda/i.test(diningOptionName || "");
  const activeMenuChannel = isGrabDiningOption ? "grab" : isPandaDiningOption ? "panda" : "standard";
  const trimmedGrabOrderNumber = String(grabOrderNumber || "")
    .trim()
    .replace(/^grab[\s-]*/i, "");
  const ticketDiningLabel = isGrabDiningOption && trimmedGrabOrderNumber ? `${diningOptionName} ${trimmedGrabOrderNumber}` : diningOptionName;
  const itemPriceForChannel = (item, channel = activeMenuChannel) => {
    const basePrice = Number(item?.price || 0);
    if (channel === "grab" && item?.grab_price !== null && item?.grab_price !== undefined && item?.grab_price !== "") {
      return Number(item.grab_price) || 0;
    }
    if (channel === "panda" && item?.panda_price !== null && item?.panda_price !== undefined && item?.panda_price !== "") {
      return Number(item.panda_price) || 0;
    }
    return basePrice;
  };
  const optionPriceForChannel = (option, channel = activeMenuChannel) => {
    const basePrice = Number(option?.price || 0);
    if (channel === "grab" && option?.grab_price !== null && option?.grab_price !== undefined && option?.grab_price !== "") {
      return Number(option.grab_price) || 0;
    }
    if (channel === "panda" && option?.panda_price !== null && option?.panda_price !== undefined && option?.panda_price !== "") {
      return Number(option.panda_price) || 0;
    }
    return basePrice;
  };
  const itemAvailableForChannel = (item, channel = activeMenuChannel) => {
    if (channel === "grab") return item?.grab_available !== false;
    if (channel === "panda") return item?.panda_available !== false;
    return true;
  };
  const itemForActiveChannel = (item) => {
    const price = itemPriceForChannel(item);
    const variants = Array.isArray(item?.variants)
      ? item.variants.map((group) => ({
          ...group,
          options: Array.isArray(group.options)
            ? group.options.map((option) => ({
                ...option,
                basePrice: Number(option?.price || 0),
                price: optionPriceForChannel(option),
                priceChannel: activeMenuChannel,
              }))
            : [],
        }))
      : [];
    return {
      ...item,
      basePrice: Number(item?.price || 0),
      price,
      variants,
      priceChannel: activeMenuChannel,
      channel_price_label: activeMenuChannel === "grab" ? "GRAB" : activeMenuChannel === "panda" ? "PANDA" : "",
    };
  };
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
    dining_option: webDiningOptionLabel(overrides.fulfillment_type || order?.fulfillment_type || order?.dining_option || order?.order_type),
    fulfillment_type: overrides.fulfillment_type || order?.fulfillment_type || order?.dining_option || null,
    store_id: overrides.store_id || getWebOrderStoreId(order) || activeWebOrderBranchId || storeId || null,
    branch_id: overrides.branch_id || getWebOrderStoreId(order) || activeWebOrderBranchId || storeId || null,
    items: enrichOrderItemsForKds(overrides.items || order?.items || []),
  });

  const fetchOpenTicketLineItems = async (ticketIds = []) => {
    const ids = [...new Set((ticketIds || []).filter(Boolean).map(String))];
    const grouped = new Map();
    if (ids.length === 0) return grouped;

    const { data, error } = await supabase
      .from("open_ticket_items")
      .select("ticket_id, line_index, item_data")
      .in("ticket_id", ids)
      .order("line_index", { ascending: true });

    if (error) {
      console.warn("Open ticket line-item load skipped:", error);
      return grouped;
    }

    (data || []).forEach((row) => {
      const key = String(row.ticket_id);
      const lines = grouped.get(key) || [];
      lines.push(row.item_data);
      grouped.set(key, lines);
    });
    return grouped;
  };

  const syncOpenTicketLineItems = async (ticketId, ticketItems = []) => {
    if (!ticketId) return;
    const safeItems = jsonSafeValue(enrichOrderItemsForKds(ticketItems));

    const { error: deleteError } = await supabase
      .from("open_ticket_items")
      .delete()
      .eq("ticket_id", ticketId);

    if (deleteError) {
      console.warn("Open ticket line-item delete skipped:", deleteError);
      return;
    }

    if (safeItems.length === 0) return;

    const rows = safeItems.map((item, index) => ({
      ticket_id: ticketId,
      line_index: index,
      item_data: item,
    }));

    const { error: insertError } = await supabase.from("open_ticket_items").insert(rows);
    if (insertError) throw insertError;
  };

  const stableTicketLineKey = (line) => {
    if (line?.cartItemId) return `cart:${line.cartItemId}`;
    const selectedOptions = Array.isArray(line?.selectedOptions)
      ? line.selectedOptions
      : Array.isArray(line?.selected_options)
        ? line.selected_options
        : [];
    return JSON.stringify({
      menuItemId: line?.menuItemId || line?.menu_item_id || line?.id || null,
      name: normalizeLabelLine(line?.name || line?.item_name || ""),
      unitPrice: Number(line?.unitPrice ?? line?.price ?? line?.unit_price ?? 0),
      variantDetails: normalizeLabelLine(line?.variantDetails || line?.variant_details || ""),
      instructions: normalizeLabelLine(line?.instructions || line?.specialInstructions || line?.special_instructions || ""),
      selectedOptions,
      voucherId: line?.appliedVoucher?.id || line?.applied_voucher?.id || null,
      voided: Boolean(line?.voided || line?.isVoided),
    });
  };

  const getAddedTicketLines = (previousItems = [], nextItems = []) => {
    const previousQuantities = new Map();
    (Array.isArray(previousItems) ? previousItems : []).forEach((line) => {
      const key = stableTicketLineKey(line);
      previousQuantities.set(key, (previousQuantities.get(key) || 0) + Number(line?.quantity || line?.qty || 1));
    });

    return (Array.isArray(nextItems) ? nextItems : [])
      .map((line, index) => {
        const key = stableTicketLineKey(line);
        const nextQty = Number(line?.quantity || line?.qty || 1);
        const prevQty = Number(previousQuantities.get(key) || 0);
        previousQuantities.set(key, Math.max(0, prevQty - nextQty));
        const addedQty = Math.max(0, nextQty - prevQty);
        if (addedQty <= 0) return null;
        return {
          ...line,
          quantity: addedQty,
          qty: addedQty,
          cartItemId: `${line?.cartItemId || line?.id || "line"}-add-${Date.now()}-${index}`,
        };
      })
      .filter(Boolean);
  };

  const getKitchenPrinterGroupItems = (lines = []) => {
    const kitchenGroup = (orderSlipPrinterGroups || []).find((group) => group.key === "kitchen");
    if (!kitchenGroup) return [];
    return filterItemsByPrinterGroup(lines, kitchenGroup.categoryIds, kitchenGroup.categoryNames);
  };

  const clearActiveWebOrderContext = () => {
    setActiveWebOrderId(null);
    setActiveWebOrderBranchId(null);
    setActiveWebOrderFulfillmentType("");
  };

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 3500);
  };

  const readOfflineChargeQueue = () => readJsonStorage(POS_OFFLINE_CHARGE_QUEUE_KEY, []);

  const writeOfflineChargeQueue = (queue) => {
    const safeQueue = Array.isArray(queue) ? queue : [];
    writeJsonStorage(POS_OFFLINE_CHARGE_QUEUE_KEY, safeQueue);
    setOfflineQueueCount(safeQueue.length);
  };

  const queueOfflineCharge = (draft) => {
    const queue = readOfflineChargeQueue();
    writeOfflineChargeQueue([...queue, draft]);
  };

  async function replayOfflineCharge(draft) {
    const resolvedBranchId = draft?.store_id || draft?.branch_id || getResolvedBranchId();
    const draftCart = Array.isArray(draft?.cart) ? draft.cart : [];
    if (!resolvedBranchId || draftCart.length === 0) {
      throw new Error("Offline sale is missing branch or item details.");
    }

    const { data: receiptData, error: receiptErr } = await supabase.rpc("generate_receipt_number", {
      p_store_id: resolvedBranchId,
    });
    if (receiptErr) throw receiptErr;
    const receiptRow = Array.isArray(receiptData) ? receiptData[0] : receiptData;
    const generatedReceiptNumber = receiptRow?.receipt_number;
    if (!generatedReceiptNumber) throw new Error("No receipt number was returned by the database.");

    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .insert([{
        order_number: generatedReceiptNumber,
        receipt_number: generatedReceiptNumber,
        receipt_sequence: receiptRow.receipt_sequence || null,
        receipt_date: receiptRow.receipt_date || null,
        store_id: resolvedBranchId,
        branch_id: resolvedBranchId,
        customer_id: draft.customer?.id || null,
        loyalty_member_id: draft.customer?.id || null,
        customer_name: draft.customer?.name || null,
        items: enrichOrderItemsForKds(draftCart),
        subtotal: Number(draft.grossTotal || 0),
        total: Number(draft.total || 0),
        discount: Number(draft.discount || 0),
        gross_amount: Number(draft.grossTotal || 0),
        discount_amount: Number(draft.discount || 0),
        net_amount: Number(draft.total || 0),
        order_type: draft.diningOption || "POS ORDER",
        cashier_id: draft.cashier_id || currentUserId || null,
        paid_at: draft.created_at || new Date().toISOString(),
        status: "paid",
        payment_method: draft.payment || "Offline Sync",
        dining_option: draft.diningOption || "POS ORDER",
      }])
      .select("*")
      .single();
    if (orderErr) throw orderErr;

    const itemRows = draftCart.map((line) => ({
      order_id: orderRow.id,
      menu_item_id: line.id,
      name: line.name,
      category_name: line.category || line.categoryName || null,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: lineNetAmount(line),
      gross_amount: lineGrossAmount(line),
      discount_amount: lineDiscountAmount(line),
      net_amount: lineNetAmount(line),
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
    if (itemsErr) throw itemsErr;

    try {
      await deductInventoryForOrder(supabase, orderRow.id, draftCart, draft.cashier_id || currentUserId);
    } catch (inventoryError) {
      console.warn("Offline synced sale inventory deduction skipped:", inventoryError);
    }

    if (draft.customer?.id) {
      try {
        const draftLoyaltyEligibleTotal = cartLoyaltyEligibleTotal(draftCart);
        await awardMemberLoyaltyPoints(draft.customer.id, calcLoyaltyPoints(draftLoyaltyEligibleTotal), draft.total, orderRow.id);
      } catch (loyaltyError) {
        console.warn("Offline synced sale loyalty update skipped:", loyaltyError);
      }
    }

    if (draft.sendToKds !== false) {
      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "pos",
        order: { ...orderRow, items: enrichOrderItemsForKds(draftCart) },
        status: "preparing",
      });
      if (kdsErr) console.warn("Offline synced sale KDS update skipped:", kdsErr);
    }

    return { orderRow, generatedReceiptNumber };
  }

  async function syncOfflineCharges({ silent = false } = {}) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = readOfflineChargeQueue();
    if (queue.length === 0) {
      setOfflineQueueCount(0);
      return;
    }

    const remaining = [];
    let synced = 0;
    for (const draft of queue) {
      try {
        await replayOfflineCharge(draft);
        synced += 1;
      } catch (error) {
        remaining.push(draft);
        console.warn("Offline sale sync failed:", error);
        if (isProbablyOfflineError(error)) break;
      }
    }

    writeOfflineChargeQueue(remaining);
    if (synced > 0) {
      fetchReceiptLogs().catch((error) => console.warn("Receipt refresh after offline sync failed:", error));
      if (!silent) showToast("success", "Offline Sales Synced", `${synced} queued sale${synced === 1 ? "" : "s"} uploaded.`);
    }
  }

  const calcTotal = (lines) =>
    (lines || []).reduce((sum, i) => {
      if (isVoidedLine(i)) return sum;
      return sum + lineNetAmount(i);
    }, 0);

  const subtotal = useMemo(() => calcTotal(cart), [cart]);
  const activeDiscountRules = useMemo(
    () => (discountRules || []).filter((rule) => rule.is_active !== false),
    [discountRules]
  );
  const itemDiscountRules = useMemo(
    () => activeDiscountRules.filter((rule) => String(rule.scope || "").toLowerCase() === "item"),
    [activeDiscountRules]
  );
  const orderDiscountRules = useMemo(
    () => activeDiscountRules.filter((rule) => {
      const scope = String(rule.scope || "receipt").toLowerCase();
      return scope === "receipt" || scope === "order";
    }),
    [activeDiscountRules]
  );

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
  const ticketTitle = activeWebOrderId ? `Web Order: #${activeWebOrderId.slice(0,8).toUpperCase()}` : (ticketDiningLabel || "Select Dining Option");
  const ticketSubtitle = attachedCustomer?.name ? `Loyalty Member: ${attachedCustomer.name}` : "Walk-in Customer";
  const activeShiftRecord = useMemo(() => {
    if (shiftStatus !== "open") return null;
    const latest = getLatestShiftRecord(shiftRecords, storeId, currentUserId);
    return getShiftRecordMode(latest).includes("open") ? latest : null;
  }, [shiftRecords, storeId, currentUserId, shiftStatus]);
  const activeShiftStartMs = useMemo(() => {
    const stamp = activeShiftRecord?.created_at;
    if (!stamp) return null;
    const parsed = coerceReceiptTimestamp(stamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }, [activeShiftRecord]);
  const selectedReceipt = useMemo(
    () => receiptRows.find((row) => row.receipt_number === selectedReceiptNumber) || receiptRows[0] || null,
    [receiptRows, selectedReceiptNumber]
  );
  const selectedReceiptItems = useMemo(
    () => receiptItemRows.filter((row) => row.receipt_number === selectedReceipt?.receipt_number),
    [receiptItemRows, selectedReceipt]
  );
  const shiftSummary = useMemo(() => {
    const todayKey = formatDate(new Date());
    const rows = (receiptRows || []).filter((row) => {
      const stamp = receiptDisplayTimestamp(row);
      if (!stamp) return true;
      if (activeShiftStartMs) {
        const parsed = coerceReceiptTimestamp(stamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.getTime() >= activeShiftStartMs;
      }
      return formatDate(stamp) === todayKey;
    });
    const isRefunded = (r) => String(r.status || "").toLowerCase().includes("refund");
    const saleRows = rows.filter((r) => !isRefunded(r));
    const refundRows = rows.filter(isRefunded);
    const normalizePaymentKey = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    const paymentMatches = (value, keys) => keys.map(normalizePaymentKey).includes(normalizePaymentKey(value));
    const paymentTotal = (...keys) =>
      rows
        .filter((r) => paymentMatches(r.payment_type, keys))
        .filter((r) => !isRefunded(r))
        .reduce((sum, r) => sum + Number(r.total_collected || 0), 0);
    const cashPayments = paymentTotal("cash");
    const cashRefunds = rows
      .filter((r) => paymentMatches(r.payment_type, ["cash"]))
      .filter(isRefunded)
      .reduce((sum, r) => sum + Number(r.total_collected || 0), 0);
    const grossSales = saleRows.reduce((sum, r) => sum + Number(r.gross_sales || r.total_collected || r.net_sales || 0), 0);
    const discounts = saleRows.reduce((sum, r) => sum + Number(r.discounts || r.discount || 0), 0);
    const refunds = refundRows.reduce((sum, r) => sum + Math.abs(Number(r.refund_amount || r.net_sales || r.total_collected || 0)), 0);
    const netSales = saleRows.reduce((sum, r) => sum + Number(r.net_sales || r.total_collected || 0), 0) - refunds;
    return {
      grossSales,
      refunds,
      discounts,
      netSales,
      cashPayments,
      cashRefunds,
      expectedCash: Number(startingCash || 0) + cashPayments - cashRefunds,
      payments: {
        Gcash: paymentTotal("gcash"),
        QRPH: paymentTotal("qrph"),
        GrabFood: paymentTotal("grabfood"),
        "Grab Dine Out": paymentTotal("grab dine out", "grabdineout"),
        Card: paymentTotal("card"),
        Panda: paymentTotal("panda", "foodpanda"),
      },
    };
  }, [receiptRows, startingCash, activeShiftStartMs]);
  const shiftSalesRows = useMemo(() => {
    const todayKey = formatDate(new Date());
    const todaysRows = (receiptRows || []).filter((row) => {
      const stamp = receiptDisplayTimestamp(row);
      if (!stamp) return true;
      if (activeShiftStartMs) {
        const parsed = coerceReceiptTimestamp(stamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.getTime() >= activeShiftStartMs;
      }
      return formatDate(stamp) === todayKey;
    });
    return todaysRows.map((row) => ({
      receipt: row.receipt_number,
      time: receiptDisplayTimestamp(row) ? formatReceiptTime(receiptDisplayTimestamp(row)) : row.date,
      payment: row.payment_type || "Other",
      dining: row.description || row.dining_option || "POS Order",
      status: row.status || "Closed",
      total: Number(row.total_collected || row.net_sales || 0),
    }));
  }, [receiptRows, activeShiftStartMs]);
  const closedShiftReportRecords = useMemo(() => {
    return (shiftRecords || [])
      .filter((record) => {
        const mode = getShiftRecordMode(record);
        if (!(mode.includes("close") || mode.includes("end_day"))) return false;
        if (storeId && String(record.store_id || "") !== String(storeId)) return false;
        if (mode.includes("end_day")) return true;
        if (!record.cashier_id || !currentUserId) return true;
        return String(record.cashier_id) === String(currentUserId);
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [shiftRecords, storeId, currentUserId]);
  const selectedShiftReportRecord = useMemo(() => {
    return closedShiftReportRecords.find((record) => String(record.id) === String(selectedShiftReportId)) || closedShiftReportRecords[0] || null;
  }, [closedShiftReportRecords, selectedShiftReportId]);
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
      .filter((item) => {
        if (search) return true;
        return activeCategory ? item.category === activeCategory : item.is_featured === true;
      })
      .filter((item) => !search || `${item.name || ""} ${item.category || ""}`.toLowerCase().includes(search))
      .map((item) => itemForActiveChannel(item));
  }, [items, activeCategory, menuSearch, activeMenuChannel]);

  const recipeCategoryOptions = useMemo(() => {
    return Array.from(new Set((items || []).map((item) => item.category || "Uncategorized")))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [items]);

  const recipesByMenuItem = useMemo(() => {
    const map = new Map();
    (recipeRows || []).forEach((row) => {
      const key = String(row.menu_item_id || "");
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [recipeRows]);

  const recipeMenuItemsByCategory = useMemo(() => {
    const search = recipeMenuSearch.trim().toLowerCase();
    const grouped = new Map();
    (items || [])
      .filter((item) => {
        const category = item.category || "Uncategorized";
        if (recipeCategoryFilter !== "all" && category !== recipeCategoryFilter) return false;
        if (!search) return true;
        return `${item.name || ""} ${category}`.toLowerCase().includes(search);
      })
      .sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.name || "").localeCompare(String(b.name || "")))
      .forEach((item) => {
        const category = item.category || "Uncategorized";
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push(item);
      });
    return Array.from(grouped.entries()).map(([name, rows]) => ({ name, rows }));
  }, [items, recipeCategoryFilter, recipeMenuSearch]);

  const getRecipeIngredientName = (row) =>
    row?.common_inventory_names?.common_name ||
    row?.inventory_items?.common_inventory_names?.common_name ||
    row?.inventory_items?.common_name ||
    row?.common_name ||
    row?.ingredient_name ||
    "Ingredient";

  const getRecipeIngredientStock = (row) => {
    const commonId = row?.common_name_id || row?.inventory_items?.common_name_id || null;
    const commonName = getRecipeIngredientName(row);
    const normalizedName = String(commonName || "").trim().toLowerCase().replace(/\s+/g, " ");
    const matches = (recipeInventoryItems || []).filter((item) => {
      if (commonId && String(item.common_name_id || "") === String(commonId)) return true;
      const itemCommonName = item?.common_inventory_names?.common_name || item?.common_name || item?.item_name || "";
      return String(itemCommonName).trim().toLowerCase().replace(/\s+/g, " ") === normalizedName;
    });
    const unit = normalizeUnit(matches[0]?.unit || row?.unit || row?.inventory_items?.unit || "");
    const total = matches.reduce((sum, item) => sum + Number(item.current_stock || 0), 0);
    return `${total.toLocaleString("en-PH", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
  };

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
      setShiftRecords([]);
      setStartingCash("");
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
    if (typeof document === "undefined") return;
    const previousBodyOverscroll = document.body.style.overscrollBehaviorY;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;

    document.body.style.overscrollBehaviorY = "none";
    document.documentElement.style.overscrollBehaviorY = "none";

    return () => {
      document.body.style.overscrollBehaviorY = previousBodyOverscroll;
      document.documentElement.style.overscrollBehaviorY = previousHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setOfflineQueueCount(readOfflineChargeQueue().length);
    setIsOfflineMode(navigator.onLine === false);

    const handleOnline = () => {
      setIsOfflineMode(false);
      syncOfflineCharges().catch((error) => console.warn("Offline charge sync failed:", error));
    };
    const handleOffline = () => setIsOfflineMode(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine !== false) {
      syncOfflineCharges({ silent: true }).catch((error) => console.warn("Offline charge sync failed:", error));
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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

  function applyShiftState(records, sid, cashierId) {
    const rows = Array.isArray(records) ? records : [];
    const nextStatus = getShiftStatusFromRecords(rows, sid, cashierId);
    const latest = getLatestShiftRecord(rows, sid, cashierId);
    const latestStartingCash = latest?.cash_total ?? latest?.starting_cash ?? 0;

    setShiftRecords(rows);
    setShiftStatus(nextStatus);

    if (typeof window !== "undefined") {
      localStorage.setItem(shiftStorageKey(sid, cashierId, "records"), JSON.stringify(rows.slice(0, 20)));
      if (nextStatus === "open") {
        localStorage.setItem(shiftStorageKey(sid, cashierId, "starting_cash"), String(latestStartingCash || 0));
      } else {
        localStorage.removeItem(shiftStorageKey(sid, cashierId, "starting_cash"));
      }
    }

    setStartingCash(nextStatus === "open" ? String(latestStartingCash || 0) : "");
  }

  async function loadShiftState(sid, cashierId = currentUserId) {
    if (!sid || !cashierId) {
      setShiftStatus("closed");
      return;
    }

    let localRows = [];
    if (typeof window !== "undefined") {
      try {
        const parsed = JSON.parse(localStorage.getItem(shiftStorageKey(sid, cashierId, "records")) || "[]");
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
      .limit(50);

    if (error) {
      applyShiftState(localRows, sid, cashierId);
      return;
    }

    applyShiftState(data || [], sid, cashierId);
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
      await autoPrintOrderSlip({
        orderId: incomingOrder.id,
        slipCart: incomingOrder.items || [],
        slipDining: webDiningOptionLabel(incomingOrder.fulfillment_type || incomingOrder.dining_option),
        slipCustomer: incomingOrder.customer_name || "Web Customer",
        slipTotal: Number(incomingOrder.total || incomingOrder.subtotal || 0),
        printedAt: acceptedAt,
        onlineBarOnly: true,
      });
      await autoPrintBarCupLabels({
        orderId: incomingOrder.id,
        labelCart: incomingOrder.items || [],
        labelDining: webDiningOptionLabel(incomingOrder.fulfillment_type || incomingOrder.dining_option),
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
    setActiveWebOrderFulfillmentType(incomingOrder.fulfillment_type || incomingOrder.dining_option || "");

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
      await loadShiftState(activeStoreId, session.user.id);
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
    await warmBluetoothPrinterDeviceCache(map).catch((err) => console.warn("Bluetooth remembered-device cache skipped", err));
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
      setOrderSlipPrinterGroups([]);
      return;
    }

    const activeSlipGroups = (groups || [])
      .filter((group) => group.is_active !== false)
      .filter((group) => ["kitchen", "bar"].includes(String(group.name || "").trim().toLowerCase()));

    if (activeSlipGroups.length === 0) {
      setBarPrinterCategoryIds([]);
      setBarPrinterCategoryNames([]);
      setOrderSlipPrinterGroups([]);
      return;
    }

    const { data: mapping, error: mappingError } = await supabase
      .from("pos_printer_group_categories")
      .select("printer_group_id, menu_category_id")
      .eq("store_id", sid)
      .in("printer_group_id", activeSlipGroups.map((group) => group.id));

    if (mappingError) {
      console.warn("Unable to load printer group categories", mappingError);
      setBarPrinterCategoryIds([]);
      setBarPrinterCategoryNames([]);
      setOrderSlipPrinterGroups([]);
      return;
    }

    const categoryNameById = new Map((categoryRows || []).map((category) => [String(category.id), category.name]).filter(([id]) => Boolean(id)));
    const printerGroups = activeSlipGroups.map((group) => {
      const categoryIds = Array.from(new Set(
        (mapping || [])
          .filter((row) => String(row.printer_group_id) === String(group.id))
          .map((row) => row.menu_category_id)
          .filter(Boolean)
      ));
      const categoryNames = Array.from(new Set(categoryIds.map((id) => categoryNameById.get(String(id))).filter(Boolean)));
      return {
        id: group.id,
        name: group.name,
        key: String(group.name || "").trim().toLowerCase(),
        categoryIds,
        categoryNames,
      };
    });

    const barGroup = printerGroups.find((group) => group.key === "bar");

    setBarPrinterCategoryIds(barGroup?.categoryIds || []);
    setBarPrinterCategoryNames(barGroup?.categoryNames || []);
    setOrderSlipPrinterGroups(printerGroups);
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
      .filter((x) => ACTIVE_VOUCHER_STATUSES.includes(String(x.status || "active").toLowerCase()))
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
      supabase
        .from("pos_discounts")
        .select("*")
        .or(`store_id.eq.${sid},store_id.is.null`)
        .order("sort_order", { ascending: true }),
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
      const [iRes, catRes, cRes, itemStoreAvailabilityRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("name"),
        supabase.from("menu_categories").select("*").order("name", { ascending: true }),
        supabase.from("loyalty_members").select("*"),
        supabase.from("menu_item_store_availability").select("item_id, store_id, is_available").eq("store_id", sid),
      ]);
      const [recipeRes, recipeInventoryRes] = await Promise.all([
        supabase
          .from("menu_item_ingredients")
          .select("*, inventory_items(item_name, common_name, common_name_id, current_stock, unit), common_inventory_names(common_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("inventory_items")
          .select("id, item_name, common_name, common_name_id, current_stock, unit, common_inventory_names(common_name)")
          .order("item_name", { ascending: true }),
      ]);

      const cats = catRes.data || [];
      if (itemStoreAvailabilityRes.error) throw itemStoreAvailabilityRes.error;
      if (recipeRes.error) {
        console.warn("POS recipes unavailable:", recipeRes.error.message);
        setRecipeRows([]);
      } else {
        setRecipeRows(recipeRes.data || []);
      }
      if (recipeInventoryRes.error) {
        console.warn("POS recipe inventory unavailable:", recipeInventoryRes.error.message);
        setRecipeInventoryItems([]);
      } else {
        setRecipeInventoryItems(recipeInventoryRes.data || []);
      }
      const storeAvailabilityByItem = new Map(
        (itemStoreAvailabilityRes.data || []).map((row) => [String(row.item_id), row.is_available !== false])
      );
      const itemRows = (iRes.data || []).map((item) => {
        const hasStoreOverride = storeAvailabilityByItem.has(String(item.id));
        const storeAvailable = hasStoreOverride ? storeAvailabilityByItem.get(String(item.id)) : item.is_available !== false;
        return {
          ...item,
          global_is_available: item.is_available !== false,
          is_available: storeAvailable,
          store_is_available: storeAvailable,
        };
      });
      setItems(itemRows);
      setCategories(cats);
      const loyaltyRows = await Promise.all((cRes.data || []).map(async (row) => {
        try {
          const result = await resetMemberPointsIfExpired(supabase, row);
          return result.member || row;
        } catch (err) {
          console.warn("Annual loyalty point reset skipped:", err);
          return applyAnnualPointResetToMember(row);
        }
      }));
      const customerRows = loyaltyRows.map((row) => ({
        ...row,
        name: row.customer_name || row.name || row.full_name || "",
        code: row.customer_code || row.code || "",
        availablePoints: row["Available points"] ?? row.available_points ?? 0,
        pointsBalance: row["Points balance"] ?? row.points_balance ?? 0,
      }));
      setCustomers(customerRows);
      writeJsonStorage(POS_OFFLINE_CACHE_KEY, {
        cached_at: new Date().toISOString(),
        items: itemRows,
        categories: cats,
        customers: customerRows,
        recipeRows: recipeRes.error ? [] : recipeRes.data || [],
        recipeInventoryItems: recipeInventoryRes.error ? [] : recipeInventoryRes.data || [],
      });
      setIsOfflineMode(false);

      await loadPosSettings(sid);
      await loadPrinters(sid);
      await loadBarPrinterCategories(sid, cats);
    } catch (e) {
      const cached = readJsonStorage(POS_OFFLINE_CACHE_KEY, null);
      if (cached?.items?.length) {
        setItems(cached.items || []);
        setCategories(cached.categories || []);
        setCustomers(cached.customers || []);
        setRecipeRows(cached.recipeRows || []);
        setRecipeInventoryItems(cached.recipeInventoryItems || []);
        setIsOfflineMode(true);
        showToast("warn", "Offline Cache Loaded", `Using saved POS data from ${formatReceiptDateTime(cached.cached_at)}.`);
      } else {
        showToast("error", "Loading Error", e.message);
      }
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

  async function autoPrintOrderSlip({
    orderId,
    slipCart = cart,
    slipDining = diningOptionName || "POS ORDER",
    slipCustomer = attachedCustomer?.name || "",
    slipTotal = totalDue,
    printedAt = new Date(),
  } = {}) {
    const cartRows = slipCart || [];
    if (cartRows.length === 0) return;

    const configuredJobs = (orderSlipPrinterGroups || [])
      .map((group) => ({
        groupName: normalizeLabelLine(group.name || "Order Slip"),
        items: filterItemsByPrinterGroup(cartRows, group.categoryIds, group.categoryNames),
      }))
      .filter((job) => job.items.length > 0);

    const printJobs = configuredJobs.length > 0
      ? configuredJobs
      : [{ groupName: "Order Slip", items: cartRows, useFullTotal: true }];

    try {
      for (const job of printJobs) {
        const slipText = buildOrderSlipText({
          orderId,
          cart: job.items,
          diningOptionName: slipDining,
          customerName: slipCustomer,
          total: job.useFullTotal ? slipTotal : calcTotal(job.items),
          printedAt,
          slipTitle: `${job.groupName.toUpperCase()} ORDER SLIP`,
        });
        await printByRole("receipt", slipText, printerConfig, { fallbackToBrowser: false });
      }
    } catch (printError) {
      showToast("warn", "Order Slip Not Printed", printError?.message || "Select and save the receipt printer in POS Settings.");
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
        clearActiveWebOrderContext();
        showToast("info", "Dining Option Changed", `${optionName} has a saved ticket. Your current cart was kept.`);
        return;
      }

      const lineItemsByTicket = await fetchOpenTicketLineItems([data.id]);
      const ticketItems = lineItemsByTicket.get(String(data.id)) || data.items || [];
      setOriginalTicketId(data.id);
      setCart(ticketItems);
      clearActiveWebOrderContext(); // Clear web tracking context when switching to a physical table
      const linkedCustomer = customers.find((c) => c.id === data.customer_id);
      setAttachedCustomer(linkedCustomer || null);
      showToast("info", "Table Loaded", optionName);
    } else {
      setOriginalTicketId(null);
      clearActiveWebOrderContext();
      showToast("info", "Dining Option Changed", optionName);
    }
  }

  async function handleDiningChange(optionId) {
    setDiningOption(optionId);
    const opt = (diningOptions || []).find((d) => String(d.id) === String(optionId));
    const name = opt?.name || "";
    if (!/grab/i.test(name)) setGrabOrderNumber("");

    if (!name) {
      setOriginalTicketId(null);
      clearActiveWebOrderContext();
      return;
    }

    await loadDiningOptionOrder(name);
  }

  async function saveTableOrder() {
    const savedItems = jsonSafeValue(enrichOrderItemsForKds(cart));

    if (activeWebOrderId) {
      // Direct rewrite update to keep the active web order synchronized 
      const { error } = await supabase
        .from("web_orders")
        .update({
          items: savedItems,
          subtotal: Number(subtotal),
          total: Number(subtotal),
          dining_option: webDiningOptionLabel(activeWebOrderFulfillmentType || diningOptionName),
          fulfillment_type: activeWebOrderFulfillmentType || diningOptionName || null,
        })
        .eq("id", activeWebOrderId);
      if (error) throw error;
      await autoPrintOrderSlip({
        orderId: activeWebOrderId,
        slipCart: savedItems,
        slipDining: webDiningOptionLabel(activeWebOrderFulfillmentType || diningOptionName),
        slipCustomer: attachedCustomer?.name || "Web Customer",
        slipTotal: Number(subtotal || 0),
        printedAt: new Date(),
        onlineBarOnly: true,
      });
      await autoPrintBarCupLabels({
        orderId: activeWebOrderId,
        labelCart: savedItems,
        labelDining: webDiningOptionLabel(activeWebOrderFulfillmentType || diningOptionName),
        printedAt: new Date(),
        askBeforePrint: true,
        promptContext: "this saved web order",
      });
      return;
    }

    if (!diningOption) return;
    const name = ticketDiningLabel;
    if (!name) return;

    const payload = {
      ticket_name: name,
      order_type: name,
      customer_id: attachedCustomer?.id || null,
      items: savedItems,
      total_amount: Number(subtotal || 0),
    };

    if (originalTicketId) {
      let { data: existingTicket, error: existingTicketError } = await supabase
        .from("open_tickets")
        .select("id, items, created_at")
        .eq("id", originalTicketId)
        .maybeSingle();

      if (existingTicketError) throw existingTicketError;

      if (!existingTicket) {
        const { data: fallbackTicket, error: fallbackTicketError } = await supabase
          .from("open_tickets")
          .select("id, items, created_at")
          .eq("order_type", name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackTicketError) throw fallbackTicketError;
        existingTicket = fallbackTicket;
      }

      if (!existingTicket?.id) {
        throw new Error("Saved ticket was not updated. Please reopen the saved ticket and try again.");
      }

      const savedTicketId = existingTicket.id;
      const previousLineItemsByTicket = await fetchOpenTicketLineItems([savedTicketId]);
      const previousSavedItems = previousLineItemsByTicket.get(String(savedTicketId)) || existingTicket.items || [];
      const addedItems = getAddedTicketLines(previousSavedItems, savedItems);

      const { data: ticketRow, error } = await supabase
        .from("open_tickets")
        .update(payload)
        .eq("id", savedTicketId)
        .select("id, created_at")
        .maybeSingle();

      if (error) throw error;
      if (!ticketRow?.id) {
        throw new Error("Saved ticket was not updated. Please reopen the saved ticket and try again.");
      }

      await syncOpenTicketLineItems(savedTicketId, savedItems);
      const ticketPrintedAt = ticketRow.created_at || new Date();
      if (addedItems.length > 0) {
        const kitchenAddedItems = getKitchenPrinterGroupItems(addedItems);
        if (kitchenAddedItems.length > 0) {
          const { error: kdsErr } = await appendKdsTicketItems(supabase, {
            sourceType: "pos",
            order: {
              id: savedTicketId,
              store_id: storeId,
              branch_id: storeId,
              customer_name: attachedCustomer?.name || "Walk-in",
              order_type: name,
              dining_option: name,
              items: kitchenAddedItems,
              total_amount: Number(subtotal || 0),
              created_at: ticketRow.created_at || existingTicket.created_at,
            },
            items: kitchenAddedItems,
            status: "preparing",
          });
          if (kdsErr) throw kdsErr;
        }
        await autoPrintOrderSlip({
          orderId: savedTicketId,
          slipCart: addedItems,
          slipDining: name,
          slipCustomer: attachedCustomer?.name || "Walk-in",
          slipTotal: calcTotal(addedItems),
          printedAt: ticketPrintedAt,
        });
        await autoPrintBarCupLabels({
          orderId: savedTicketId,
          labelCart: addedItems,
          labelDining: name,
          printedAt: ticketPrintedAt,
          askBeforePrint: true,
          promptContext: "the newly added saved-ticket items",
        });
      }
    } else {
      const { data: ticketRow, error } = await supabase.from("open_tickets").insert([payload]).select("*").single();
      if (error) throw error;
      setOriginalTicketId(ticketRow.id);
      await syncOpenTicketLineItems(ticketRow.id, savedItems);
      const { error: kdsErr } = await upsertKdsTicket(supabase, {
        sourceType: "pos",
        order: {
          id: ticketRow.id,
          store_id: storeId,
          branch_id: storeId,
          customer_name: attachedCustomer?.name || "Walk-in",
          order_type: name,
          dining_option: name,
          items: savedItems,
          total_amount: Number(subtotal || 0),
          created_at: ticketRow.created_at,
        },
        status: "preparing",
      });
      if (kdsErr) throw kdsErr;
      await autoPrintOrderSlip({
        orderId: ticketRow.id,
        slipCart: savedItems,
        slipDining: name,
        slipCustomer: attachedCustomer?.name || "Walk-in",
        slipTotal: Number(subtotal || 0),
        printedAt: ticketRow.created_at || new Date(),
      });
      await autoPrintBarCupLabels({
        orderId: ticketRow.id,
        labelCart: savedItems,
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

    const lineItemsByTicket = await fetchOpenTicketLineItems((res.data || []).map((t) => t.id));
    const enriched = (res.data || []).map((t) => {
      const c = customers.find((x) => x.id === t.customer_id);
      return {
        ...t,
        items: lineItemsByTicket.get(String(t.id)) || t.items || [],
        _customerName: c?.name || "Walk-in",
      };
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

  async function refreshPosNow() {
    if (!storeId || manualRefreshing) return;

    setManualRefreshing(true);
    try {
      await Promise.all([
        fetchPendingCount(storeId),
        currentUserId ? loadShiftState(storeId, currentUserId) : Promise.resolve(),
        fetchData(storeId, { showLoading: false }),
        fetchSavedTickets(),
        fetchAcceptedWebOrders(),
        managementOpen ? fetchReceiptLogs() : Promise.resolve(),
      ]);
      showToast("success", "POS Refreshed", "Latest menu, tickets, web orders, and receipts loaded.");
    } catch (err) {
      showToast("error", "Refresh Failed", err?.message || "Unable to refresh POS.");
    } finally {
      setManualRefreshing(false);
    }
  }

  useEffect(() => {
    if (!storeId || !currentUserId || shiftStatus === "loading") return;

    let cancelled = false;
    const refreshPos = async () => {
      if (autoRefreshInFlightRef.current || cancelled) return;
      autoRefreshInFlightRef.current = true;

      try {
        await Promise.all([
          fetchPendingCount(storeId),
          loadShiftState(storeId, currentUserId),
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
  }, [storeId, shiftStatus, managementOpen, currentUserId]);

  async function openAcceptedWebOrders() {
    await fetchAcceptedWebOrders();
    setWebOrdersOpen(true);
  }

  function editAcceptedWebOrder(order) {
    setCart(enrichOrderItemsForKds(order.items || []));
    setOriginalTicketId(null);
    setActiveWebOrderId(order.id); // Secure tracking context parameter link
    setActiveWebOrderBranchId(getWebOrderStoreId(order) || storeId || null);
    setActiveWebOrderFulfillmentType(order.fulfillment_type || order.dining_option || "");

    const optionName = order.fulfillment_type || order.dining_option || "";
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

  async function createPointRewardVouchers(memberId, availablePoints) {
    if (!memberId) return null;

    const { error: rpcError } = await supabase.rpc("ensure_vouchers_for_member", { p_member_id: memberId });
    if (!rpcError) {
      const { data: refreshedMember } = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("id", memberId)
        .maybeSingle();
      return refreshedMember || null;
    }

    const { data: member } = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (!member?.id) return member || null;

    const voucherCount = Math.floor(Number(availablePoints || member["Available points"] || 0) / 100);
    if (voucherCount <= 0) return member;

    const now = Date.now();
    const voucherSuffix = () => {
      if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
      }
      return `${Date.now().toString(36)}${Math.floor(Math.random() * 1000000).toString(36)}`.slice(-8).toUpperCase();
    };
    const rows = Array.from({ length: voucherCount }, (_, idx) => {
      const voucherNumber = idx + 1;
      return {
        member_id: memberId,
        code: `PTS100-${voucherNumber}-${voucherSuffix()}`,
        reward_text: "FREE 16oz Drink or Waffle (100 Points Reward)",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 90 * 86400000).toISOString(),
        status: "active",
        reward_type: "points",
        points_consumed: 100,
        points_consumed_at: new Date(now).toISOString(),
      };
    });

    const { error: insertError } = await supabase.from("vouchers").insert(rows);
    if (insertError) return member;

    const nextAvailable = Math.max(0, Number((Number(availablePoints || member["Available points"] || 0) - rows.length * 100).toFixed(2)));
    const { data: updatedMember } = await supabase
      .from("loyalty_members")
      .update({ "Available points": nextAvailable })
      .eq("id", memberId)
      .select("*")
      .maybeSingle();
    return updatedMember || member;
  }

  async function awardMemberLoyaltyPoints(memberOrId, pointsEarned, saleTotal = 0, orderId = null) {
    const memberId = typeof memberOrId === "string" ? memberOrId : memberOrId?.id;
    if (!memberId || !pointsEarned) return null;

    const { data: member, error: findErr } = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();

    if (findErr || !member) {
      throw new Error(findErr?.message || "Linked loyalty member was not found.");
    }

    const resetResult = await resetMemberPointsIfExpired(supabase, member);
    const activeMember = resetResult.member || member;
    const currentBalance = Number(activeMember["Points balance"] || 0);
    const currentAvailable = Number(activeMember["Available points"] || 0);
    const currentVisits = Number(activeMember["Total visits"] || 0);
    const currentSpent = Number(activeMember["Total spent"] || 0);
    const nextBalance = Number((currentBalance + pointsEarned).toFixed(2));
    const nextAvailable = Number((currentAvailable + pointsEarned).toFixed(2));
    const nextSpent = Number((currentSpent + Number(saleTotal || 0)).toFixed(2));
    const visitStamp = new Date().toISOString();

    const { data: updatedMember, error: updateErr } = await supabase
      .from("loyalty_members")
      .update({
        "Points balance": nextBalance,
        "Available points": nextAvailable,
        "Total visits": currentVisits + 1,
        "Total spent": nextSpent,
        "First visit": activeMember["First visit"] || visitStamp,
        "Last visit": visitStamp,
      })
      .eq("id", activeMember.id)
      .select("*")
      .maybeSingle();

    if (updateErr) throw updateErr;
    if (!updatedMember?.id) throw new Error("Loyalty member was not updated. Please reselect the customer and try again.");

    const voucherMember = await createPointRewardVouchers(activeMember.id, nextAvailable);
    const finalMember = voucherMember || updatedMember;

    const normalizedMember = {
      ...finalMember,
      name: finalMember.customer_name || finalMember.name || "",
      code: finalMember.customer_code || finalMember.code || "",
      availablePoints: finalMember["Available points"] ?? 0,
      pointsBalance: finalMember["Points balance"] ?? 0,
    };

    setCustomers((prev) => prev.map((row) => (row.id === activeMember.id ? { ...row, ...normalizedMember } : row)));
    setAttachedCustomer((prev) => (prev?.id === activeMember.id ? { ...prev, ...normalizedMember } : prev));

    if (orderId) {
      await supabase
        .from("orders")
        .update({
          loyalty_points_awarded: Number(pointsEarned.toFixed(2)),
          loyalty_points_awarded_at: visitStamp,
          customer_id: activeMember.id,
          loyalty_member_id: activeMember.id,
          customer_name: finalMember.customer_name || finalMember.name || null,
        })
        .eq("id", orderId);
    }

    return normalizedMember;
  }

  async function awardWebOrderLoyaltyPoints(order, pointsEarned, fallbackMemberId = null) {
    if (!pointsEarned) return;

    try {
      const directMemberId = fallbackMemberId || order?.loyalty_member_id || order?.customer_id || null;
      if (directMemberId) {
        await awardMemberLoyaltyPoints(directMemberId, pointsEarned, order?.total || order?.subtotal || 0, order?.pos_order_id || order?.order_id || null);
        return;
      }

      if (!order?.user_id) return;
      const { data: member, error: findErr } = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("user_id", order.user_id)
        .maybeSingle();

      if (findErr || !member) return;
      await awardMemberLoyaltyPoints(member.id, pointsEarned, order?.total || order?.subtotal || 0, order?.pos_order_id || order?.order_id || null);
    } catch (err) {
      console.warn("Loyalty point update skipped:", err);
    }
  }

  async function fetchReceiptLogs() {
    const receiptCutoff = new Date();
    receiptCutoff.setDate(receiptCutoff.getDate() - POS_RECEIPT_HISTORY_DAYS);
    const receiptCutoffIso = receiptCutoff.toISOString();
    const resolveOrderCustomer = (order) => {
      const linked = customers.find((customer) =>
        String(customer.id) === String(order?.customer_id || "") ||
        String(customer.id) === String(order?.loyalty_member_id || "")
      );
      const name = customerDisplayName(linked) || order?.customer_name || "";
      const code = customerDisplayCode(linked) || order?.customer_code || "";
      return name || code ? { ...(linked || {}), name, customer_name: name, code, customer_code: code } : null;
    };

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
    const posRows = (receiptRes.data || []).map((order) => {
      const customer = resolveOrderCustomer(order);
      const displayTimestamp = receiptDisplayTimestamp(order);
      return {
        ...order,
        receipt_number: order.receipt_number || order.order_number || String(order.id),
        order_id: order.id,
        date: displayTimestamp ? formatReceiptDateTime(displayTimestamp) : "",
        gross_sales: Number(order.total || 0) + Number(order.discount || 0),
        discounts: Number(order.discount || 0),
        net_sales: Number(order.total || 0),
        total_collected: Number(order.total || 0),
        payment_type: order.payment_method || "Other",
        description: order.dining_option || "POS Order",
        status: refunds[order.receipt_number || order.order_number || String(order.id)]?.receipt || "Closed",
        customer,
        customer_name: customerDisplayName(customer),
        customer_code: customerDisplayCode(customer),
      };
    });
    const chargedWebOrderIds = new Set(
      (receiptRes.data || [])
        .map((order) => order.source_web_order_id)
        .filter(Boolean)
        .map((id) => String(id))
    );
    const webRows = (webReceiptRes.data || [])
      .filter((order) => !chargedWebOrderIds.has(String(order.id)))
      .map((order) => {
        const displayTimestamp = receiptDisplayTimestamp(order);
        return {
          ...order,
          id: `WEB-${order.id}`,
          receipt_number: order.receipt_number || `WEB-${String(order.id).slice(0, 8).toUpperCase()}`,
          date: displayTimestamp ? formatReceiptDateTime(displayTimestamp) : "",
          gross_sales: Number(order.total || order.subtotal || 0),
          discounts: 0,
          net_sales: Number(order.total || order.subtotal || 0),
          total_collected: Number(order.total || order.subtotal || 0),
          payment_type: order.payment_method || "Web Order",
          description: `${order.dining_option || "Web Order"}${order.delivery_address ? ` - ${order.delivery_address}` : ""}`,
          status: refunds[`WEB-${order.id}`]?.receipt || "Closed",
          source: "web_order",
          web_items: order.items || [],
        };
      });
    const rows = [...posRows, ...webRows].sort((a, b) => new Date(receiptDisplayTimestamp(b) || 0) - new Date(receiptDisplayTimestamp(a) || 0));
    setReceiptRows(rows);
    setSelectedReceiptNumber((current) =>
      rows.some((row) => row.receipt_number === current) ? current : rows[0]?.receipt_number || ""
    );

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
          variantDetails: item.variantDetails || item.variant_details || "",
          selectedOptions: item.selectedOptions || item.selected_options || [],
          instructions: item.instructions || item.note || item.specialInstructions || item.special_instructions || "",
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
          variantDetails: item.variantDetails || item.variant_details || "",
          selectedOptions: item.selectedOptions || item.selected_options || item.options || item.modifiers || [],
          selected_options: item.selected_options || item.selectedOptions || item.options || item.modifiers || [],
          instructions: item.instructions || item.note || item.specialInstructions || item.special_instructions || "",
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
          variantDetails: item.variantDetails || item.variant_details || "",
          selectedOptions: item.selectedOptions || item.selected_options || [],
          instructions: item.instructions || item.note || item.specialInstructions || item.special_instructions || "",
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

    const sourceItems = Array.isArray(receipt.items)
      ? receipt.items
      : Array.isArray(receipt.web_items)
        ? receipt.web_items
        : [];
    const findSourceLine = (row, index) => {
      const indexed = sourceItems[index];
      const rowMenuId = row.menu_item_id || row.menuItemId || row.menu_item || null;
      const rowName = normalizeLabelLine(row.item || row.name || "").toLowerCase();

      if (indexed) {
        const indexedMenuId = indexed.menu_item_id || indexed.menuItemId || indexed.id || null;
        const indexedName = normalizeLabelLine(indexed.name || indexed.item || "").toLowerCase();
        if ((rowMenuId && indexedMenuId && String(rowMenuId) === String(indexedMenuId)) || (rowName && indexedName === rowName)) {
          return indexed;
        }
      }

      return sourceItems.find((line) => {
        const lineMenuId = line.menu_item_id || line.menuItemId || line.id || null;
        const lineName = normalizeLabelLine(line.name || line.item || "").toLowerCase();
        return (rowMenuId && lineMenuId && String(rowMenuId) === String(lineMenuId)) || (rowName && lineName === rowName);
      }) || null;
    };

    const cartForReceipt = items.map((row, index) => {
      const sourceLine = findSourceLine(row, index);
      const quantity = Number(row.quantity || 1);
      const lineTotal = Number(row.net_sales ?? row.gross_sales ?? 0);
      return {
        name: row.item || row.name || "Item",
        quantity,
        unitPrice: quantity > 0 ? lineTotal / quantity : lineTotal,
        variantDetails: row.variantDetails || row.variant_details || sourceLine?.variantDetails || sourceLine?.variant_details || "",
        selectedOptions: row.selectedOptions || row.selected_options || sourceLine?.selectedOptions || sourceLine?.selected_options || [],
        instructions: row.instructions || row.note || row.specialInstructions || row.special_instructions || sourceLine?.instructions || sourceLine?.note || sourceLine?.specialInstructions || sourceLine?.special_instructions || "",
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
      printedAt: receiptDisplayTimestamp(receipt) || new Date(),
      copyLabel: "*** REPRINT ***",
      store: currentStore,
      cashierName,
      customer: receipt.customer || (receipt.customer_name ? { name: receipt.customer_name, code: receipt.customer_code } : null),
    });

    setReprintingReceipt(true);
    try {
      setReceiptText(receiptCopy);
      setReceiptOpen(true);
      await printByRole("receipt", receiptCopy, printerConfig, { fallbackToBrowser: false });
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
    const sid = getResolvedBranchId();
    if (!sid) return showToast("error", "Store Required", "POS store is not loaded yet.");
    const nextAvailable = item.is_available === false;
    const { error } = await supabase
      .from("menu_item_store_availability")
      .upsert({
        item_id: String(item.id),
        store_id: String(sid),
        is_available: nextAvailable,
        updated_at: new Date().toISOString(),
      }, { onConflict: "item_id,store_id" });
    if (error) return showToast("error", "Item Update Failed", error.message);
    setItems((prev) => prev.map((row) => (
      String(row.id) === String(item.id)
        ? { ...row, is_available: nextAvailable, store_is_available: nextAvailable }
        : row
    )));
    showToast("success", "Store Availability Updated", `${item.name || "Item"} is now ${nextAvailable ? "available" : "unavailable"} for this store only.`);
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
          "Cheesecake Nutella MT",
          "Iced (R)",
          "75%",
          "Coffee Jelly",
          "PTM-2349128|29-JUN | 12:30 PM",
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
      showToast("success", "Print Test Sent", `Check the ${role === "cup_label" ? "Niimbot B1 Pro" : "printer"} output.`);
    } catch (error) {
      showToast("error", "Print Test Failed", error?.message || "Unable to print the test receipt.");
    }
  }

  async function reconnectPrinter(role = "receipt") {
    const cfg = buildPrinterConfigFromForm(role);
    try {
      const characteristic = await bleConnect(cfg);
      const device = characteristic?.service?.device;
      if (device) {
        cacheBluetoothPrinterDevice(device, cfg);
        updatePrinterProfile(role, {
          enabled: true,
          device_id: device.id || cfg.ble_device_id || "",
          name: device.name || cfg.ble_device_name || cfg.name || `${PRINTER_ROLE_LABELS[role]} Printer`,
        });
      }
      showToast("success", "Printer Reconnected", `${PRINTER_ROLE_LABELS[role]} permission is still available for this browser.`);
    } catch (error) {
      showToast("warn", "Reconnect Needs Permission", error?.message || "Use Search to grant printer permission again.");
      setPrinterPermissionRole(role);
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
        const characteristic = await service?.getCharacteristic(characteristicUuid);
        cacheBluetoothPrinterCharacteristic({
          ...form,
          ble_device_id: device.id,
          ble_device_name: device.name || form.name,
          ble_service_uuid: serviceUuid,
          ble_characteristic_uuid: characteristicUuid,
        }, characteristic);
        connectionVerified = true;
      } catch (err) {
        console.warn("Bluetooth printer validation skipped or failed", err);
      }

      updatePrinterProfile(role, {
        enabled: true,
        name: device.name || form.name?.trim() || `${PRINTER_ROLE_LABELS[role]} Printer`,
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
    if (!currentUserId) {
      showToast("error", "Shift Failed", "Cashier account is still loading. Please try again.");
      return;
    }

    const isEndDay = shiftCashMode === "end_day";
    const capturedShiftSummary = {
      ...shiftSummary,
      startingCash: Number(startingCash || 0),
    };
    const record = {
      id: `${shiftCashMode}-${Date.now()}`,
      store_id: storeId,
      cashier_id: isEndDay ? null : currentUserId,
      mode: shiftCashMode,
      cashier_name: cashierName || "Operator",
      cash_total: Number(totalCash || 0),
      denominations: shiftDenominations,
      sales_summary: capturedShiftSummary,
      created_at: new Date().toISOString(),
    };

    const nextRecords = [record, ...shiftRecords].slice(0, 20);
    setShiftRecords(nextRecords);
    if (typeof window !== "undefined") {
      localStorage.setItem(shiftStorageKey(storeId, currentUserId, "records"), JSON.stringify(nextRecords));
      if (shiftCashMode === "open") {
        localStorage.setItem(shiftStorageKey(storeId, currentUserId, "starting_cash"), String(totalCash || 0));
      } else {
        localStorage.removeItem(shiftStorageKey(storeId, currentUserId, "starting_cash"));
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
      showToast("info", shiftCashMode === "open" ? "Shift Opened Locally" : isEndDay ? "End Day Saved Locally" : "Shift Closed Locally", "Create or alter cashier_pos in Supabase to store shift records online.");
    } else {
      showToast("success", shiftCashMode === "open" ? "Shift Opened" : isEndDay ? "End Day Closed" : "Shift Closed", isEndDay ? "All POS accounts for this store will show closed after refresh." : "Shift record saved.");
    }

    if (isEndDay) {
      const reportText = buildEndDayReportText({
        store: currentStore,
        cashierName,
        startingCash,
        actualCash: totalCash,
        denominations: shiftDenominations,
        summary: capturedShiftSummary,
        printedAt: record.created_at,
      });
      try {
        await printByRole("receipt", reportText, printerConfig, { fallbackToBrowser: false });
      } catch (printError) {
        showToast("warn", "End Day Report Not Printed", printError?.message || "Select and save the receipt printer in POS Settings.");
      }
    }

    setShiftCashOpen(false);
  }

  async function reprintCloseShiftReport(record = selectedShiftReportRecord) {
    if (!record) {
      showToast("error", "No Shift Selected", "Select a closed shift report to reprint.");
      return;
    }

    const mode = getShiftRecordMode(record);
    const summary = parseShiftJsonValue(record.sales_summary, {});
    const denominations = parseShiftJsonValue(record.denominations, {});
    const closeTime = coerceReceiptTimestamp(record.created_at);
    const closeTimeMs = Number.isNaN(closeTime.getTime()) ? Date.now() : closeTime.getTime();
    const matchingOpen = (shiftRecords || [])
      .filter((row) => {
        if (!getShiftRecordMode(row).includes("open")) return false;
        if (String(row.store_id || "") !== String(record.store_id || "")) return false;
        if (record.cashier_id && row.cashier_id && String(row.cashier_id) !== String(record.cashier_id)) return false;
        const rowTime = coerceReceiptTimestamp(row.created_at);
        return !Number.isNaN(rowTime.getTime()) && rowTime.getTime() <= closeTimeMs;
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    const reportText = buildEndDayReportText({
      store: currentStore,
      cashierName: record.cashier_name || cashierName,
      startingCash: summary.startingCash ?? matchingOpen?.cash_total ?? matchingOpen?.starting_cash ?? startingCash ?? 0,
      actualCash: record.cash_total ?? summary.actualCash ?? 0,
      denominations,
      summary,
      printedAt: new Date(),
      title: mode.includes("end_day") ? "END DAY SALES REPORT" : "CLOSE SHIFT REPORT",
    });

    setReceiptText(reportText);
    setReceiptOpen(true);
    try {
      await printByRole("receipt", reportText, printerConfig, { fallbackToBrowser: false });
      showToast("success", "Shift Report Printed", "Closed shift report was sent to the receipt printer.");
    } catch (printError) {
      showToast("warn", "Shift Report Not Printed", printError?.message || "Select and save the receipt printer in POS Settings.");
    }
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
    const safeNextItems = jsonSafeValue(enrichOrderItemsForKds(nextItems));
    const nextTotalRaw = calcTotal(safeNextItems);
    const nextTotal = Number.isFinite(nextTotalRaw) ? Number(nextTotalRaw.toFixed(2)) : 0;

    const { error } = await supabase
      .from("open_tickets")
      .update({ items: safeNextItems, total_amount: nextTotal })
      .eq("id", ticket.id);

    if (error) {
      console.error("Saved ticket item void failed:", error);
      showToast("error", "Void Item Failed", error.message || error.details || "Open ticket update was rejected.");
      return;
    }
    await syncOpenTicketLineItems(ticket.id, safeNextItems);

    const { error: kdsError } = await markKdsTicketItemVoided(supabase, {
      sourceType: "pos",
      sourceId: ticket.id,
      itemId: line.cartItemId || line.id || line.menuItemId || line.menu_item_id,
      itemName: line.name,
    });
    if (kdsError) showToast("warn", "KDS Void Warning", kdsError.message);

    setSavedTickets((prev) =>
      prev.map((row) => (row.id === ticket.id ? { ...row, items: safeNextItems, total_amount: nextTotal } : row))
    );

    if (String(originalTicketId || "") === String(ticket.id)) {
      setCart(safeNextItems.filter((item) => !isVoidedLine(item)));
    }

    showToast("success", "Item Voided", `${line.name} marked voided.`);
  }

  async function resumeTicket(t) {
    setOriginalTicketId(t.id);
    setCart((t.items || []).filter((line) => !isVoidedLine(line)));
    clearActiveWebOrderContext(); // This layout block references physical tickets, clear web target references
    const name = t.order_type || t.ticket_name || "";
    const opt = (diningOptions || []).find((d) => d.name === name || (name.toLowerCase().startsWith(`${String(d.name || "").toLowerCase()} `)));
    setDiningOption(opt?.id || "");
    if (opt?.name && /grab/i.test(opt.name)) {
      setGrabOrderNumber(name.slice(String(opt.name).length).trim());
    } else {
      setGrabOrderNumber("");
    }
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
          const originalDiscount = Number(line._origDiscountAmount ?? line.discountAmount ?? line.discount_amount ?? 0);
          const restoredLine = { ...line, _origUnitPrice: orig, unitPrice: orig, discountAmount: originalDiscount };
          const voucherDiscount = lineGrossAmount(restoredLine) * voucherDiscountRate(t.applied_voucher);
          return {
            ...restoredLine,
            _origDiscountAmount: originalDiscount,
            discountAmount: Math.max(originalDiscount, voucherDiscount),
            appliedVoucher: t.applied_voucher,
          };
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
    if (!activeWebOrderId && isGrabDiningOption && !trimmedGrabOrderNumber) {
      return showToast("error", "GRAB Order Number Required", "Enter the GRAB order number before saving.");
    }

    const promptMessage = activeWebOrderId 
      ? "Save adjustments directly back to this active web order?" 
      : `Are you sure you want to park this current ticket to "${ticketDiningLabel || "Dining Option"}"?`;

    const confirmSave = confirm(promptMessage);
    if (!confirmSave) return;

    setSavingTicket(true);
    try {
      await saveTableOrder();
      await fetchSavedTickets();
      showToast("success", "Saved successfully", activeWebOrderId ? "Web order values updated." : "Ticket updated in system.");
      clearTicketSoft();
    } catch (err) {
      console.error("Save failed:", err);
      showToast("error", "Database Sync Failed", err.message || "An error occurred.");
    } finally {
      setSavingTicket(false);
    }
  }

  async function handlePrintBill() {
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before printing a bill.");
    if (!activeWebOrderId && !diningOptionName) return showToast("error", "Dining Option Required", "Please select a dining option.");
    if (!activeWebOrderId && isGrabDiningOption && !trimmedGrabOrderNumber) {
      return showToast("error", "GRAB Order Number Required", "Enter the GRAB order number before printing the bill.");
    }

    const grossTotal = cart.reduce((sum, line) => sum + lineGrossAmount(line), 0);
    const itemDiscountTotal = cart.reduce((sum, line) => sum + lineDiscountAmount(line), 0);
    const bill = buildBillText({
      receiptSettings,
      orderId: activeWebOrderId || originalTicketId || ticketDiningLabel || "Current Ticket",
      cart,
      diningOptionName: activeWebOrderId ? webDiningOptionLabel(activeWebOrderFulfillmentType || diningOptionName) : ticketDiningLabel,
      customerName: attachedCustomer?.name || "",
      subtotal: grossTotal,
      discount: itemDiscountTotal + discountAmount,
      total: totalDue,
      printedAt: new Date(),
      store: currentStore,
    });

    setReceiptText(bill);
    setReceiptOpen(true);

    try {
      await printByRole("receipt", bill, printerConfig, { fallbackToBrowser: false });
      showToast("success", "Bill Printed", "Bill sent to the receipt printer.");
    } catch (printError) {
      showToast("warn", "Bill Not Printed", printError?.message || "Select and save the receipt printer in POS Settings.");
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

    const confirmVoid = confirm(`Void entire current live ticket for "${ticketDiningLabel || diningOptionName}"? This clears all items permanently.`);
    if (!confirmVoid) return;

    setSavingTicket(true);
    try {
      if (originalTicketId) {
        await markKdsTicketStatus(supabase, { sourceType: "pos", sourceId: originalTicketId, status: "voided" });
      }
      if (originalTicketId) {
        await supabase.from("open_tickets").delete().eq("id", originalTicketId);
      } else {
        await supabase.from("open_tickets").delete().eq("order_type", ticketDiningLabel || diningOptionName);
      }
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
    if (!activeWebOrderId && isGrabDiningOption && !trimmedGrabOrderNumber) {
      return showToast("error", "GRAB Order Number Required", "Enter the GRAB order number before charging.");
    }
    setPaymentOpen(true);
  }

  async function confirmCharge(paymentPayload = {}) {
    if (charging) return;
    const total = Number(totalDue || 0);
    const splitPaymentsPayload = Array.isArray(paymentPayload.payments) ? paymentPayload.payments.filter((p) => p.method && Number(p.amount || 0) > 0) : [];
    const paymentLabel = splitPaymentsPayload.length > 0
      ? splitPaymentsPayload.map((p) => `${p.method} ${peso2(p.amount)}`).join(" + ")
      : selectedPayment || (total <= 0 ? "No Payment Required" : "");
    if (!paymentLabel) return showToast("error", "Payment Required", "Select a payment type.");
    const resolvedBranchId = getResolvedBranchId();
    if (!resolvedBranchId) return showToast("error", "Branch not set", "Please sign out and sign in again so POS can load your branch.");
    if (cart.length === 0) return showToast("error", "Empty Ticket", "Add items before charging.");

    const chargedAt = new Date().toISOString();
    const itemDiscountTotal = cart.reduce((sum, line) => sum + lineDiscountAmount(line), 0);
    const orderDiscount = Number(discountAmount || 0);
    const discount = Number(itemDiscountTotal + orderDiscount);
    const grossTotal = Number(cart.reduce((sum, line) => sum + lineGrossAmount(line), 0));
    const loyaltyEligibleTotal = cartLoyaltyEligibleTotal(cart);
    const voucherToRedeem = appliedVoucher || cart.find((line) => line?.appliedVoucher?.id)?.appliedVoucher || null;
    const chargedDiningLabel = activeWebOrderId
      ? webDiningOptionLabel(activeWebOrderFulfillmentType || diningOptionName)
      : ticketDiningLabel;
    const offlineReceiptNumber = `OFF-${Date.now().toString(36).toUpperCase()}`;
    const offlineDraft = {
      id: `${offlineReceiptNumber}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      receipt_number: offlineReceiptNumber,
      created_at: chargedAt,
      store_id: resolvedBranchId,
      branch_id: resolvedBranchId,
      cashier_id: currentUserId || null,
      cashier_name: cashierName,
      cart: cart.map((line) => ({ ...line })),
      customer: attachedCustomer ? {
        id: attachedCustomer.id,
        name: customerDisplayName(attachedCustomer) || attachedCustomer.name || null,
        code: customerDisplayCode(attachedCustomer) || attachedCustomer.code || null,
      } : null,
      payment: paymentLabel,
      diningOption: chargedDiningLabel || "POS ORDER",
      grossTotal,
      discount,
      total,
      sendToKds: !originalTicketId && !activeWebOrderId,
    };
    let createdOrderRow = null;
    let receiptCustomer = attachedCustomer;
    let loyaltyAlreadyAwarded = false;
    let activeWebOrderForCharge = null;

    setCharging(true);
    try {
      if (activeWebOrderId) {
        const { data: webOrderForCharge, error: webOrderForChargeErr } = await supabase
          .from("web_orders")
          .select("*")
          .eq("id", activeWebOrderId)
          .maybeSingle();
        if (webOrderForChargeErr) return showToast("error", "Web Order Check Failed", webOrderForChargeErr.message);
        if (!webOrderForCharge?.id) return showToast("error", "Web Order Missing", "Refresh POS and try again.");

        const webChargeStatus = String(webOrderForCharge.status || webOrderForCharge.order_status || "").toLowerCase();
        const alreadyClosed = ["completed", "delivered", "paid", "cancelled", "canceled", "rejected", "refunded", "voided"].includes(webChargeStatus);
        if (alreadyClosed || webOrderForCharge.receipt_number) {
          await fetchAcceptedWebOrders();
          return showToast("error", "Web Order Already Charged", "This web order already has a receipt or is no longer active.");
        }
        activeWebOrderForCharge = webOrderForCharge;
      }

      if (voucherToRedeem?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const redeemResponse = await fetch("/api/pos/redeem-voucher", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ voucherId: voucherToRedeem.id }),
        });
        const redeemJson = await redeemResponse.json().catch(() => ({}));
        if (!redeemResponse.ok || !redeemJson?.success) {
          return showToast("error", "Voucher Redeem Failed", redeemJson?.error || "Voucher is no longer active or was already used.");
        }
        setAvailableVouchers((prev) => prev.filter((voucher) => String(voucher.id) !== String(voucherToRedeem.id)));
      }

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
          loyalty_member_id: attachedCustomer?.id || null,
          customer_name: attachedCustomer?.name || null,
          items: enrichOrderItemsForKds(cart),
          subtotal: grossTotal,
          total,
          discount,
          gross_amount: grossTotal,
          discount_amount: discount,
          net_amount: total,
          order_type: chargedDiningLabel || "WEB_ORDER",
          cashier_id: currentUserId || null,
          paid_at: chargedAt,
          status: "paid",
          payment_method: paymentLabel,
          dining_option: chargedDiningLabel || "WEB_ORDER",
        }])
        .select("*")
        .single();
      if (orderErr) return showToast("error", "Charge Failed", orderErr.message);
      createdOrderRow = orderRow;

      if (!activeWebOrderId && !originalTicketId) {
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
        line_total: lineNetAmount(line),
        gross_amount: lineGrossAmount(line),
        discount_amount: lineDiscountAmount(line),
        net_amount: lineNetAmount(line),
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
        const { error: webCompleteErr } = await supabase
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
            customer_name: attachedCustomer?.name || activeWebOrderForCharge?.customer_name || null,
            items: enrichOrderItemsForKds(cart),
            subtotal: Number(subtotal),
            total: total
          })
          .eq("id", activeWebOrderId);
        if (webCompleteErr) return showToast("error", "Web Order Update Failed", webCompleteErr.message);

        await markKdsTicketStatus(supabase, { sourceType: "web", sourceId: activeWebOrderId, status: "completed" });

        await awardWebOrderLoyaltyPoints({ ...activeWebOrderForCharge, pos_order_id: orderRow.id }, calcLoyaltyPoints(loyaltyEligibleTotal), attachedCustomer?.id);
      } else {
        if (attachedCustomer?.id) {
          try {
            const updatedCustomer = await awardMemberLoyaltyPoints(attachedCustomer.id, calcLoyaltyPoints(loyaltyEligibleTotal), total, orderRow.id);
            if (updatedCustomer?.id) {
              receiptCustomer = updatedCustomer;
              loyaltyAlreadyAwarded = true;
            }
          } catch (loyaltyError) {
            showToast("warn", "Loyalty Points Not Added", loyaltyError?.message || "Sale completed, but loyalty points need review.");
          }
        }
        if (originalTicketId) {
          // The saved ticket was already sent to KDS when first saved.
          // Charging should not resend or complete the kitchen ticket.
          await supabase.from("open_tickets").delete().eq("id", originalTicketId);
        } else {
          await supabase.from("open_tickets").delete().eq("order_type", chargedDiningLabel);
        }
      }

      const receipt = buildReceiptText({
        receiptSettings, order: { ...orderRow, id: generatedReceiptNumber }, cart, diningOptionName: chargedDiningLabel || "WEB_ORDER", payment: paymentLabel,
        customer: receiptCustomer, subtotal: grossTotal, discount, total, voucher: voucherToRedeem, appliedDiscount, store: currentStore, cashierName, loyaltyAlreadyAwarded, loyaltyEligibleTotal,
      });

      setReceiptText(receipt);
      setReceiptOpen(true);

      if (!originalTicketId && !activeWebOrderId) {
        await autoPrintOrderSlip({
          orderId: generatedReceiptNumber,
          slipCart: cart,
          slipDining: chargedDiningLabel || "POS ORDER",
          slipCustomer: attachedCustomer?.name || "Walk-in",
          slipTotal: total,
          printedAt: orderRow.paid_at || orderRow.created_at || new Date(),
        });
      }

      const shouldAskCupLabelOnCharge = !originalTicketId && !activeWebOrderId;
      if (shouldAskCupLabelOnCharge) {
        await autoPrintBarCupLabels({
          orderId: generatedReceiptNumber,
          labelCart: cart,
          labelDining: chargedDiningLabel || "WEB ORDER",
          printedAt: orderRow.paid_at || orderRow.created_at || new Date(),
          askBeforePrint: true,
          promptContext: "this charged order",
        });
      }

      if (receiptSettings?.auto_print) {
        try {
          await printByRole("receipt", receipt, printerConfig, { fallbackToBrowser: false });
        } catch (printError) {
          showToast("warn", "Sale Saved, Printer Needs Permission", printError?.message || "Open POS Settings, select the saved printer, then reprint the receipt.");
        }
      }

      showToast("success", "Charged Successfully", "Transaction saved and synced to logs.");
      clearTicketSoft();
      setPaymentOpen(false);
      await Promise.all([
        fetchAcceptedWebOrders(),
        fetchPendingCount(storeId),
        managementOpen ? fetchReceiptLogs() : Promise.resolve(),
      ]);
    } catch (err) {
      console.error("Execution failed:", err);
      if (!createdOrderRow && !activeWebOrderId && !voucherToRedeem?.id && isProbablyOfflineError(err)) {
        queueOfflineCharge(offlineDraft);
        setIsOfflineMode(true);

        const offlineReceipt = buildReceiptText({
          receiptSettings,
          order: {
            id: offlineReceiptNumber,
            order_number: offlineReceiptNumber,
            receipt_number: offlineReceiptNumber,
            store_id: resolvedBranchId,
            branch_id: resolvedBranchId,
            paid_at: chargedAt,
            created_at: chargedAt,
            dining_option: chargedDiningLabel || "POS ORDER",
            payment_method: paymentLabel,
          },
          cart,
          diningOptionName: chargedDiningLabel || "POS ORDER",
          payment: paymentLabel,
          customer: attachedCustomer,
          subtotal: grossTotal,
          discount,
          total,
          voucher: voucherToRedeem,
          appliedDiscount,
          store: currentStore,
          cashierName,
          loyaltyEligibleTotal,
          copyLabel: "*** OFFLINE COPY - PENDING SYNC ***",
        });

        setReceiptText(offlineReceipt);
        setReceiptOpen(true);
        if (receiptSettings?.auto_print) {
          try {
            await printByRole("receipt", offlineReceipt, printerConfig, { fallbackToBrowser: false });
          } catch (printError) {
            showToast("warn", "Offline Sale Queued", "Sale saved locally. Printer needs permission before reprint.");
          }
        }

        showToast("warn", "Offline Sale Queued", "Sale saved locally and will sync when internet returns.");
        clearTicketSoft();
        setPaymentOpen(false);
        return;
      }
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
    setCustomerDetailsOpen(false);
    setCustomerSearch("");
    setAppliedVoucher(null);
    setAvailableVouchers([]);
    setVoucherTargetCartItemId(null);
    setCart((prev) =>
      prev.map((line) => {
        return line.appliedVoucher ? restoreVoucherLine(line) : line;
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

  const openVoucherPickerForLine = async (line) => {
    if (!attachedCustomer?.id) return showToast("error", "Attach Customer", "Scan/select a customer first.");
    if (!line?.cartItemId) return showToast("info", "Select Item", "Tap a ticket item first to set voucher target.");
    setVoucherTargetCartItemId(line.cartItemId);
    const v = await fetchActiveVouchers(attachedCustomer.id);
    setVoucherModalOpen(true);
    if (v.length === 0) showToast("info", "No Vouchers", "No active vouchers for this customer.");
  };

  const applyVoucherToTicket = (voucher) => {
    if (!voucherTargetCartItemId) {
      showToast("info", "Select Item", "Tap a ticket item first to set voucher target.");
      return;
    }

    setAppliedVoucher({ ...voucher, applied_to_cartItemId: voucherTargetCartItemId });
    setCart((prev) =>
      prev.map((line) => {
        const cleared = line.appliedVoucher ? restoreVoucherLine(line) : { ...line };

        if (line.cartItemId === voucherTargetCartItemId) {
          const orig = typeof cleared.unitPrice === "number" ? cleared.unitPrice : 0;
          const originalDiscount = Number(cleared.discountAmount || cleared.discount_amount || 0);
          const voucherDiscount = lineGrossAmount(cleared) * voucherDiscountRate(voucher);
          cleared._origUnitPrice = orig;
          cleared._origDiscountAmount = originalDiscount;
          cleared.discountAmount = Math.max(originalDiscount, voucherDiscount);
          cleared.appliedVoucher = {
            id: voucher.id,
            code: voucher.code,
            reward_text: displayVoucherRewardText(voucher),
            reward_type: voucher.reward_type,
            expires_at: voucher.expires_at,
          };
        }
        return cleared;
      })
    );
    showToast("success", "Voucher Applied", `${voucher.code} applied (${isWelcomeVoucher(voucher) ? "B1T1" : "100% OFF"}).`);
  };

  const removeAppliedVoucher = () => {
    setAppliedVoucher(null);
    setCart((prev) =>
      prev.map((line) => {
        return line.appliedVoucher ? restoreVoucherLine(line) : line;
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
    setGrabOrderNumber("");
    setSplitMode(false);
    setSplitSelected([]);
    setOriginalTicketId(null);
    clearActiveWebOrderContext(); // Clear tracking target references safely
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

      const { data: ticketRow, error } = await supabase.from("open_tickets").insert([payload]).select("id").single();
      if (error) {
        showToast("error", "Move Failed", error.message);
        return;
      }
      await syncOpenTicketLineItems(ticketRow.id, movingItems);

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
      await syncOpenTicketLineItems(ticket.id, merged);

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
      <div className="min-h-screen overscroll-none bg-[#FFF5F7] font-sans antialiased text-slate-800" style={{ overscrollBehaviorY: "none" }}>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="h-10 w-10 rounded-full border-4 border-rose-100 border-t-[#FC687D] animate-spin" />
        </div>
      </div>
    );
  }

  if (shiftStatus === "closed") {
    return (
      <div className="min-h-screen overscroll-none bg-[#FFF5F7] font-sans antialiased text-slate-800" style={{ overscrollBehaviorY: "none" }}>
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
    <div className="min-h-screen overscroll-none bg-[#FFF5F7] pb-24 lg:pb-0 font-sans antialiased text-slate-800" style={{ overscrollBehaviorY: "none" }}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* PERSISTENT PWA INSTALLATION TRIGGER BANNER LAYOUT */}
      {showInstallBanner && (
        <div className="bg-gradient-to-r from-blue-700 to-[#FC687D] text-white py-2 px-4 shadow-sm flex items-center justify-between text-xs font-semibold select-none animate-in slide-in-from-top duration-300">
          <div className="flex text-[14px] items-center gap-2">
            <span>📱</span>
            <span>Run Juja POS directly as a standalone hardware desktop app window.</span>
          </div>
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
            <button 
              onClick={handleExecuteInstall} 
              className="bg-white/10 text-slate-900 rounded-lg px-3 py-1 text-[11px] active:scale-95 transition"
            >
              INSTALL APP
            </button>
            <button 
              onClick={() => setShowInstallBanner(false)} 
              className="text-white/80 hover:text-slate-900 px-2 py-1 text-sm font-normal"
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
                    ["recipes", "Recipes"],
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
            <div className="flex w-full max-w-5xl max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex-col rounded-2xl border border-rose-100 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-rose-50 pb-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#FC687D]">POS Control</p>
              <h2 className="text-md font-black text-slate-800">
                {managementView === "receipts" ? "Receipts" : managementView === "shift" ? "Shift" : managementView === "items" ? "Items" : managementView === "recipes" ? "Recipes" : "Settings"}
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

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                    <p className="text-[10px] font-semibold italic text-slate-400 truncate">
                      {r.date || ""} · {r.payment_type || "Other"} · {r.status || "Closed"}
                    </p>
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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <div className="rounded-lg bg-white border border-slate-100 p-2">
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Customer</span>
                        <b className="block truncate">{selectedReceipt.customer_name || "Walk-in"}</b>
                        {selectedReceipt.customer_code && <span className="block text-[10px] font-semibold text-slate-500 truncate">{selectedReceipt.customer_code}</span>}
                      </div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Gross</span><b>{peso2(selectedReceipt.gross_sales || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Discount</span><b>{peso2(selectedReceipt.discounts || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Net</span><b>{peso2(selectedReceipt.net_sales || 0)}</b></div>
                      <div className="rounded-lg bg-white border border-slate-100 p-2"><span className="block text-[9px] font-bold uppercase text-slate-400">Payment</span><b>{selectedReceipt.payment_type || "-"}</b></div>
                    </div>
                    <div className="space-y-2">
                      {selectedReceiptItems.map((row, idx) => (
                        <div key={`${row.receipt_number}-${row.item}-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-100 bg-white p-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase text-slate-800">{row.item}</p>
                            {receiptItemDisplayLines(row).map((line, lineIdx) => (
                              <p key={`${row.receipt_number}-${row.item}-${idx}-option-${lineIdx}`} className="mt-0.5 text-[11px] font-medium text-slate-600">
                                {line}
                              </p>
                            ))}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" onClick={() => openShiftCashModal("close")} className="h-10 rounded-xl bg-[#FC687D] text-white text-[10px] font-black uppercase tracking-wider">Close Shift</button>
                  <button type="button" onClick={() => openShiftCashModal("end_day")} className="h-10 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider">End Day</button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Reprint close shift report</label>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <select
                      value={selectedShiftReportRecord?.id || ""}
                      onChange={(e) => setSelectedShiftReportId(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    >
                      {closedShiftReportRecords.length === 0 ? (
                        <option value="">No closed shifts found</option>
                      ) : closedShiftReportRecords.map((record) => {
                        const mode = getShiftRecordMode(record).includes("end_day") ? "End day" : "Close shift";
                        const total = peso2(record.cash_total || 0);
                        return (
                          <option key={record.id} value={record.id}>
                            {mode} - {formatReceiptDateTime(record.created_at)} - {total}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={() => reprintCloseShiftReport()}
                      disabled={!selectedShiftReportRecord}
                      className="h-10 rounded-xl border border-cyan-100 bg-cyan-50 px-4 text-[10px] font-black uppercase tracking-wider text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Reprint
                    </button>
                  </div>
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
                {[
                  ["Gross sales", shiftSummary.grossSales],
                  ["Refunds", shiftSummary.refunds],
                  ["Discounts", shiftSummary.discounts],
                  ["Net sales", shiftSummary.netSales],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between rounded-lg bg-white border border-slate-100 p-2 text-xs font-bold">
                    <span className="text-slate-500">{label}</span>
                    <span className={label === "Refunds" || label === "Discounts" ? "text-rose-600" : label === "Net sales" ? "text-cyan-700" : "text-slate-900"}>
                      {peso2(value)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-slate-200" />
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

          {managementView === "recipes" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">Inventory Recipes</p>
                    <h3 className="text-sm font-black text-slate-900">Recipe Reference</h3>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      View-only recipe list using Admin Inventory recipes and common-name stock.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
                    <label className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Search Menu Items</span>
                      <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                        <Search size={14} className="text-slate-400" />
                        <input
                          value={recipeMenuSearch}
                          onChange={(e) => setRecipeMenuSearch(e.target.value)}
                          className="h-full w-full bg-transparent text-xs font-semibold text-slate-800 outline-none"
                          placeholder="Search all categories"
                        />
                      </div>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Category</span>
                      <select
                        value={recipeCategoryFilter}
                        onChange={(e) => setRecipeCategoryFilter(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none"
                      >
                        <option value="all">All categories</option>
                        {recipeCategoryOptions.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {recipeMenuItemsByCategory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-400">
                    No menu items found for this recipe filter.
                  </div>
                ) : recipeMenuItemsByCategory.map((group) => (
                  <section key={group.name} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">{group.name}</h4>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.rows.map((menu) => {
                        const menuRecipes = recipesByMenuItem.get(String(menu.id)) || [];
                        return (
                          <div key={menu.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-slate-900">{menu.name}</p>
                                <p className="text-[10px] font-semibold text-slate-400">{menu.category || "Uncategorized"}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
                                {menuRecipes.length} item(s)
                              </span>
                            </div>
                            <div className="mt-3 space-y-2">
                              {menuRecipes.length ? menuRecipes.map((row) => (
                                <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white p-2 text-xs">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-800">{getRecipeIngredientName(row)}</p>
                                    <p className="text-[10px] font-semibold text-slate-400">Available: {getRecipeIngredientStock(row)}</p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">
                                    {Number(row.quantity_required || 0).toLocaleString("en-PH", { maximumFractionDigits: 3 })} {normalizeUnit(row.unit || "")}
                                  </span>
                                </div>
                              )) : (
                                <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] font-semibold text-amber-700">
                                  No recipe set. POS checkout can continue, but inventory deduction will be skipped for this menu item.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
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
                    <div key={role} className={`rounded-2xl border p-4 shadow-sm transition ${roleForm.enabled ? "border-cyan-200 bg-cyan-50/40" : "border-slate-200 bg-white"}`}>
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
                            <option>Niimbot B1 Pro label printer</option>
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

                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => reconnectPrinter(role)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 text-[11px] font-black uppercase tracking-wider text-cyan-800 transition hover:bg-cyan-100">
                            <Bluetooth size={14} />
                            Reconnect
                          </button>
                          <button type="button" onClick={() => printPrinterTest(role)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-black uppercase tracking-wider text-slate-800 transition hover:bg-slate-50">
                            <Printer size={15} className="text-slate-500" />
                            Test
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
                              <p className="text-[11px] font-semibold text-slate-400">
                                Use the printer service and write characteristic exposed by the selected Bluetooth printer.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => updatePrinterProfile(role, {
                                service_uuid: isCupLabel ? NIIMBOT_BLE_SERVICE_UUID : DEFAULT_BLUETOOTH_PRINTER_SERVICE_UUID,
                                characteristic_uuid: isCupLabel ? NIIMBOT_BLE_CHARACTERISTIC_UUID : DEFAULT_BLUETOOTH_PRINTER_CHARACTERISTIC_UUID,
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
                          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-4 text-amber-900">
                            <p className="font-black uppercase tracking-wider">Niimbot B1 Pro setup</p>
                            <p>Pair the printer first in the device Bluetooth settings, then tap Search once in POS to grant browser permission. POS can remember the allowed device and reconnect after refresh when the browser supports remembered Bluetooth devices.</p>
                            <p>Browser Bluetooth cannot stay physically connected after logout, refresh, or closing the installed app. If the Niimbot rejects ESC/POS text, it needs a Niimbot-specific label protocol encoder.</p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-[11px] font-semibold leading-4 text-cyan-900">
                            Saved Bluetooth permission is reused after refresh when supported by Chrome or Edge. If reconnect fails, use Search once again.
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2">
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
          </div>
        )}

        {/* MAIN TERMINAL RESPONSIVE GRID LAYOUT FLOW */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-5 items-start">
          
          {/* CATALOG AND MENU SHELF VIEW PANELS */}
          <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm space-y-4">
            
            {/* Catalog Controller Sorting filters bars */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <label className="relative w-full sm:w-80">
                <span className="sr-only">Category</span>
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-9 text-[14px] font-bold text-slate-700 outline-none transition focus:border-rose-200 focus:bg-white"
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
              
              <div className="relative w-full sm:w-100">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                <input
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search catalogue items..."
                  className="w-full pl-9 pr-4 py-4 bg-slate-50 rounded-xl text-[12px] font-semibold text-slate-700 outline-none border border-slate-200 focus:bg-white focus:border-rose-200 transition"
                />
              </div>
              <button
                type="button"
                onClick={refreshPosNow}
                disabled={!storeId || manualRefreshing}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-4 text-[11px] font-black uppercase tracking-wider text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-white hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                title="Refresh POS data"
              >
                <RefreshCw size={15} className={manualRefreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {/* Product tile grid with category dropdown selection */}
            {loading ? (
              <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 gap-3 max-h-[calc(100vh-190px)] overflow-y-auto pr-1">
                  {visibleMenuItems.length === 0 ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs font-semibold text-slate-500">
                      {activeCategory ? "No available items found in this category." : "No featured menu items found."}
                    </div>
                  ) : visibleMenuItems.map((item) => {
                    const orderable = item.is_available !== false && itemAvailableForChannel(item);
                    return (
                      <button
                        key={item.id}
                        disabled={!orderable}
                        onClick={() => {
                          if (!orderable) return;
                          setSelectedItemForModal(item);
                        }}
                        className={`group relative border rounded-xl p-2.5 text-left transition-all duration-200 flex flex-col h-full justify-between ${
                          orderable
                            ? "bg-white border-slate-100 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
                            : "cursor-not-allowed border-slate-200 bg-slate-100 opacity-70 grayscale"
                        }`}
                      >
                        {!orderable && (
                          <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-800 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-sm">
                            Unavailable
                          </span>
                        )}
                        <div className="w-full">
                          <div className="w-full aspect-square bg-[#FFF9FA] border border-rose-50/50 flex items-center justify-center overflow-hidden rounded-lg relative">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover p-1 group-hover:scale-102 transition" />
                            ) : (
                              <span className="text-2xl text-rose-200/50">📷</span>
                            )}
                          </div>
                          <div className="mt-2.5 px-0.5">                            
                            <div className="flex items-center gap-1.5">
                              <p className="min-w-0 flex-1 truncate text-[14px] font-bold leading-tight text-slate-800">{item.name}</p>
                              {item.channel_price_label && (
                                <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-800">
                                  {item.channel_price_label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-[14px] font-semibold text-slate-800 mt-2 px-0.5 pt-2 border-t border-slate-50 w-full">
                          {item.is_variable_price ? "Variable Price" : `₱${Number(item.price || 0).toFixed(0)}`}
                        </p>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* SIDEBAR TICKET INTERACTION LAYER PANEL */}
          <div className="hidden lg:block bg-white border border-rose-100 rounded-2xl p-3 shadow-sm sticky top-4 h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] overflow-hidden">
            {(isOfflineMode || offlineQueueCount > 0) && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                {isOfflineMode ? "Offline mode: using cached POS data." : "Online: syncing offline sales."}
                {offlineQueueCount > 0 ? ` ${offlineQueueCount} sale${offlineQueueCount === 1 ? "" : "s"} pending upload.` : ""}
              </div>
            )}
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
              grabOrderNumber={grabOrderNumber}
              setGrabOrderNumber={setGrabOrderNumber}
              showGrabOrderNumber={isGrabDiningOption && !activeWebOrderId}
              subtotal={totalDue}
              ticketTitle={ticketTitle}
              ticketSubtitle={ticketSubtitle}
              attachedCustomer={attachedCustomer}
              onRemoveCustomer={removeAttachedCustomer}
              onChangeCustomer={prepareCustomerChange}
              onViewCustomer={() => setCustomerDetailsOpen(true)}
              appliedVoucher={appliedVoucher}
              discountRules={orderDiscountRules}
              appliedDiscount={appliedDiscount}
              onApplyDiscount={setAppliedDiscount}
              onRemoveDiscount={() => setAppliedDiscount(null)}
              onOpenVouchers={async () => {
                if (!attachedCustomer?.id) return showToast("error", "Attach Customer", "Scan/select a customer first.");
                const v = await fetchActiveVouchers(attachedCustomer.id);
                setVoucherModalOpen(true);
                if (v.length === 0) showToast("info", "No Vouchers", "No active vouchers for this customer.");
              }}
              onRemoveVoucher={removeAppliedVoucher}
              onApplyVoucherToLine={openVoucherPickerForLine}
              onClear={() => setConfirmOpen(true)}
              onCharge={handleChargeOrder}
              onSave={handleSaveTicket}
              onPrintBill={handlePrintBill}
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
                setSelectedItemForModal({ ...itemForActiveChannel(base), editData: line, editIndex: idx });
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
              <p className="text-sm font-black">{peso2(totalDue)}</p>
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
              {(isOfflineMode || offlineQueueCount > 0) && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                  {isOfflineMode ? "Offline mode: using cached POS data." : "Online: syncing offline sales."}
                  {offlineQueueCount > 0 ? ` ${offlineQueueCount} sale${offlineQueueCount === 1 ? "" : "s"} pending upload.` : ""}
                </div>
              )}
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
                grabOrderNumber={grabOrderNumber}
                setGrabOrderNumber={setGrabOrderNumber}
                showGrabOrderNumber={isGrabDiningOption && !activeWebOrderId}
                subtotal={totalDue}
                ticketTitle={ticketTitle}
                ticketSubtitle={ticketSubtitle}
                attachedCustomer={attachedCustomer}
                onRemoveCustomer={removeAttachedCustomer}
                onChangeCustomer={prepareCustomerChange}
                onViewCustomer={() => setCustomerDetailsOpen(true)}
                appliedVoucher={appliedVoucher}
                discountRules={orderDiscountRules}
                appliedDiscount={appliedDiscount}
                onApplyDiscount={setAppliedDiscount}
                onRemoveDiscount={() => setAppliedDiscount(null)}
                onOpenVouchers={async () => {
                  if (!attachedCustomer?.id) return showToast("error", "Attach Customer", "Scan/select a customer first.");
                  const v = await fetchActiveVouchers(attachedCustomer.id);
                  setVoucherModalOpen(true);
                  if (v.length === 0) showToast("info", "No Vouchers", "No active vouchers for this customer.");
                }}
                onRemoveVoucher={removeAppliedVoucher}
                onApplyVoucherToLine={openVoucherPickerForLine}
                onClear={() => setConfirmOpen(true)}
                onCharge={handleChargeOrder}
                onSave={handleSaveTicket}
                onPrintBill={handlePrintBill}
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
                  setSelectedItemForModal({ ...itemForActiveChannel(base), editData: line, editIndex: idx });
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
      <CustomerAccountDetailsModal
        open={customerDetailsOpen && !!attachedCustomer}
        onClose={() => setCustomerDetailsOpen(false)}
        customer={attachedCustomer}
      />
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
          discountRules={itemDiscountRules}
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
