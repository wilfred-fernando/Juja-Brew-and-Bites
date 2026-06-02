"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Store,
  UserRound,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isCompletedStatus, loadReportData, normalizePayment } from "../reportData";

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

const numberFormatter = new Intl.NumberFormat("en-US");

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

function timeBucket(createdAt) {
  const hour = new Date(createdAt || Date.now()).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18) return "evening";
  return "late";
}

function normalizePaymentRow(row, source, profileNames = {}) {
  const total = firstNumber(row, ["total", "net_sales", "net_total", "amount", "subtotal"], 0);
  const refunded = isRefunded(row);
  const refundAmount = firstNumber(row, ["refund", "refunds", "refund_amount", "refunded_amount", "refund_total"], refunded ? total : 0);
  const store = storeInfo(row, source);
  const employee = employeeInfo(row, source, profileNames);

  return {
    paymentType: normalizePayment(row?.payment_method || row?.payment_type),
    saleCount: refunded ? 0 : 1,
    saleAmount: refunded ? 0 : total,
    refundCount: refunded ? 1 : 0,
    refundAmount: refunded ? Math.abs(refundAmount) : 0,
    createdAt: row?.created_at,
    storeValue: store.value,
    storeLabel: store.label,
    employeeValue: employee.value,
    employeeLabel: employee.label,
    timeBucket: timeBucket(row?.created_at),
  };
}

function normalizeData(data, profileNames = {}) {
  const posRows = (data?.orders || []).map((order) => normalizePaymentRow(order, "POS", profileNames));
  const webRows = (data?.webOrders || [])
    .filter((order) => isCompletedStatus(order.status))
    .map((order) => normalizePaymentRow(order, "Web", profileNames));
  return [...posRows, ...webRows].filter((row) => row.createdAt);
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

function aggregatePayments(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.paymentType || "Unspecified";
    const current = map.get(key) || { paymentType: key, saleCount: 0, saleAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0 };
    current.saleCount += row.saleCount;
    current.saleAmount += row.saleAmount;
    current.refundCount += row.refundCount;
    current.refundAmount += row.refundAmount;
    current.netAmount = current.saleAmount - current.refundAmount;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => a.paymentType.localeCompare(b.paymentType));
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
  const [paymentRows, setPaymentRows] = useState([]);
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
        setPaymentRows([]);
        setLoading(false);
        return;
      }

      const profileNames = await loadProfileNames(supabase, collectEmployeeIds(data));
      if (!active) return;

      setError("");
      setPaymentRows(normalizeData(data, profileNames));
      setLoading(false);
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [end, start, supabase]);

  const storeOptions = useMemo(() => uniqueOptions(paymentRows, "storeValue", "storeLabel"), [paymentRows]);
  const employeeOptions = useMemo(() => uniqueOptions(paymentRows, "employeeValue", "employeeLabel"), [paymentRows]);
  const filteredRows = useMemo(
    () =>
      paymentRows.filter((row) => {
        if (timeFilter !== "all" && row.timeBucket !== timeFilter) return false;
        if (storeFilter !== "all" && row.storeValue !== storeFilter) return false;
        if (employeeFilter !== "all" && row.employeeValue !== employeeFilter) return false;
        return true;
      }),
    [employeeFilter, paymentRows, storeFilter, timeFilter]
  );
  const rows = useMemo(() => aggregatePayments(filteredRows), [filteredRows]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          saleCount: sum.saleCount + row.saleCount,
          saleAmount: sum.saleAmount + row.saleAmount,
          refundCount: sum.refundCount + row.refundCount,
          refundAmount: sum.refundAmount + row.refundAmount,
          netAmount: sum.netAmount + row.netAmount,
        }),
        { saleCount: 0, saleAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0 }
      ),
    [rows]
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
      ["Payment type", "Payment transactions", "Payment amount", "Refund transactions", "Refund amount", "Net amount"],
      ...rows.map((row) => [row.paymentType, row.saleCount, row.saleAmount.toFixed(2), row.refundCount, row.refundAmount.toFixed(2), row.netAmount.toFixed(2)]),
      ["Total", totals.saleCount, totals.saleAmount.toFixed(2), totals.refundCount, totals.refundAmount.toFixed(2), totals.netAmount.toFixed(2)],
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-by-payment-type-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-rose-50/30">
      <div className="border-b border-rose-200 bg-rose-600 px-4 py-3 shadow-sm sm:px-6">
        <h1 className="text-lg font-bold text-white">Sales by payment type</h1>
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
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-rose-100 bg-rose-50/60 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-4">Payment type</th>
                  <th className="px-4 py-4 text-right">Payment transactions</th>
                  <th className="px-4 py-4 text-right">Payment amount</th>
                  <th className="px-4 py-4 text-right">Refund transactions</th>
                  <th className="px-4 py-4 text-right">Refund amount</th>
                  <th className="px-5 py-4 text-right">Net amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">Loading payment sales...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan="6" className="px-6 py-10 text-center text-sm font-semibold text-slate-400">No payment sales found.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.paymentType} className="border-b border-rose-50 last:border-0 hover:bg-rose-50/50">
                      <td className="px-5 py-4 font-semibold text-slate-900">{row.paymentType}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{numberFormatter.format(row.saleCount)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-950">{money(row.saleAmount)}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{numberFormatter.format(row.refundCount)}</td>
                      <td className="px-4 py-4 text-right text-slate-700">{money(row.refundAmount)}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-950">{money(row.netAmount)}</td>
                    </tr>
                  ))
                )}
                {!loading && rows.length ? (
                  <tr className="border-t border-rose-100 bg-white font-bold text-slate-950">
                    <td className="px-5 py-4">Total</td>
                    <td className="px-4 py-4 text-right">{numberFormatter.format(totals.saleCount)}</td>
                    <td className="px-4 py-4 text-right">{money(totals.saleAmount)}</td>
                    <td className="px-4 py-4 text-right">{numberFormatter.format(totals.refundCount)}</td>
                    <td className="px-4 py-4 text-right">{money(totals.refundAmount)}</td>
                    <td className="px-5 py-4 text-right">{money(totals.netAmount)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
