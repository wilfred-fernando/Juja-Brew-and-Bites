"use client";

import { formatDate, formatDateTime } from "@/lib/dateFormat";

export const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dateInput = (date = new Date()) => date.toISOString().slice(0, 10);

export function dateLabel(value) {
  if (!value) return "No date";
  return formatDateTime(value, "No date");
}

export function dayKey(value) {
  if (!value) return "No date";
  return formatDate(value, "No date");
}

export function normalizePayment(value) {
  const text = String(value || "").trim();
  return text || "Unspecified";
}

export function isCompletedStatus(value) {
  return ["completed", "complete", "delivered", "closed", "paid"].includes(String(value || "").toLowerCase());
}

function inDateRange(value, start, end) {
  if (!value) return true;
  const date = new Date(value).getTime();
  const from = start ? new Date(`${start}T00:00:00`).getTime() : -Infinity;
  const to = end ? new Date(`${end}T23:59:59`).getTime() : Infinity;
  return date >= from && date <= to;
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

export function itemName(item) {
  return item?.name || item?.item_name || item?.title || "Item";
}

export function itemQty(item) {
  return Number(item?.quantity ?? item?.qty ?? 1) || 1;
}

export function itemTotal(item) {
  const qty = itemQty(item);
  return Number(item?.line_total ?? item?.total ?? item?.subtotal ?? Number(item?.price || item?.unit_price || 0) * qty) || 0;
}

export async function loadReportData(supabase, { start, end } = {}) {
  const [ordersRes, itemsRes, menuRes, webRes, shiftRes] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("order_items").select("*"),
    supabase.from("menu_items").select("id,name,category,price"),
    supabase.from("web_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("cashier_pos").select("*").order("created_at", { ascending: false }),
  ]);

  const errors = [ordersRes.error, itemsRes.error, menuRes.error, webRes.error, shiftRes.error].filter(Boolean);
  if (errors.length) return { error: errors[0], orders: [], orderItems: [], menuItems: [], webOrders: [], shifts: [] };

  const orders = (ordersRes.data || []).filter((row) => inDateRange(row.created_at, start, end));
  const orderIds = new Set(orders.map((row) => row.id));
  const orderItems = (itemsRes.data || []).filter((row) => !row.order_id || orderIds.has(row.order_id));
  const menuItems = menuRes.data || [];
  const webOrders = (webRes.data || [])
    .filter((row) => isCompletedStatus(row.status))
    .filter((row) => inDateRange(row.created_at, start, end));
  const shifts = (shiftRes.data || []).filter((row) => inDateRange(row.created_at, start, end));

  return { orders, orderItems, menuItems, webOrders, shifts, error: null };
}

export function buildReceiptRows({ orders, webOrders }) {
  const posRows = (orders || []).map((order) => ({
    id: order.id,
    source: "POS",
    date: order.created_at,
    customer: order.customer_name || order.customer || "Walk-in",
    payment: normalizePayment(order.payment_method),
    discount: Number(order.discount || 0),
    total: Number(order.total || 0),
    status: order.status || "Closed",
  }));

  const webRows = (webOrders || []).map((order) => ({
    id: order.id,
    source: "Web",
    date: order.created_at,
    customer: order.customer_name || order.customer || "Customer",
    payment: normalizePayment(order.payment_method),
    discount: Number(order.discount || 0),
    total: Number(order.total || order.subtotal || 0),
    status: order.status || "Completed",
  }));

  return [...posRows, ...webRows].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function buildItemRows({ orderItems, webOrders }) {
  const map = new Map();
  const add = (name, qty, total) => {
    const key = name || "Item";
    const row = map.get(key) || { name: key, qty: 0, sales: 0 };
    row.qty += Number(qty || 0);
    row.sales += Number(total || 0);
    map.set(key, row);
  };

  (orderItems || []).forEach((item) => add(item.name || item.item_name, item.quantity, item.line_total || item.total));
  (webOrders || []).forEach((order) => getWebItems(order).forEach((item) => add(itemName(item), itemQty(item), itemTotal(item))));

  return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
}

export function buildCategoryRows({ orderItems, menuItems, webOrders }) {
  const menuById = new Map((menuItems || []).map((item) => [String(item.id), item]));
  const map = new Map();
  const add = (category, total) => {
    const key = category || "Uncategorized";
    map.set(key, Number(map.get(key) || 0) + Number(total || 0));
  };

  (orderItems || []).forEach((item) => {
    const menu = menuById.get(String(item.menu_item_id || item.item_id || ""));
    add(menu?.category || item.category, item.line_total || item.total);
  });

  (webOrders || []).forEach((order) => {
    getWebItems(order).forEach((item) => {
      const menu = menuById.get(String(item.id || item.menu_item_id || ""));
      add(item.category || menu?.category || "Web Orders", itemTotal(item));
    });
  });

  return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}
