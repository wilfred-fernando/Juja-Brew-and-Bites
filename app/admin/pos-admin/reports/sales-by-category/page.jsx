"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  LayoutGrid,
  Store,
  UserRound,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isCompletedStatus, loadReportData } from "../reportData";

const DAY_MS = 24 * 60 * 60 * 1000;
const BRANCH_LABELS = {
  "bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e": "Juja BnB - Pasong Tamo",
  "e916bee8-3770-4650-9b46-d2e7d3ad49e6": "Juja BnB - Diliman",
};

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
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
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function displayRange(start, end) {
  return `${displayDate(start)} - ${displayDate(end)}`;
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

function timeBucket(createdAt) {
  const hour = new Date(createdAt || Date.now()).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18) return "evening";
  return "late";
}

function itemQty(item) {
  return Number(item?.quantity ?? item?.qty ?? 1) || 1;
}

function normalizeLine(item, order, source, menuById, profileNames) {
  const menuId = firstText(item, ["menu_item_id", "item_id", "id", "menuId"]);
  const menu = menuById.get(String(menuId)) || {};
  const qty = itemQty(item);
  const unitPrice = firstNumber(item, ["unit_price", "unitPrice", "price"], Number(menu.price || 0));
  const netSales = firstNumber(item, ["line_total", "net_sales", "total", "subtotal"], unitPrice * qty);
  const costPerItem = firstNumber(item, ["unit_cost", "cost", "cost_of_goods", "cogs"], 0);
  const costOfGoods = firstNumber(item, ["cost_total", "total_cost"], costPerItem * qty);
  const category = firstText(item, ["category", "category_name"]) || menu.category || "Uncategorized";
  const store = storeInfo(order || item, source);
  const employee = employeeInfo(order || item, source, profileNames);
  const createdAt = order?.created_at || item?.created_at;

  return {
    category,
    qty,
    netSales,
    costOfGoods,
    grossProfit: netSales - costOfGoods,
    createdAt,
    storeValue: store.value,
    storeLabel: store.label,
    employeeValue: employee.value,
    employeeLabel: employee.label,
    timeBucket: timeBucket(createdAt),
  };
}

function buildItemLines(data, profileNames = {}) {
  const menuById = new Map((data?.menuItems || []).map((item) => [String(item.id), item]));
  const orderById = new Map((data?.orders || []).map((order) => [String(order.id), order]));
  const orderItemOrderIds = new Set((data?.orderItems || []).map((item) => String(item.order_id || "")).filter(Boolean));

  const posLines = (data?.orderItems || [])
    .map((item) => normalizeLine(item, orderById.get(String(item.order_id || "")), "POS", menuById, profileNames))
    .filter((line) => line.createdAt);

  const fallbackPosLines = (data?.orders || [])
    .filter((order) => !orderItemOrderIds.has(String(order.id)))
    .flatMap((order) => parseItems(order.items).map((item) => normalizeLine(item, order, "POS", menuById, profileNames)))
    .filter((line) => line.createdAt);

  const webLines = (data?.webOrders || [])
    .filter((order) => isCompletedStatus(order.status))
    .flatMap((order) => parseItems(order.items).map((item) => normalizeLine(item, order, "Web", menuById, profileNames)))
    .filter((line) => line.createdAt);

  return [...posLines, ...fallbackPosLines, ...webLines];
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

function aggregateCategories(lines) {
  const map = new Map();
  lines.forEach((line) => {
    const key = line.category || "Uncategorized";
    const row = map.get(key) || { category: key, qty: 0, netSales: 0, costOfGoods: 0, grossProfit: 0 };
    row.qty += line.qty;
    row.netSales += line.netSales;
    row.costOfGoods += line.costOfGoods;
    row.grossProfit += line.grossProfit;
    map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export default function Page() {
  const supabase = getSupabaseClient();
  const today = inputDate();
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [timeFilter, setTimeFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [lines, setLines] = useState([]);
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
        setLines([]);
        setLoading(false);
        return;
      }

      const profileNames = await loadProfileNames(supabase, collectEmployeeIds(data));
      if (!active) return;

      setError("");
      setLines(buildItemLines(data, profileNames));
      setLoading(false);
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [end, start, supabase]);

  const storeOptions = useMemo(() => uniqueOptions(lines, "storeValue", "storeLabel"), [lines]);
  const employeeOptions = useMemo(() => uniqueOptions(lines, "employeeValue", "employeeLabel"), [lines]);
  const filteredLines = useMemo(
    () =>
      lines.filter((line) => {
        if (timeFilter !== "all" && line.timeBucket !== timeFilter) return false;
        if (storeFilter !== "all" && line.storeValue !== storeFilter) return false;
        if (employeeFilter !== "all" && line.employeeValue !== employeeFilter) return false;
        return true;
      }),
    [employeeFilter, lines, storeFilter, timeFilter]
  );
  const rows = useMemo(() => aggregateCategories(filteredLines), [filteredLines]);

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
      ["Category", "Items sold", "Net sales", "Cost of goods", "Gross profit"],
      ...rows.map((row) => [row.category, row.qty, row.netSales.toFixed(2), row.costOfGoods.toFixed(2), row.grossProfit.toFixed(2)]),
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-by-category-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-rose-50/30">
      <div className="border-b border-rose-200 bg-rose-600 px-4 py-3 shadow-sm sm:px-6">
        <h1 className="text-lg font-bold text-white">Sales by category</h1>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-col rounded-lg border border-rose-100 bg-white shadow-sm sm:flex-row sm:items-center">
            <button type="button" onClick={() => moveRange(-1)} className="flex h-10 items-center justify-center border-b border-rose-100 px-3 text-slate-500 hover:bg-rose-50 sm:border-b-0 sm:border-r" aria-label="Previous date range">
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={17} className="text-rose-500" />
                <span className="whitespace-nowrap">{displayRange(start, end)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={start} onChange={(event) => updateStart(event.target.value)} className="h-9 rounded-md border border-rose-100 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-400" aria-label="Start date" />
                <input type="date" value={end} onChange={(event) => updateEnd(event.target.value)} className="h-9 rounded-md border border-rose-100 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-400" aria-label="End date" />
              </div>
            </div>
            <button type="button" onClick={() => moveRange(1)} className="flex h-10 items-center justify-center border-t border-rose-100 px-3 text-slate-500 hover:bg-rose-50 sm:border-l sm:border-t-0" aria-label="Next date range">
              <ChevronRight size={18} />
            </button>
          </div>

          <label className="relative block min-w-[150px]">
            <Clock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400" aria-label="Time filter">
              <option value="all">All day</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="late">Late night</option>
            </select>
          </label>

          <label className="relative block min-w-[170px]">
            <Store size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400" aria-label="Store filter">
              <option value="all">All stores</option>
              {storeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="relative block min-w-[190px]">
            <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400" aria-label="Employee filter">
              <option value="all">All employees</option>
              {employeeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">Reports Failed: {error}</div> : null}

        <section className="overflow-hidden rounded-lg border border-rose-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-100 px-4 py-4 sm:px-6">
            <button type="button" onClick={exportCSV} className="inline-flex h-9 items-center gap-2 rounded-md px-1 text-sm font-bold uppercase tracking-normal text-slate-800 hover:text-rose-700">
              Export
              <ChevronDown size={15} />
              <Download size={16} className="text-rose-500" />
            </button>
            <button type="button" className="hidden h-9 w-9 items-center justify-center rounded-md border border-rose-100 text-slate-500 sm:inline-flex" aria-label="Table view">
              <LayoutGrid size={17} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-rose-100 bg-rose-50/60 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-4">Category</th>
                  <th className="px-4 py-4 text-right">Items sold</th>
                  <th className="px-4 py-4 text-right">Net sales</th>
                  <th className="px-4 py-4 text-right">Cost of goods</th>
                  <th className="px-5 py-4 text-right">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">Loading category sales...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">No category sales found.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.category} className="border-b border-rose-50 last:border-0 hover:bg-rose-50/50">
                      <td className="px-5 py-4 font-semibold text-slate-900">{row.category}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{row.qty}</td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-950">{money(row.netSales)}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{money(row.costOfGoods)}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-950">{money(row.grossProfit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
