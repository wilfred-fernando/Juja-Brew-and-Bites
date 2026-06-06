"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  MoreHorizontal,
  ReceiptText,
  RotateCcw,
  Search,
  Store,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { isCompletedStatus, loadReportData, normalizePayment } from "../reportData";

const DAY_MS = 24 * 60 * 60 * 1000;
const BRANCH_LABELS = {
  "bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e": "Juja BnB - Pasong Tamo",
  "e916bee8-3770-4650-9b46-d2e7d3ad49e6": "Juja BnB - Diliman",
};

const summaryCards = [
  { key: "all", label: "All receipts", icon: ReceiptText, accent: "rose" },
  { key: "sale", label: "Sales", icon: WalletCards, accent: "teal" },
  { key: "refund", label: "Refunds", icon: RotateCcw, accent: "pink" },
];

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function inputDate(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return inputDate(date);
}

function daysBetween(start, end) {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.round((to - from) / DAY_MS) + 1);
}

function displayDate(value) {
  if (!value) return "No date";
  return formatDate(value, "No date");
}

function displayRange(start, end) {
  return `${displayDate(start)} - ${displayDate(end)}`;
}

function displayDateTime(value) {
  if (!value) return "No date";
  return formatDateTime(value, "No date");
}

function money(value) {
  return moneyFormatter.format(Number(value || 0));
}

function firstText(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function firstNumber(row, fields, fallback = 0) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && value !== "") {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return fallback;
}

function receiptNumber(row, source) {
  const explicit = firstText(row, ["receipt_number", "receipt_no", "receipt", "order_number", "reference_no"]);
  if (explicit) return explicit;
  const id = String(row?.id || "");
  if (!id) return source === "Web" ? "WEB" : "POS";
  return source === "Web" ? `WEB-${id.slice(0, 8).toUpperCase()}` : id.slice(0, 12);
}

function isRefunded(row) {
  const status = `${row?.status || ""} ${row?.refund_status || ""} ${row?.payment_status || ""}`.toLowerCase();
  return Boolean(row?.refunded || row?.is_refunded || status.includes("refund"));
}

function storeInfo(row, source) {
  const id = firstText(row, ["store_id", "branch_id", "store", "branch"]);
  const name = firstText(row, ["store_name", "branch_name", "location_name"]);
  const value = id || name || (source === "Web" ? "WEB" : "MAIN");
  return {
    value,
    label: BRANCH_LABELS[value] || name || (source === "Web" && value === "WEB" ? "Web orders" : value),
  };
}

function employeeId(row, source) {
  const fields = source === "Web" ? ["cashier_id", "employee_id", "created_by"] : ["cashier_id", "employee_id", "created_by", "user_id"];
  return firstText(row, fields);
}

function collectEmployeeIds(data) {
  const ids = new Set();
  (data?.orders || []).forEach((row) => {
    const id = employeeId(row, "POS");
    if (id) ids.add(id);
  });
  (data?.webOrders || []).forEach((row) => {
    const id = employeeId(row, "Web");
    if (id) ids.add(id);
  });
  return Array.from(ids);
}

async function loadProfileNames(supabase, ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) return {};
  return Object.fromEntries((data || []).map((profile) => [String(profile.id), profile.full_name || ""]));
}

function employeeInfo(row, source, profileNames = {}) {
  const id = employeeId(row, source);
  const name = firstText(row, ["cashier_name", "cashier", "employee_name", "user_name", "staff_name"]);
  const profileName = id ? profileNames[String(id)] : "";
  if (id || name) return { value: id || name, label: profileName || name || id };
  return { value: source === "Web" ? "WEB_ORDER" : "UNASSIGNED", label: source === "Web" ? "Online" : "Unassigned" };
}

function customerInfo(row, source) {
  const name = firstText(row, ["customer_name", "customer", "name", "guest_name"]);
  const phone = firstText(row, ["customer_phone", "phone", "mobile", "contact_number"]);
  if (!name && !phone) return source === "Web" ? "Customer" : "-";
  return [name, phone].filter(Boolean).join("\n");
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
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

function itemUnitPrice(item) {
  const qty = itemQty(item);
  const total = Number(item?.line_total ?? item?.total ?? item?.subtotal ?? 0);
  const unit = Number(item?.unit_price ?? item?.unitPrice ?? item?.price ?? 0);
  return unit || (qty ? total / qty : 0);
}

function itemLineTotal(item) {
  const qty = itemQty(item);
  return Number(item?.line_total ?? item?.total ?? item?.subtotal ?? itemUnitPrice(item) * qty) || 0;
}

function receiptItems(order, source, orderItemRows = []) {
  const items = source === "POS" && orderItemRows.length ? orderItemRows : parseItems(order?.items);
  return items.map((item, index) => ({
    id: `${order?.id || source}-${item?.id || item?.name || index}`,
    name: firstText(item, ["name", "item_name", "title"]) || "Item",
    qty: itemQty(item),
    unitPrice: itemUnitPrice(item),
    total: itemLineTotal(item),
  }));
}

function timeBucket(createdAt) {
  const hour = new Date(createdAt || Date.now()).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18) return "evening";
  return "late";
}

function normalizeReceipt(row, source, profileNames = {}, orderItemRows = []) {
  const refunded = isRefunded(row);
  const total = firstNumber(row, ["total", "net_sales", "net_total", "amount", "subtotal"], 0);
  const refundTotal = firstNumber(row, ["refund", "refunds", "refund_amount", "refunded_amount", "refund_total"], total);
  const store = storeInfo(row, source);
  const employee = employeeInfo(row, source, profileNames);
  const customer = customerInfo(row, source);

  return {
    id: `${source}-${row?.id || receiptNumber(row, source)}`,
    receiptNo: receiptNumber(row, source),
    source,
    createdAt: row?.created_at,
    storeValue: store.value,
    storeLabel: store.label,
    employeeValue: employee.value,
    employeeLabel: employee.label,
    customer,
    detailItems: receiptItems(row, source, orderItemRows),
    discount: firstNumber(row, ["discount", "discounts", "discount_amount", "total_discount"], 0),
    orderLabel: firstText(row, ["dining_option", "order_type", "ticket_name", "fulfillment_type"]) || source,
    payment: normalizePayment(row?.payment_method || row?.payment_type),
    status: row?.status || (source === "Web" ? "Completed" : "Closed"),
    type: refunded ? "Refund" : "Sale",
    typeKey: refunded ? "refund" : "sale",
    timeBucket: timeBucket(row?.created_at),
    total: refunded ? Math.abs(refundTotal) : total,
  };
}

function normalizeData(data, profileNames = {}) {
  const itemsByOrderId = new Map();
  (data?.orderItems || []).forEach((item) => {
    const key = String(item.order_id || "");
    if (!key) return;
    itemsByOrderId.set(key, [...(itemsByOrderId.get(key) || []), item]);
  });

  const posRows = (data?.orders || []).map((order) => normalizeReceipt(order, "POS", profileNames, itemsByOrderId.get(String(order.id)) || []));
  const webRows = (data?.webOrders || [])
    .filter((order) => isCompletedStatus(order.status))
    .map((order) => normalizeReceipt(order, "Web", profileNames));
  return [...posRows, ...webRows]
    .filter((row) => row.createdAt)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function uniqueOptions(rows, valueField, labelField) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row[valueField]) return;
    if (!map.has(row[valueField])) map.set(row[valueField], row[labelField] || row[valueField]);
  });
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function compareReceiptNumber(a, b) {
  return String(a?.receiptNo || "").localeCompare(String(b?.receiptNo || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function cardStyles(accent, active) {
  const colors = {
    rose: active ? "border-sky-200 bg-sky-50 text-slate-700" : "border-slate-200 bg-white text-slate-600",
    teal: active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-teal-600",
    pink: active ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-sky-600",
  };
  return colors[accent] || colors.rose;
}

export default function Page() {
  const supabase = getSupabaseClient();
  const today = inputDate();
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [timeFilter, setTimeFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setLoading(true);
      const data = await loadReportData(supabase, { start, end });
      if (!active) return;

      if (data.error) {
        setError(data.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const profileNames = await loadProfileNames(supabase, collectEmployeeIds(data));
      if (!active) return;

      setError("");
      setRows(normalizeData(data, profileNames));
      setLoading(false);
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [end, start, supabase]);

  const storeOptions = useMemo(() => uniqueOptions(rows, "storeValue", "storeLabel"), [rows]);
  const employeeOptions = useMemo(() => uniqueOptions(rows, "employeeValue", "employeeLabel"), [rows]);

  const filteredBeforeType = useMemo(
    () =>
      rows.filter((row) => {
        if (timeFilter !== "all" && row.timeBucket !== timeFilter) return false;
        if (storeFilter !== "all" && row.storeValue !== storeFilter) return false;
        if (employeeFilter !== "all" && row.employeeValue !== employeeFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [row.receiptNo, row.storeLabel, row.employeeLabel, row.customer, row.type, row.payment, row.status]
          .join(" ")
          .toLowerCase()
          .includes(q);
      }),
    [employeeFilter, rows, search, storeFilter, timeFilter]
  );

  const counts = useMemo(
    () => ({
      all: filteredBeforeType.length,
      sale: filteredBeforeType.filter((row) => row.typeKey === "sale").length,
      refund: filteredBeforeType.filter((row) => row.typeKey === "refund").length,
    }),
    [filteredBeforeType]
  );

  const visibleRows = useMemo(
    () => filteredBeforeType.filter((row) => typeFilter === "all" || row.typeKey === typeFilter).sort(compareReceiptNumber),
    [filteredBeforeType, typeFilter]
  );

  function moveRange(direction) {
    const length = daysBetween(start, end);
    setStart((value) => addDays(value, direction * length));
    setEnd((value) => addDays(value, direction * length));
  }

  function updateStart(value) {
    setStart(value);
    if (value > end) setEnd(value);
  }

  function updateEnd(value) {
    setEnd(value);
    if (value < start) setStart(value);
  }

  function exportCSV() {
    const csvRows = [
      ["Receipt no.", "Date", "Store", "Employee", "Customer", "Type", "Payment", "Status", "Total"],
      ...visibleRows.map((row) => [
        row.receiptNo,
        displayDateTime(row.createdAt),
        row.storeLabel,
        row.employeeLabel,
        row.customer.replaceAll("\n", " "),
        row.type,
        row.payment,
        row.status,
        row.total.toFixed(2),
      ]),
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipts-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-sky-50/30">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => moveRange(-1)}
              className="flex h-10 items-center justify-center border-b border-slate-200 px-3 text-slate-500 hover:bg-sky-50 sm:border-b-0 sm:border-r"
              aria-label="Previous date range"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={17} className="text-sky-500" />
                <span className="whitespace-nowrap">{displayRange(start, end)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={start}
                  onChange={(event) => updateStart(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
                  aria-label="Start date"
                />
                <input
                  type="date"
                  value={end}
                  onChange={(event) => updateEnd(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
                  aria-label="End date"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => moveRange(1)}
              className="flex h-10 items-center justify-center border-t border-slate-200 px-3 text-slate-500 hover:bg-sky-50 sm:border-l sm:border-t-0"
              aria-label="Next date range"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <label className="relative block min-w-[150px]">
            <Clock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-sky-500"
              aria-label="Time filter"
            >
              <option value="all">All day</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="late">Late night</option>
            </select>
          </label>

          <label className="relative block min-w-[170px]">
            <Store size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={storeFilter}
              onChange={(event) => setStoreFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-sky-500"
              aria-label="Store filter"
            >
              <option value="all">All stores</option>
              {storeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="relative block min-w-[190px]">
            <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-sky-500"
              aria-label="Employee filter"
            >
              <option value="all">All employees</option>
              {employeeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
            Receipts Failed: {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const active = typeFilter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setTypeFilter(card.key)}
                className={`relative flex min-h-[92px] items-center justify-center gap-4 border-b p-5 text-left transition last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${cardStyles(card.accent, active)}`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-current/10">
                  <Icon size={26} strokeWidth={2.4} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">{card.label}</span>
                  <span className="block text-3xl font-semibold tracking-normal text-slate-950">{counts[card.key]}</span>
                </span>
                {active ? <span className="absolute inset-x-0 bottom-0 h-1 bg-sky-500" /> : null}
              </button>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={exportCSV}
              className="inline-flex h-9 items-center gap-2 self-start rounded-md px-1 text-sm font-bold uppercase tracking-normal text-slate-800 hover:text-slate-700"
            >
              Export
              <ChevronDown size={15} />
              <Download size={16} className="text-sky-500" />
            </button>

            <label className="relative block w-full sm:w-[280px]">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search receipts"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-sky-500"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-200 bg-sky-50/60 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-4">Receipt no.</th>
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Store</th>
                  <th className="px-4 py-4">Employee</th>
                  <th className="px-4 py-4">Customer</th>
                  <th className="px-4 py-4">Type</th>
                  <th className="px-5 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                      Loading receipts...
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                      No receipts found.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedReceipt(row)}
                      className="cursor-pointer border-b border-sky-50 last:border-0 hover:bg-sky-50/50"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-900">{row.receiptNo}</td>
                      <td className="px-4 py-4 text-slate-700">{displayDateTime(row.createdAt)}</td>
                      <td className="px-4 py-4 text-slate-700">{row.storeLabel}</td>
                      <td className="px-4 py-4 text-slate-700">{row.employeeLabel}</td>
                      <td className="whitespace-pre-line px-4 py-4 text-slate-700">{row.customer}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${row.typeKey === "refund" ? "text-sky-700" : "text-slate-800"}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-950">{money(row.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedReceipt ? (
        <div className="fixed inset-0 z-50 bg-slate-950/20" onClick={() => setSelectedReceipt(null)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:w-[380px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-slate-700"
                aria-label="Close receipt details"
              >
                <X size={19} />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-slate-700"
                aria-label="Receipt actions"
              >
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-slate-200 px-5 py-6 text-center">
                <div className="text-3xl font-semibold tracking-normal text-slate-950">{money(selectedReceipt.total)}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Total</div>
              </div>

              <div className="space-y-1 border-b border-slate-200 px-5 py-4 text-xs font-semibold text-slate-700">
                <p>Order: {selectedReceipt.receiptNo}</p>
                <p>Employee: {selectedReceipt.employeeLabel}</p>
                <p>POS: {selectedReceipt.storeLabel}</p>
              </div>

              <div className="border-b border-slate-200 px-5 py-3 text-sm font-bold uppercase text-slate-950">
                {selectedReceipt.orderLabel || selectedReceipt.source}
              </div>

              <div className="divide-y divide-sky-50 border-b border-slate-200">
                {selectedReceipt.detailItems?.length ? (
                  selectedReceipt.detailItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {item.qty} x {money(item.unitPrice)}
                        </p>
                      </div>
                      <div className="font-semibold text-slate-950">{money(item.total)}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No item details found.</div>
                )}
              </div>

              <div className="space-y-3 border-b border-slate-200 px-5 py-4 text-sm">
                {selectedReceipt.discount > 0 ? (
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Discount</span>
                    <span>-{money(selectedReceipt.discount)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between font-bold text-slate-950">
                  <span>Total</span>
                  <span>{money(selectedReceipt.total)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>{selectedReceipt.payment}</span>
                  <span>{money(selectedReceipt.total)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-4 text-xs font-semibold text-slate-500">
                <span>{displayDateTime(selectedReceipt.createdAt)}</span>
                <span>No. {selectedReceipt.receiptNo}</span>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
