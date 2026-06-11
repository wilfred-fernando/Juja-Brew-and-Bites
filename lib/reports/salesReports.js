"use client";

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_TZ = "Asia/Manila";

export const REPORT_TABS = [
  { key: "summary", label: "Sales summary" },
  { key: "items", label: "Sales by item" },
  { key: "categories", label: "Sales by category" },
  { key: "employees", label: "Sales by employee" },
  { key: "payments", label: "Sales by payment type" },
  { key: "receipts", label: "Receipts" },
  { key: "modifiers", label: "Sales by modifier" },
  { key: "discounts", label: "Discounts" },
  { key: "taxes", label: "Taxes" },
  { key: "shifts", label: "Shifts" },
  { key: "exports", label: "Export Reports" },
];

export const STATUS_OPTIONS = ["All", "Paid", "Voided", "Refunded", "Cancelled"];
export const ORDER_TYPE_OPTIONS = ["All", "Dine-in", "Takeout", "Delivery", "Function room", "Catering", "Online"];

export function peso(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function number(value) {
  return Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function manilaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function displayDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function displayDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function addDays(value, days) {
  const date = new Date(`${value}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return manilaDate(date);
}

export function daysBetween(start, end) {
  const from = new Date(`${start}T00:00:00+08:00`);
  const to = new Date(`${end}T00:00:00+08:00`);
  return Math.max(1, Math.round((to - from) / DAY_MS) + 1);
}

export function dateRange(start, end) {
  const length = Math.min(daysBetween(start, end), 370);
  return Array.from({ length }, (_, index) => addDays(start, index));
}

export function defaultFilters() {
  const today = manilaDate();
  return {
    preset: "today",
    startDate: today,
    endDate: today,
    branchId: "All",
    paymentMethod: "All",
    orderType: "All",
    cashierId: "All",
    status: "All",
    categoryId: "All",
    productId: "All",
  };
}

export function rangeFromPreset(preset) {
  const today = manilaDate();
  const date = new Date(`${today}T00:00:00+08:00`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const year = today.slice(0, 4);
  const lastMonthDate = new Date(`${firstOfMonth}T00:00:00+08:00`);
  lastMonthDate.setUTCDate(0);
  const lastMonthEnd = manilaDate(lastMonthDate);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;

  if (preset === "yesterday") return { startDate: addDays(today, -1), endDate: addDays(today, -1) };
  if (preset === "this_week") return { startDate: addDays(today, mondayOffset), endDate: addDays(today, mondayOffset + 6) };
  if (preset === "last_week") return { startDate: addDays(today, mondayOffset - 7), endDate: addDays(today, mondayOffset - 1) };
  if (preset === "this_month") {
    const end = new Date(`${firstOfMonth}T00:00:00+08:00`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return { startDate: firstOfMonth, endDate: manilaDate(end) };
  }
  if (preset === "last_month") return { startDate: lastMonthStart, endDate: lastMonthEnd };
  if (preset === "this_year") return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  return { startDate: today, endDate: today };
}

export function previousRange(startDate, endDate) {
  const length = daysBetween(startDate, endDate);
  const end = addDays(startDate, -1);
  return { startDate: addDays(end, -(length - 1)), endDate: end };
}

function firstText(row, fields, fallback = "") {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return fallback;
}

function firstNumber(row, fields, fallback = 0) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && value !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return fallback;
}

function isCompletedStatus(status) {
  return ["closed", "completed", "complete", "paid", "delivered"].includes(String(status || "").toLowerCase());
}

function isRefundOrVoid(row) {
  const status = `${row?.status || ""} ${row?.payment_status || ""}`.toLowerCase();
  return Boolean(row?.voided_at || row?.refunded_at || status.includes("refund") || status.includes("void"));
}

function paymentLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "Other";
  const upper = text.toUpperCase();
  if (upper.includes("GCASH")) return "GCash";
  if (upper.includes("QRPH")) return "QRPH";
  if (upper.includes("CARD")) return "Card";
  if (upper.includes("MAYA")) return "Maya";
  if (upper.includes("GRAB DINE")) return "Grab Dine Out";
  if (upper.includes("GRAB")) return "GrabFood";
  if (upper.includes("PANDA") || upper.includes("FOODPANDA")) return "Foodpanda";
  if (upper.includes("BANK")) return "Bank Transfer";
  if (upper.includes("CASH")) return "Cash";
  return text;
}

function orderTypeLabel(row, source) {
  if (source === "Web") {
    const dining = firstText(row, ["dining_option"], "Online");
    if (dining.toLowerCase().includes("delivery")) return "Delivery";
    if (dining.toLowerCase().includes("dine")) return "Dine-in";
    return "Online";
  }
  const text = firstText(row, ["order_type", "dining_option"], "Takeout");
  const lower = text.toLowerCase();
  if (lower.includes("delivery")) return "Delivery";
  if (lower.includes("dine")) return "Dine-in";
  if (lower.includes("function")) return "Function room";
  if (lower.includes("cater")) return "Catering";
  if (lower.includes("web") || lower.includes("online")) return "Online";
  return text || "Takeout";
}

function businessDate(value) {
  if (!value) return manilaDate();
  return manilaDate(new Date(value));
}

function receiptNumber(row, source) {
  const explicit = firstText(row, ["order_number", "receipt_number", "reference_no"]);
  if (explicit) return explicit;
  const id = String(row?.id || "");
  return source === "Web" ? `WEB-${id.slice(0, 8).toUpperCase()}` : id.slice(0, 12);
}

function getWebItems(order) {
  if (Array.isArray(order?.items)) return order.items;
  if (typeof order?.items === "string") {
    try {
      const parsed = JSON.parse(order.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function itemQty(item) {
  return Number(item?.quantity ?? item?.qty ?? 1) || 1;
}

function itemTotal(item) {
  const qty = itemQty(item);
  return firstNumber(item, ["line_total", "net_amount", "total", "subtotal"], Number(item?.unitPrice || item?.unit_price || item?.price || 0) * qty);
}

export function normalizeSalesData({ orders = [], orderItems = [], webOrders = [], menuItems = [], profiles = [], stores = [] }) {
  const menuById = new Map(menuItems.map((item) => [String(item.id), item]));
  const itemsByOrder = new Map();
  orderItems.forEach((item) => {
    const key = String(item.order_id || "");
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  });

  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const storeById = new Map(stores.map((store) => [String(store.id), store]));

  const normalizeOrder = (row, source) => {
    const total = firstNumber(row, ["net_amount", "total", "net_sales", "subtotal"], 0);
    const discount = Math.max(
      firstNumber(row, ["discount_amount"], 0),
      firstNumber(row, ["discount"], 0),
      firstNumber(row, ["discounts"], 0)
    );
    const gross = firstNumber(row, ["gross_amount", "gross_sales", "subtotal"], total + discount);
    const refund = firstNumber(row, ["refund_amount", "refund", "refunds"], isRefundOrVoid(row) ? total : 0);
    const net = Math.max(0, gross - discount - refund);
    const cashierId = firstText(row, ["cashier_id", "created_by", "user_id"]);
    const profile = profileById.get(cashierId);
    const storeId = firstText(row, ["store_id", "branch_id"]);
    const store = storeById.get(storeId);
    const status = isRefundOrVoid(row) ? (row?.voided_at ? "Voided" : "Refunded") : isCompletedStatus(row?.status) ? "Paid" : (row?.status || "Paid");

    return {
      id: row.id,
      source,
      createdAt: row.paid_at || row.created_at,
      date: businessDate(row.paid_at || row.created_at),
      orderNumber: receiptNumber(row, source),
      customerName: firstText(row, ["customer_name", "customer"], source === "Web" ? "Web customer" : "Walk-in"),
      orderType: orderTypeLabel(row, source),
      paymentMethod: paymentLabel(row.payment_method || row.payment_type),
      gross,
      discount,
      refund,
      net,
      cashierId: cashierId || (source === "Web" ? "WEB" : "UNASSIGNED"),
      cashierName: profile?.full_name || firstText(row, ["cashier_name"], source === "Web" ? "Web order" : "Unassigned"),
      storeId: storeId || "MAIN",
      storeName: store?.name || storeId || "Main store",
      status,
      raw: row,
    };
  };

  const sales = [
    ...orders.map((order) => normalizeOrder(order, "POS")),
    ...webOrders.filter((order) => isCompletedStatus(order.status)).map((order) => normalizeOrder(order, "Web")),
  ];

  const lineItems = [];
  orders.forEach((order) => {
    const normalized = sales.find((row) => row.id === order.id && row.source === "POS");
    (itemsByOrder.get(String(order.id)) || []).forEach((item) => {
      const menu = menuById.get(String(item.menu_item_id || ""));
      const qty = itemQty(item);
      const gross = firstNumber(item, ["gross_amount", "line_total"], itemTotal(item));
      const discount = firstNumber(item, ["discount_amount"], 0);
      const net = firstNumber(item, ["net_amount", "line_total"], gross - discount);
      lineItems.push({
        id: item.id,
        orderId: order.id,
        source: "POS",
        date: normalized?.date,
        orderNumber: normalized?.orderNumber,
        itemId: String(item.menu_item_id || item.id || item.name),
        itemName: firstText(item, ["item_name", "name"], "Item"),
        category: firstText(item, ["category_name", "category"], menu?.category || "Uncategorized"),
        quantity: qty,
        unitPrice: firstNumber(item, ["unit_price"], qty ? net / qty : net),
        gross,
        discount,
        net,
        orderType: normalized?.orderType,
        storeId: normalized?.storeId,
        storeName: normalized?.storeName,
        status: normalized?.status,
      });
    });
  });

  webOrders.filter((order) => isCompletedStatus(order.status)).forEach((order) => {
    const normalized = sales.find((row) => row.id === order.id && row.source === "Web");
    getWebItems(order).forEach((item, index) => {
      const menu = menuById.get(String(item.id || item.menu_item_id || ""));
      const qty = itemQty(item);
      const net = itemTotal(item);
      lineItems.push({
        id: `${order.id}-${index}`,
        orderId: order.id,
        source: "Web",
        date: normalized?.date,
        orderNumber: normalized?.orderNumber,
        itemId: String(item.id || item.menu_item_id || item.name || index),
        itemName: firstText(item, ["item_name", "name", "title"], "Item"),
        category: firstText(item, ["category_name", "category"], menu?.category || "Web Orders"),
        quantity: qty,
        unitPrice: qty ? net / qty : net,
        gross: net,
        discount: 0,
        net,
        orderType: normalized?.orderType,
        storeId: normalized?.storeId,
        storeName: normalized?.storeName,
        status: normalized?.status,
      });
    });
  });

  return { sales, lineItems };
}

function matches(value, selected) {
  return selected === "All" || !selected || String(value) === String(selected);
}

export function applyFilters({ sales, lineItems }, filters) {
  const salesRows = sales.filter((row) => {
    if (row.date < filters.startDate || row.date > filters.endDate) return false;
    if (!matches(row.storeId, filters.branchId)) return false;
    if (!matches(row.paymentMethod, filters.paymentMethod)) return false;
    if (!matches(row.orderType, filters.orderType)) return false;
    if (!matches(row.cashierId, filters.cashierId)) return false;
    if (!matches(row.status, filters.status)) return false;
    return true;
  });

  const orderIds = new Set(salesRows.map((row) => String(row.id)));
  const lineRows = lineItems.filter((row) => {
    if (!orderIds.has(String(row.orderId))) return false;
    if (!matches(row.category, filters.categoryId)) return false;
    if (!matches(row.itemId, filters.productId)) return false;
    return true;
  });

  return { sales: salesRows, lineItems: lineRows };
}

export function getSalesSummary(rows) {
  const summary = rows.reduce(
    (acc, row) => ({
      gross: acc.gross + row.gross,
      discount: acc.discount + row.discount,
      refund: acc.refund + row.refund,
      net: acc.net + row.net,
      orders: acc.orders + (row.status === "Paid" ? 1 : 0),
      cash: acc.cash + (row.paymentMethod === "Cash" ? row.net : 0),
      gcash: acc.gcash + (row.paymentMethod === "GCash" || row.paymentMethod === "QRPH" ? row.net : 0),
      card: acc.card + (row.paymentMethod === "Card" ? row.net : 0),
      online: acc.online + (["GrabFood", "Foodpanda", "Online"].includes(row.paymentMethod) || row.source === "Web" ? row.net : 0),
    }),
    { gross: 0, discount: 0, refund: 0, net: 0, orders: 0, cash: 0, gcash: 0, card: 0, online: 0 }
  );
  return { ...summary, averageOrderValue: summary.orders ? summary.net / summary.orders : 0 };
}

export function getSalesTrend(rows, startDate, endDate) {
  const map = new Map(dateRange(startDate, endDate).map((date) => [date, { date, gross: 0, discount: 0, refund: 0, net: 0, orders: 0 }]));
  rows.forEach((row) => {
    const current = map.get(row.date) || { date: row.date, gross: 0, discount: 0, refund: 0, net: 0, orders: 0 };
    current.gross += row.gross;
    current.discount += row.discount;
    current.refund += row.refund;
    current.net += row.net;
    current.orders += 1;
    map.set(row.date, current);
  });
  return Array.from(map.values());
}

export function getHourlySales(rows) {
  const map = new Map(Array.from({ length: 24 }, (_, hour) => [hour, { hour: `${pad(hour)}:00`, net: 0, orders: 0 }]));
  rows.forEach((row) => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, hour: "numeric", hour12: false }).format(new Date(row.createdAt)));
    const current = map.get(hour) || { hour: `${pad(hour)}:00`, net: 0, orders: 0 };
    current.net += row.net;
    current.orders += 1;
    map.set(hour, current);
  });
  return Array.from(map.values());
}

export function getProductSalesReport(lineItems, totalNet = 0) {
  const map = new Map();
  lineItems.forEach((item) => {
    const key = item.itemId || item.itemName;
    const row = map.get(key) || {
      productId: key,
      productName: item.itemName,
      category: item.category,
      quantity: 0,
      gross: 0,
      discount: 0,
      net: 0,
    };
    row.quantity += item.quantity;
    row.gross += item.gross;
    row.discount += item.discount;
    row.net += item.net;
    map.set(key, row);
  });
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      averageSellingPrice: row.quantity ? row.net / row.quantity : 0,
      share: totalNet ? (row.net / totalNet) * 100 : 0,
    }))
    .sort((a, b) => b.net - a.net);
}

export function getCategorySalesReport(lineItems, totalNet = 0) {
  const orderSets = new Map();
  const map = new Map();
  lineItems.forEach((item) => {
    const key = item.category || "Uncategorized";
    const row = map.get(key) || { category: key, quantity: 0, gross: 0, net: 0, orderCount: 0 };
    row.quantity += item.quantity;
    row.gross += item.gross;
    row.net += item.net;
    map.set(key, row);
    if (!orderSets.has(key)) orderSets.set(key, new Set());
    orderSets.get(key).add(item.orderId);
  });
  return Array.from(map.values())
    .map((row) => ({ ...row, orderCount: orderSets.get(row.category)?.size || 0, share: totalNet ? (row.net / totalNet) * 100 : 0 }))
    .sort((a, b) => b.net - a.net);
}

export function getPaymentReport(rows, totalNet = 0) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.paymentMethod || "Other";
    const current = map.get(key) || { paymentMethod: key, transactions: 0, gross: 0, discounts: 0, refunds: 0, net: 0, refundTransactions: 0 };
    current.transactions += row.status === "Paid" ? 1 : 0;
    current.refundTransactions += row.status === "Refunded" || row.status === "Voided" ? 1 : 0;
    current.gross += row.gross;
    current.discounts += row.discount;
    current.refunds += row.refund;
    current.net += row.net;
    map.set(key, current);
  });
  return Array.from(map.values()).map((row) => ({ ...row, share: totalNet ? (row.net / totalNet) * 100 : 0 })).sort((a, b) => b.net - a.net);
}

export function getDiscountReport(rows) {
  const map = new Map();
  rows.filter((row) => row.discount > 0).forEach((row) => {
    const label = row.raw?.discount_type || row.raw?.voucher_code || row.raw?.applied_voucher_code || "Manual / POS Discount";
    const current = map.get(label) || { discountType: label, uses: 0, discountAmount: 0, beforeDiscount: 0, afterDiscount: 0 };
    current.uses += 1;
    current.discountAmount += row.discount;
    current.beforeDiscount += row.gross;
    current.afterDiscount += row.net;
    map.set(label, current);
  });
  return Array.from(map.values()).sort((a, b) => b.discountAmount - a.discountAmount);
}

export function getCashierReport(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.cashierId || row.cashierName;
    const current = map.get(key) || {
      cashierId: key,
      cashierName: row.cashierName,
      orders: 0,
      gross: 0,
      discounts: 0,
      refunds: 0,
      net: 0,
      payments: {},
    };
    current.orders += row.status === "Paid" ? 1 : 0;
    current.gross += row.gross;
    current.discounts += row.discount;
    current.refunds += row.refund;
    current.net += row.net;
    current.payments[row.paymentMethod] = (current.payments[row.paymentMethod] || 0) + row.net;
    map.set(key, current);
  });
  return Array.from(map.values())
    .map((row) => ({ ...row, averageOrderValue: row.orders ? row.net / row.orders : 0, paymentBreakdown: Object.entries(row.payments).map(([k, v]) => `${k}: ${peso(v)}`).join(" | ") }))
    .sort((a, b) => b.net - a.net);
}

export function getVoidRefundReport(rows) {
  return rows
    .filter((row) => row.status === "Voided" || row.status === "Refunded" || row.refund > 0)
    .map((row) => ({
      dateTime: displayDateTime(row.createdAt),
      orderNumber: row.orderNumber,
      originalAmount: row.gross,
      amount: row.refund || row.net,
      reason: row.raw?.void_reason || row.raw?.refund_reason || "No reason recorded",
      processedBy: row.cashierName,
      status: row.status,
      notes: row.raw?.notes || row.raw?.payment_review_note || "",
    }));
}

export function uniqueOptions(rows, valueField, labelField = valueField) {
  const map = new Map();
  rows.forEach((row) => {
    const value = row[valueField];
    if (!value || map.has(value)) return;
    map.set(value, row[labelField] || value);
  });
  return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => String(a.label).localeCompare(String(b.label)));
}
