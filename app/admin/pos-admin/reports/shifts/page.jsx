"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Store,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dateFormat";

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

function inDateRange(value, start, end) {
  if (!value) return false;
  const time = new Date(value).getTime();
  const from = new Date(`${start}T00:00:00`).getTime();
  const to = new Date(`${end}T23:59:59`).getTime();
  return time >= from && time <= to;
}

function displayDate(value) {
  if (!value) return "No date";
  return formatDate(value, "No date");
}

function displayRange(start, end) {
  return `${displayDate(start)} - ${displayDate(end)}`;
}

function displayDateTime(value) {
  if (!value) return "-";
  return formatDateTime(value);
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
  return Number(fallback || 0);
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function storeLabel(storeId) {
  return BRANCH_LABELS[storeId] || storeId || "All stores";
}

function posLabel(storeId, fallback) {
  const label = storeLabel(storeId);
  if (label.includes("Pasong Tamo")) return "Cashier - Pasong Tamo";
  if (label.includes("Diliman")) return "Cashier - Diliman";
  return fallback || "Cashier";
}

function shiftNumber(row, index) {
  const raw = String(row?.closeRecord?.id || row?.id || "");
  const match = raw.match(/(\d{2,})$/);
  if (match) return match[1].slice(-6);
  return String(index + 1).padStart(2, "0");
}

function keyFor(record) {
  return `${record.store_id || "store"}::${record.cashier_name || "cashier"}`;
}

function normalizeRecord(record) {
  return {
    ...record,
    mode: String(record.mode || record.shift_type || record.type || record.action || "").toLowerCase(),
    sales_summary: parseJson(record.sales_summary),
    denominations: parseJson(record.denominations),
  };
}

function buildShiftRows(records, start, end) {
  const normalized = [...(records || [])].map(normalizeRecord).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const openByKey = new Map();
  const openByStore = new Map();
  const rows = [];

  normalized.forEach((record) => {
    const isOpen = record.mode.includes("open");
    const isClose = record.mode.includes("close");
    const key = keyFor(record);
    const storeKey = record.store_id || "store";

    if (isOpen) {
      openByKey.set(key, record);
      openByStore.set(storeKey, record);
      return;
    }

    if (!isClose) return;

    const openRecord = openByKey.get(key) || openByStore.get(storeKey) || null;
    const summary = parseJson(record.sales_summary);
    const payments = parseJson(summary.payments);
    const startingCash = firstNumber(openRecord || record, ["cash_total", "starting_cash", "initial_cash"], 0);
    const cashPayments = firstNumber(summary, ["cashPayments", "cash_payments"], 0);
    const cashRefunds = firstNumber(summary, ["cashRefunds", "cash_refunds"], 0);
    const expectedCash = firstNumber(record, ["expected_cash", "expected_cash_amount"], firstNumber(summary, ["expectedCash", "expected_cash"], startingCash + cashPayments - cashRefunds));
    const actualCash = firstNumber(record, ["cash_total", "actual_cash", "actual_cash_amount"], 0);
    const difference = actualCash - expectedCash;
    const paymentTotal = Object.values(payments).reduce((sum, value) => sum + Number(value || 0), 0);
    const refunds = firstNumber(summary, ["refunds", "refundTotal", "refund_total"], cashRefunds);
    const discounts = firstNumber(summary, ["discounts", "discountTotal", "discount_total"], 0);
    const grossSales = firstNumber(summary, ["grossSales", "gross_sales"], cashPayments + paymentTotal + refunds + discounts);
    const netSales = firstNumber(summary, ["netSales", "net_sales"], grossSales - refunds - discounts);

    rows.push({
      id: record.id || `${record.store_id}-${record.created_at}`,
      storeId: record.store_id || openRecord?.store_id || "",
      store: storeLabel(record.store_id || openRecord?.store_id || ""),
      pos: posLabel(record.store_id || openRecord?.store_id || "", record.cashier_name),
      openingTime: openRecord?.created_at || "",
      closingTime: record.created_at || "",
      openedBy: openRecord?.cashier_name || record.cashier_name || "Operator",
      closedBy: record.cashier_name || openRecord?.cashier_name || "Operator",
      startingCash,
      cashPayments,
      cashRefunds,
      paidIn: firstNumber(summary, ["paidIn", "paid_in"], 0),
      paidOut: firstNumber(summary, ["paidOut", "paid_out"], 0),
      expectedCash,
      actualCash,
      difference,
      grossSales,
      refunds,
      discounts,
      netSales,
      payments,
      taxes: firstNumber(summary, ["taxes", "tax"], 0),
      openRecord,
      closeRecord: record,
    });

    openByKey.delete(key);
    openByStore.delete(storeKey);
  });

  return rows
    .filter((row) => inDateRange(row.closingTime || row.openingTime, start, end))
    .sort((a, b) => new Date(b.closingTime || 0) - new Date(a.closingTime || 0))
    .map((row, index) => ({ ...row, shiftNumber: shiftNumber(row, index) }));
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function differenceTone(value) {
  const abs = Math.abs(Number(value || 0));
  if (abs < 0.01) return "ok";
  if (abs <= 50) return "warn";
  return "bad";
}

export default function Page() {
  const supabase = getSupabaseClient();
  const today = inputDate();
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [storeFilter, setStoreFilter] = useState("all");
  const [records, setRecords] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setLoading(true);
      const { data, error: shiftError } = await supabase
        .from("cashier_pos")
        .select("*")
        .order("created_at", { ascending: true });

      if (!active) return;

      if (shiftError) {
        setError(shiftError.message);
        setRecords([]);
        setLoading(false);
        return;
      }

      setError("");
      setRecords(data || []);
      setLoading(false);
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [supabase]);

  const shiftRows = useMemo(() => buildShiftRows(records, start, end), [end, records, start]);
  const storeOptions = useMemo(() => {
    const map = new Map();
    shiftRows.forEach((row) => {
      if (row.storeId) map.set(row.storeId, row.store);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [shiftRows]);

  const filteredRows = useMemo(
    () => shiftRows.filter((row) => storeFilter === "all" || row.storeId === storeFilter),
    [shiftRows, storeFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [end, pageSize, start, storeFilter]);

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
      ["POS", "Opening time", "Closing time", "Expected cash amount", "Actual cash amount", "Difference"],
      ...filteredRows.map((row) => [
        row.pos,
        displayDateTime(row.openingTime),
        displayDateTime(row.closingTime),
        row.expectedCash.toFixed(2),
        row.actualCash.toFixed(2),
        row.difference.toFixed(2),
      ]),
    ];
    const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shifts-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-sky-50/30">
      <div className="border-b border-sky-200 bg-slate-600 px-4 py-3 shadow-sm sm:px-6">
        <h1 className="text-lg font-bold text-white">Shifts</h1>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm sm:flex-row sm:items-center">
            <button type="button" onClick={() => moveRange(-1)} className="flex h-10 items-center justify-center border-b border-slate-200 px-3 text-slate-500 hover:bg-sky-50 sm:border-b-0 sm:border-r" aria-label="Previous date range">
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={17} className="text-sky-500" />
                <span className="whitespace-nowrap">{displayRange(start, end)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={start} onChange={(event) => updateStart(event.target.value)} className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500" aria-label="Start date" />
                <input type="date" value={end} onChange={(event) => updateEnd(event.target.value)} className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500" aria-label="End date" />
              </div>
            </div>
            <button type="button" onClick={() => moveRange(1)} className="flex h-10 items-center justify-center border-t border-slate-200 px-3 text-slate-500 hover:bg-sky-50 sm:border-l sm:border-t-0" aria-label="Next date range">
              <ChevronRight size={18} />
            </button>
          </div>

          <label className="relative block min-w-[170px]">
            <Store size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-sky-500" aria-label="Store filter">
              <option value="all">All stores</option>
              {storeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">Shifts Failed: {error}</div> : null}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
            <button type="button" onClick={exportCSV} className="inline-flex h-9 items-center gap-2 rounded-md px-1 text-sm font-bold uppercase tracking-normal text-slate-800 hover:text-slate-700">
              Export
              <ChevronDown size={15} />
              <Download size={16} className="text-sky-500" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b border-slate-200 bg-sky-50/60 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-4">POS</th>
                  <th className="px-4 py-4">Opening time</th>
                  <th className="px-4 py-4">Closing time</th>
                  <th className="px-4 py-4 text-right">Expected cash<br />amount</th>
                  <th className="px-4 py-4 text-right">Actual cash amount</th>
                  <th className="px-4 py-4 text-right">Difference</th>
                  <th className="px-5 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-500">Loading shifts...</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan="7" className="px-6 py-10 text-center text-sm font-semibold text-slate-500">No shift records found.</td></tr>
                ) : (
                  pageRows.map((row) => {
                    const tone = differenceTone(row.difference);
                    return (
                      <tr key={row.id} onClick={() => setSelectedShift(row)} className="cursor-pointer border-b border-sky-50 last:border-0 hover:bg-sky-50/50">
                        <td className="px-5 py-4 font-semibold text-slate-900">{row.pos}</td>
                        <td className="px-4 py-4 text-slate-700">{displayDateTime(row.openingTime)}</td>
                        <td className="px-4 py-4 text-slate-700">{displayDateTime(row.closingTime)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-950">{money(row.expectedCash)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-950">{money(row.actualCash)}</td>
                        <td className={`px-4 py-4 text-right font-bold ${tone === "ok" ? "text-slate-700" : tone === "warn" ? "text-orange-500" : "text-slate-600"}`}>
                          {tone === "ok" ? "-" : money(row.difference)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {tone === "ok" ? (
                            <Check size={18} className="ml-auto text-emerald-600" />
                          ) : (
                            <AlertTriangle size={18} className={`ml-auto ${tone === "warn" ? "text-orange-500" : "text-slate-600"}`} />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center">
            <div className="flex">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-9 w-11 items-center justify-center border border-slate-200 bg-white text-slate-500 hover:bg-sky-50" aria-label="Previous page">
                <ChevronLeft size={17} />
              </button>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="flex h-9 w-11 items-center justify-center border border-l-0 border-slate-200 bg-white text-slate-500 hover:bg-sky-50" aria-label="Next page">
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>Page:</span>
              <input value={currentPage} onChange={(event) => setPage(Math.max(1, Math.min(totalPages, Number(event.target.value) || 1)))} className="h-8 w-12 rounded border border-slate-200 text-center text-xs outline-none focus:border-sky-500" />
              <span>of {totalPages}</span>
            </div>
            <label className="flex items-center gap-2 sm:ml-4">
              Rows per page:
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-sky-500">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      {selectedShift ? (
        <div className="fixed inset-0 z-50 bg-slate-950/20" onClick={() => setSelectedShift(null)}>
          <aside className="absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:w-[410px]" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <button type="button" onClick={() => setSelectedShift(null)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-slate-700" aria-label="Close shift report">
                <X size={19} />
              </button>
              <h2 className="text-sm font-black uppercase text-slate-950">Shift Report</h2>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-sky-50 hover:text-slate-700" aria-label="Shift actions">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-sm">
              <div className="space-y-2 border-b border-dashed border-slate-200 pb-4 text-xs font-semibold text-slate-700">
                <p>Shift number: {selectedShift.shiftNumber}</p>
                <p>Store: {selectedShift.store}</p>
                <p>POS: {selectedShift.pos}</p>
                <div className="grid grid-cols-[1fr_auto] gap-3 pt-2">
                  <span>Shift opened: {selectedShift.openedBy}</span>
                  <span>{displayDateTime(selectedShift.openingTime)}</span>
                  <span>Shift closed: {selectedShift.closedBy}</span>
                  <span>{displayDateTime(selectedShift.closingTime)}</span>
                </div>
              </div>

              <div className="space-y-3 border-b border-dashed border-slate-200 py-4">
                <h3 className="text-xs font-black text-slate-700">Cash drawer</h3>
                {[
                  ["Starting cash", selectedShift.startingCash],
                  ["Cash payments", selectedShift.cashPayments],
                  ["Cash refunds", selectedShift.cashRefunds],
                  ["Paid in", selectedShift.paidIn],
                  ["Paid out", selectedShift.paidOut],
                  ["Expected cash amount", selectedShift.expectedCash],
                  ["Actual cash amount", selectedShift.actualCash],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-slate-700">{label}</span>
                    <span className="font-semibold text-slate-950">{money(value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 font-bold text-slate-950">
                  <span>Difference</span>
                  <span>{money(selectedShift.difference)}</span>
                </div>
              </div>

              <div className="space-y-3 py-4">
                <h3 className="text-xs font-black text-slate-700">Sales summary</h3>
                {[
                  ["Gross sales", selectedShift.grossSales],
                  ["Refunds", selectedShift.refunds],
                  ["Discounts", selectedShift.discounts],
                  ["Net sales", selectedShift.netSales],
                  ["Cash", selectedShift.cashPayments],
                  ...Object.entries(selectedShift.payments || {}),
                  ["Taxes", selectedShift.taxes],
                ].map(([label, value]) => (
                  <div key={label} className={`flex items-center justify-between gap-4 ${["Gross sales", "Net sales"].includes(label) ? "font-bold text-slate-950" : "text-slate-700"}`}>
                    <span>{label}</span>
                    <span>{money(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
