"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  LayoutGrid,
  Store,
  UserRound,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dateFormat";
import { isCompletedStatus, loadReportData, normalizePayment } from "../reportData";

const DAY_MS = 24 * 60 * 60 * 1000;
const BRANCH_LABELS = {
  "bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e": "Pasong Tamo Branch",
  "e916bee8-3770-4650-9b46-d2e7d3ad49e6": "Diliman Branch",
};

const metricConfig = [
  { key: "gross", label: "Gross sales" },
  { key: "refunds", label: "Refunds" },
  { key: "discounts", label: "Discounts" },
  { key: "net", label: "Net sales" },
  { key: "grossProfit", label: "Gross profit" },
];

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortMoneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
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

function dateRange(start, end) {
  const total = Math.min(daysBetween(start, end), 120);
  return Array.from({ length: total }, (_, index) => addDays(start, index));
}

function previousRange(start, end) {
  const length = daysBetween(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(length - 1));
  return { start: previousStart, end: previousEnd };
}

function displayDate(value) {
  if (!value) return "No date";
  return formatDate(value, "No date");
}

function displayRange(start, end) {
  return `${displayDate(start)} - ${displayDate(end)}`;
}

function dayKey(value) {
  if (!value) return "No date";
  return inputDate(new Date(value));
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

function employeeInfo(row, source) {
  const id = firstText(row, ["cashier_id", "employee_id", "user_id", "created_by"]);
  const name = firstText(row, ["cashier_name", "cashier", "employee_name", "user_name", "staff_name"]);
  if (id || name) return { value: id || name, label: name || id };
  return { value: source === "Web" ? "WEB_CUSTOMER" : "UNASSIGNED", label: source === "Web" ? "Web orders" : "Unassigned" };
}

function timeBucket(createdAt) {
  const hour = new Date(createdAt || Date.now()).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18) return "evening";
  return "late";
}

function normalizeOrder(row, source) {
  const total = firstNumber(row, ["total", "net_sales", "net_total", "amount", "subtotal"], 0);
  const discounts = firstNumber(row, ["discount", "discounts", "discount_amount", "total_discount"], 0);
  const gross = firstNumber(row, ["gross_sales", "gross_total", "subtotal"], total + discounts);
  const refundFallback = isRefunded(row) ? total : 0;
  const refunds = firstNumber(row, ["refund", "refunds", "refund_amount", "refunded_amount", "refund_total"], refundFallback);
  const net = gross - discounts - refunds;
  const cost = firstNumber(row, ["cost_total", "total_cost", "cogs"], null);
  const store = storeInfo(row, source);
  const employee = employeeInfo(row, source);

  return {
    id: row?.id,
    source,
    createdAt: row?.created_at,
    date: dayKey(row?.created_at),
    storeValue: store.value,
    storeLabel: store.label,
    employeeValue: employee.value,
    employeeLabel: employee.label,
    payment: normalizePayment(row?.payment_method || row?.payment_type),
    status: row?.status || (source === "Web" ? "Completed" : "Closed"),
    timeBucket: timeBucket(row?.created_at),
    gross,
    refunds,
    discounts,
    net,
    grossProfit: cost === null ? net : net - cost,
  };
}

function normalizeData(data) {
  const posOrders = (data?.orders || []).map((order) => normalizeOrder(order, "POS"));
  const webOrders = (data?.webOrders || [])
    .filter((order) => isCompletedStatus(order.status))
    .map((order) => normalizeOrder(order, "Web"));
  return [...posOrders, ...webOrders].filter((order) => order.date !== "No date");
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

function summarize(rows) {
  return rows.reduce(
    (total, row) => ({
      gross: total.gross + row.gross,
      refunds: total.refunds + row.refunds,
      discounts: total.discounts + row.discounts,
      net: total.net + row.net,
      grossProfit: total.grossProfit + row.grossProfit,
      orders: total.orders + 1,
    }),
    { gross: 0, refunds: 0, discounts: 0, net: 0, grossProfit: 0, orders: 0 }
  );
}

function buildDailyRows(rows, start, end) {
  const map = new Map(
    dateRange(start, end).map((date) => [
      date,
      { date, gross: 0, refunds: 0, discounts: 0, net: 0, grossProfit: 0, orders: 0 },
    ])
  );

  rows.forEach((row) => {
    const current = map.get(row.date) || { date: row.date, gross: 0, refunds: 0, discounts: 0, net: 0, grossProfit: 0, orders: 0 };
    current.gross += row.gross;
    current.refunds += row.refunds;
    current.discounts += row.discounts;
    current.net += row.net;
    current.grossProfit += row.grossProfit;
    current.orders += 1;
    map.set(row.date, current);
  });

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function money(value) {
  return moneyFormatter.format(Number(value || 0));
}

function shortMoney(value) {
  return shortMoneyFormatter.format(Number(value || 0));
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function metricDelta(current, previous) {
  const diff = Number(current || 0) - Number(previous || 0);
  const pct = previous ? (diff / Math.abs(previous)) * 100 : current ? 100 : 0;
  return { diff, pct };
}

export default function Page() {
  const supabase = getSupabaseClient();
  const today = inputDate();
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [timeFilter, setTimeFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [activeMetric, setActiveMetric] = useState("gross");
  const [currentData, setCurrentData] = useState({ orders: [], webOrders: [] });
  const [previousData, setPreviousData] = useState({ orders: [], webOrders: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const comparisonRange = useMemo(() => previousRange(start, end), [start, end]);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setLoading(true);
      const [current, previous] = await Promise.all([
        loadReportData(supabase, { start, end }),
        loadReportData(supabase, { start: comparisonRange.start, end: comparisonRange.end }),
      ]);

      if (!active) return;

      const reportError = current.error || previous.error;
      if (reportError) {
        setError(reportError.message);
        setCurrentData({ orders: [], webOrders: [] });
        setPreviousData({ orders: [], webOrders: [] });
        setLoading(false);
        return;
      }

      setError("");
      setCurrentData(current);
      setPreviousData(previous);
      setLoading(false);
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [comparisonRange.end, comparisonRange.start, end, start, supabase]);

  const allCurrentOrders = useMemo(() => normalizeData(currentData), [currentData]);
  const allPreviousOrders = useMemo(() => normalizeData(previousData), [previousData]);
  const storeOptions = useMemo(() => uniqueOptions(allCurrentOrders, "storeValue", "storeLabel"), [allCurrentOrders]);
  const employeeOptions = useMemo(() => uniqueOptions(allCurrentOrders, "employeeValue", "employeeLabel"), [allCurrentOrders]);

  const filteredCurrentOrders = useMemo(
    () =>
      allCurrentOrders.filter((order) => {
        if (timeFilter !== "all" && order.timeBucket !== timeFilter) return false;
        if (storeFilter !== "all" && order.storeValue !== storeFilter) return false;
        if (employeeFilter !== "all" && order.employeeValue !== employeeFilter) return false;
        return true;
      }),
    [allCurrentOrders, employeeFilter, storeFilter, timeFilter]
  );

  const filteredPreviousOrders = useMemo(
    () =>
      allPreviousOrders.filter((order) => {
        if (timeFilter !== "all" && order.timeBucket !== timeFilter) return false;
        if (storeFilter !== "all" && order.storeValue !== storeFilter) return false;
        if (employeeFilter !== "all" && order.employeeValue !== employeeFilter) return false;
        return true;
      }),
    [allPreviousOrders, employeeFilter, storeFilter, timeFilter]
  );

  const totals = useMemo(() => summarize(filteredCurrentOrders), [filteredCurrentOrders]);
  const previousTotals = useMemo(() => summarize(filteredPreviousOrders), [filteredPreviousOrders]);
  const dailyRows = useMemo(() => buildDailyRows(filteredCurrentOrders, start, end), [end, filteredCurrentOrders, start]);
  const activeMetricLabel = metricConfig.find((item) => item.key === activeMetric)?.label || "Sales";
  const chartRows = dailyRows.map((row) => ({
    ...row,
    label: formatDate(row.date),
    chartValue: row[activeMetric],
  }));
  const exportRows = [...dailyRows].sort((a, b) => b.date.localeCompare(a.date));

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
      ["Date", "Orders", "Gross sales", "Refunds", "Discounts", "Net sales", "Gross profit"],
      ...exportRows.map((row) => [
        displayDate(row.date),
        row.orders,
        row.gross.toFixed(2),
        row.refunds.toFixed(2),
        row.discounts.toFixed(2),
        row.net.toFixed(2),
        row.grossProfit.toFixed(2),
      ]),
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-summary-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-rose-50/30">
      <div className="border-b border-rose-100 bg-white px-4 py-4 shadow-sm sm:px-6">
        <h1 className="text-xl font-bold text-rose-950">Sales summary</h1>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-col rounded-lg border border-rose-100 bg-white shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => moveRange(-1)}
              className="flex h-10 items-center justify-center border-b border-rose-100 px-3 text-slate-500 hover:bg-rose-50 sm:border-b-0 sm:border-r"
              aria-label="Previous date range"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={17} className="text-rose-500" />
                <span className="whitespace-nowrap">{displayRange(start, end)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={start}
                  onChange={(event) => updateStart(event.target.value)}
                  className="h-9 rounded-md border border-rose-100 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-400"
                  aria-label="Start date"
                />
                <input
                  type="date"
                  value={end}
                  onChange={(event) => updateEnd(event.target.value)}
                  className="h-9 rounded-md border border-rose-100 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-400"
                  aria-label="End date"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => moveRange(1)}
              className="flex h-10 items-center justify-center border-t border-rose-100 px-3 text-slate-500 hover:bg-rose-50 sm:border-l sm:border-t-0"
              aria-label="Next date range"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <label className="relative block min-w-[150px]">
            <Clock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400"
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
            <select
              value={storeFilter}
              onChange={(event) => setStoreFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400"
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
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-rose-100 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-rose-400"
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
            Reports Failed: {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-rose-100 bg-white shadow-sm">
          <div className="grid grid-cols-1 divide-y divide-rose-100 md:grid-cols-5 md:divide-x md:divide-y-0">
            {metricConfig.map((metric) => {
              const delta = metricDelta(totals[metric.key], previousTotals[metric.key]);
              const isActive = activeMetric === metric.key;
              const isPositive = delta.diff >= 0;
              return (
                <button
                  type="button"
                  key={metric.key}
                  onClick={() => setActiveMetric(metric.key)}
                  className={`relative p-4 text-left transition hover:bg-rose-50/70 ${isActive ? "bg-rose-50" : "bg-white"}`}
                >
                  <span className="block text-sm font-semibold text-slate-700">{metric.label}</span>
                  <span className="mt-2 block text-2xl font-bold tracking-normal text-slate-950">{money(totals[metric.key])}</span>
                  <span className={`mt-1 block text-xs font-semibold ${isPositive ? "text-teal-600" : "text-rose-600"}`}>
                    {isPositive ? "+" : ""}
                    {money(delta.diff)} ({isPositive ? "+" : ""}
                    {delta.pct.toFixed(2)}%)
                  </span>
                  {isActive ? <span className="absolute inset-x-0 bottom-0 h-1 bg-rose-500" /> : null}
                </button>
              );
            })}
          </div>

          <div className="border-t border-rose-100 p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">{activeMetricLabel}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {totals.orders} orders from {displayRange(start, end)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:w-[280px]">
                <label className="text-xs font-semibold text-slate-500">
                  Chart
                  <select className="mt-1 h-9 w-full rounded-md border border-rose-100 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-rose-400">
                    <option>Area</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Group
                  <select className="mt-1 h-9 w-full rounded-md border border-rose-100 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-rose-400">
                    <option>Days</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 10, right: 12, left: 8, bottom: 18 }}>
                  <defs>
                    <linearGradient id="salesSummaryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb7185" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1d6dc" vertical={false} />
                  <XAxis
                    dataKey="label"
                    angle={-45}
                    textAnchor="end"
                    height={56}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={82}
                    tickFormatter={shortMoney}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: "#e11d48", strokeDasharray: "4 4" }}
                    formatter={(value) => [money(value), activeMetricLabel]}
                    labelFormatter={(_, payload) => displayDate(payload?.[0]?.payload?.date)}
                    contentStyle={{
                      border: "1px solid #fecdd3",
                      borderRadius: 8,
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="chartValue"
                    stroke="#e11d48"
                    strokeWidth={2}
                    fill="url(#salesSummaryFill)"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#be123c", fill: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-rose-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-100 px-4 py-4 sm:px-6">
            <h2 className="text-sm font-bold uppercase tracking-normal text-slate-950">Export</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCSV}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-rose-700"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                type="button"
                className="hidden h-9 w-9 items-center justify-center rounded-md border border-rose-100 text-slate-500 sm:inline-flex"
                aria-label="Table view"
              >
                <LayoutGrid size={17} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-rose-100 bg-rose-50/60 text-left text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-4 py-4 text-right">Orders</th>
                  <th className="px-4 py-4 text-right">Gross sales</th>
                  <th className="px-4 py-4 text-right">Refunds</th>
                  <th className="px-4 py-4 text-right">Discounts</th>
                  <th className="px-4 py-4 text-right">Net sales</th>
                  <th className="px-6 py-4 text-right">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                      Loading sales summary...
                    </td>
                  </tr>
                ) : exportRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                      No sales found.
                    </td>
                  </tr>
                ) : (
                  exportRows.map((row) => (
                    <tr key={row.date} className="border-b border-rose-50 last:border-0 hover:bg-rose-50/50">
                      <td className="px-6 py-4 font-semibold text-slate-900">{displayDate(row.date)}</td>
                      <td className="px-4 py-4 text-right text-slate-600">{row.orders}</td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-900">{money(row.gross)}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{money(row.refunds)}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{money(row.discounts)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-900">{money(row.net)}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-950">{money(row.grossProfit)}</td>
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
