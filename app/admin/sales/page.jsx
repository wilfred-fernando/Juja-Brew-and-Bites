"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Check,
  AlertTriangle,
  X,
  PackageSearch,
  RefreshCw,
  Search,
  Store,
  UserRound,
  WalletCards,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { exportReportToCSV } from "@/lib/reports/exportCsv";
import {
  ORDER_TYPE_OPTIONS,
  REPORT_TABS,
  STATUS_OPTIONS,
  applyFilters,
  addDays,
  defaultFilters,
  daysBetween,
  displayDate,
  displayDateTime,
  getCashierReport,
  getCategorySalesReport,
  getDiscountReport,
  getPaymentReport,
  getProductSalesReport,
  getSalesSummary,
  getSalesTrend,
  getVoidRefundReport,
  manilaDate,
  number,
  peso,
  previousRange,
  rangeFromPreset,
  uniqueOptions,
  normalizeSalesData,
} from "@/lib/reports/salesReports";

const supabase = getSupabaseClient();
const DEFAULT_ROWS_PER_PAGE = 10;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
const SUPABASE_PAGE_SIZE = 1000;
const SHIFT_DIFF_TOLERANCE = 1;

async function fetchAllRows(buildQuery, pageSize = SUPABASE_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchOrderItems(orderIds) {
  const ids = orderIds.filter(Boolean);
  const rows = [];
  const chunkSize = 250;
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const { data, error } = await supabase.from("order_items").select("*").in("order_id", chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatRangeDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatSlashDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function monthLabel(monthKey) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00+08:00`));
}

function addMonths(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay()));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

const SUMMARY_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_year", label: "This year" },
];

function SelectInput({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
      >
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>
            {option.label || option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_55px_rgba(71,85,105,0.14)] backdrop-blur-xl transition duration-300 ${className}`}>
      {children}
    </div>
  );
}

function Empty({ message }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">{message}</div>;
}

function DataTable({ columns, rows, empty, onView }) {
  if (!rows.length) return <Empty message={empty} />;
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/70 bg-white/82 shadow-[0_20px_60px_rgba(71,85,105,0.12)] backdrop-blur-xl">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100/90 text-[10px] uppercase tracking-[0.18em] text-slate-500">
          <tr>
            {columns.map((column) => <th key={column.key} className={`border-b border-slate-200 px-4 py-3 font-semibold ${column.align === "right" ? "text-right" : ""}`}>{column.label}</th>)}
            {onView ? <th className="border-b border-slate-200 px-4 py-3 text-right font-semibold">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80">
          {rows.map((row, index) => (
            <tr key={row.id || row.orderNumber || row.productName || row.category || index} className="text-slate-700 transition hover:bg-cyan-50/45">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-2.5 ${column.align === "right" ? "text-right tabular-nums" : ""} ${column.emphasis ? "font-semibold text-slate-950" : ""}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
              {onView ? (
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => onView(row)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition hover:-translate-y-0.5 hover:bg-cyan-100">
                    <Eye className="h-4 w-4" /> View
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function num(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonNumber(source, key, fallback = 0) {
  return num(source?.[key], fallback);
}

function formatDifference(value) {
  const amount = num(value);
  if (Math.abs(amount) < SHIFT_DIFF_TOLERANCE) return "-";
  return amount < 0 ? `(${peso(Math.abs(amount))})` : peso(amount);
}

function normalizeStoreName(store) {
  return store?.name || store?.store_name || store?.store_code || "Store";
}

function buildShiftRows(shiftRecords = [], stores = [], filters = defaultFilters()) {
  const storeById = new Map(stores.map((store) => [String(store.id), normalizeStoreName(store)]));
  const sorted = [...shiftRecords].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const openQueues = new Map();
  const rows = [];

  sorted.forEach((record) => {
    const mode = String(record.mode || "").toLowerCase();
    const storeId = String(record.store_id || "MAIN");
    if (mode === "open") {
      if (!openQueues.has(storeId)) openQueues.set(storeId, []);
      openQueues.get(storeId).push(record);
      return;
    }
    if (mode !== "close") return;

    const opens = openQueues.get(storeId) || [];
    const open = opens.pop() || null;
    const summary = record.sales_summary || {};
    const payments = summary.payments || {};
    const startingCash = num(open?.cash_total);
    const cashPayments = jsonNumber(summary, "cashPayments");
    const cashRefunds = jsonNumber(summary, "cashRefunds");
    const expectedCash = num(summary.expectedCash, startingCash + cashPayments - cashRefunds);
    const actualCash = num(record.cash_total);
    const difference = actualCash - expectedCash;
    const openedAt = open?.created_at || record.created_at;
    const closedAt = record.created_at;
    const rowDate = (closedAt || openedAt || "").slice(0, 10);
    const storeName = storeById.get(storeId) || storeId || "Store";
    const paymentValue = (...names) => names.reduce((sum, name) => sum + num(payments[name]), 0);

    rows.push({
      id: record.id,
      shiftNumber: String(record.id || "").replace(/^\D+/, "").slice(-6) || rows.length + 1,
      storeId,
      storeName,
      pos: storeName.includes("Diliman") ? "Cashier - Diliman" : storeName.includes("Pasong") ? "Cashier - Pasong Tamo" : `Cashier - ${storeName}`,
      cashierName: record.cashier_name || open?.cashier_name || "Owner",
      openedBy: open?.cashier_name || record.cashier_name || "Owner",
      closedBy: record.cashier_name || "Owner",
      openedAt,
      closedAt,
      startingCash,
      cashPayments,
      cashRefunds,
      paidIn: 0,
      paidOut: 0,
      expectedCash,
      actualCash,
      difference,
      grossSales: cashPayments + Object.values(payments).reduce((sum, value) => sum + num(value), 0),
      refunds: cashRefunds,
      discounts: num(summary.discounts),
      netSales: num(summary.netSales, cashPayments + Object.values(payments).reduce((sum, value) => sum + num(value), 0) - cashRefunds),
      payments: {
        Cash: cashPayments,
        CARD: paymentValue("Card", "CARD"),
        GCASH: paymentValue("Gcash", "GCash", "GCASH"),
        GRABFOOD: paymentValue("GrabFood", "GRABFOOD"),
        QRPH: paymentValue("QRPH", "Qrph"),
        Panda: paymentValue("Panda", "Foodpanda", "FOODPANDA"),
        "Grab Dine Out": paymentValue("Grab Dine Out", "GRAB DINE OUT"),
      },
      taxes: num(summary.taxes),
      rawOpen: open,
      rawClose: record,
      rowDate,
    });
  });

  return rows
    .filter((row) => row.rowDate >= filters.startDate && row.rowDate <= filters.endDate)
    .filter((row) => filters.branchId === "All" || String(row.storeId) === String(filters.branchId) || row.storeName === filters.branchId)
    .sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
}

function ShiftsTable({ rows, page, rowsPerPage, onPageChange, onRowsPerPageChange, onSelect, onExport }) {
  const pageRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  if (!rows.length) return <Empty message="No shift records found for this date range." />;
  return (
    <div className="overflow-hidden rounded-sm border border-slate-200 bg-white/94 shadow-[0_14px_38px_rgba(71,85,105,0.14)]">
      <div onClick={onExport} className="flex h-12 cursor-pointer items-center border-b border-slate-200 px-5">
        <button className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-800">Export <span className="text-slate-500">⌄</span></button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white text-[11px] font-medium text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-5 py-3">POS</th>
              <th className="border-b border-slate-200 px-5 py-3">Opening time</th>
              <th className="border-b border-slate-200 px-5 py-3">Closing time</th>
              <th className="border-b border-slate-200 px-5 py-3 text-right">Expected cash amount</th>
              <th className="border-b border-slate-200 px-5 py-3 text-right">Actual cash amount</th>
              <th className="border-b border-slate-200 px-5 py-3 text-right">Difference</th>
              <th className="border-b border-slate-200 px-5 py-3 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageRows.map((row) => {
              const isOk = Math.abs(row.difference) < SHIFT_DIFF_TOLERANCE;
              return (
                <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer text-slate-800 transition hover:bg-slate-50">
                  <td className="px-5 py-3">{row.pos}</td>
                  <td className="px-5 py-3">{displayDateTime(row.openedAt)}</td>
                  <td className="px-5 py-3">{displayDateTime(row.closedAt)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{peso(row.expectedCash)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{peso(row.actualCash)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${isOk ? "text-slate-600" : row.difference < 0 ? "text-red-600" : "text-orange-600"}`}>
                    {formatDifference(row.difference)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {isOk ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <AlertTriangle className={`mx-auto h-4 w-4 ${Math.abs(row.difference) > 100 ? "text-red-600" : "text-orange-500"}`} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        page={page}
        totalRows={rows.length}
        rowsPerPage={rowsPerPage}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
      />
    </div>
  );
}

function ShiftReportDrawer({ shift, onClose }) {
  if (!shift) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
      <button className="flex-1 cursor-default" aria-label="Close shift report" onClick={onClose} />
      <aside className="h-full w-full max-w-[360px] overflow-y-auto bg-white px-5 py-5 text-sm text-slate-800 shadow-[-18px_0_40px_rgba(15,23,42,0.16)]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex-1 text-center text-sm font-semibold uppercase tracking-wide text-slate-950">Shift Report</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 border-t border-dashed border-slate-300 pt-4 text-xs">
          <div className="flex justify-between gap-4"><span>Shift number: {shift.shiftNumber}</span></div>
          <div>Store: {shift.storeName}</div>
          <div>POS: {shift.pos}</div>
          <div className="flex justify-between gap-4"><span>Shift opened: {shift.openedBy}</span><span>{displayDateTime(shift.openedAt)}</span></div>
          <div className="flex justify-between gap-4"><span>Shift closed: {shift.closedBy}</span><span>{displayDateTime(shift.closedAt)}</span></div>
        </div>

        <ReportDrawerSection title="Cash drawer">
          <DrawerAmount label="Starting cash" value={shift.startingCash} />
          <DrawerAmount label="Cash payments" value={shift.cashPayments} />
          <DrawerAmount label="Cash refunds" value={shift.cashRefunds} />
          <DrawerAmount label="Paid in" value={shift.paidIn} />
          <DrawerAmount label="Paid out" value={shift.paidOut} />
          <DrawerAmount label="Expected cash amount" value={shift.expectedCash} />
          <DrawerAmount label="Actual cash amount" value={shift.actualCash} />
          <DrawerAmount label="Difference" value={shift.difference} strong negative={shift.difference < 0} />
        </ReportDrawerSection>

        <ReportDrawerSection title="Sales summary">
          <DrawerAmount label="Gross sales" value={shift.grossSales} strong />
          <DrawerAmount label="Refunds" value={shift.refunds} />
          <DrawerAmount label="Discounts" value={shift.discounts} />
          <DrawerAmount label="Net sales" value={shift.netSales} strong />
          {Object.entries(shift.payments).filter(([, value]) => Math.abs(num(value)) > 0).map(([label, value]) => (
            <DrawerAmount key={label} label={label} value={value} />
          ))}
          <DrawerAmount label="Taxes" value={shift.taxes} />
        </ReportDrawerSection>
      </aside>
    </div>
  );
}

function ReportDrawerSection({ title, children }) {
  return (
    <div className="mt-4 border-t border-dashed border-slate-300 pt-3">
      <h3 className="mb-2 text-xs font-medium text-emerald-700">{title}</h3>
      <div className="space-y-2 text-xs">{children}</div>
    </div>
  );
}

function DrawerAmount({ label, value, strong = false, negative = false }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${negative ? "text-red-600" : ""}`}>{negative ? `(${peso(Math.abs(num(value)))})` : peso(value)}</span>
    </div>
  );
}

function PaginationFooter({ page, totalRows, rowsPerPage, onPageChange, onRowsPerPageChange }) {
  const pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-700">
      <div className="inline-flex overflow-hidden border border-slate-200 bg-white">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="flex h-8 w-10 items-center justify-center border-r border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          className="flex h-8 w-10 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span>Page:</span>
        <span className="flex h-8 min-w-8 items-center justify-center border border-slate-200 bg-white px-2">{page}</span>
        <span>of {pageCount}</span>
      </div>
      <label className="ml-auto flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={rowsPerPage}
          onChange={(event) => onRowsPerPageChange(Number(event.target.value))}
          className="h-8 min-w-20 border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none"
        >
          {ROWS_PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SummarySelectControl({ icon: Icon, value, onChange, options, wide = false, allLabel }) {
  return (
    <label className={`inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 ${wide ? "min-w-[210px]" : ""}`}>
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-slate-500" /> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-800 outline-none"
      >
        {options.map((option) => {
          const optionValue = option.value || option;
          const label = option.label || option;
          return (
            <option key={optionValue} value={optionValue}>
              {allLabel && optionValue === "All" ? allLabel : label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SummaryDateRangeControl({ startDate, endDate, preset, onRangeChange, onPresetChange, buttonClassName = "" }) {
  const [open, setOpen] = useState(false);
  const [activeEndpoint, setActiveEndpoint] = useState("start");
  const [viewMonth, setViewMonth] = useState((startDate || manilaDate()).slice(0, 7));
  const days = useMemo(() => calendarDays(viewMonth), [viewMonth]);
  const start = startDate || manilaDate();
  const end = endDate || start;

  useEffect(() => {
    setViewMonth((startDate || endDate || manilaDate()).slice(0, 7));
  }, [startDate, endDate]);

  function chooseDate(date) {
    if (activeEndpoint === "start") {
      onRangeChange(date, date > end ? date : end);
      setActiveEndpoint("end");
      return;
    }
    onRangeChange(date < start ? date : start, date);
    setActiveEndpoint("start");
    setOpen(false);
  }

  function handleInputChange(endpoint, value) {
    if (!value) return;
    setActiveEndpoint(endpoint === "start" ? "end" : "start");
    if (endpoint === "start") {
      onRangeChange(value, value > end ? value : end);
      return;
    }
    onRangeChange(value < start ? value : start, value);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 min-w-[250px] items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 ${buttonClassName}`}
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate">{formatRangeDate(start)} - {formatRangeDate(end)}</span>
      </button>

      {open ? (
        <div className="absolute left-0 z-40 mt-2 grid w-[620px] max-w-[calc(100vw-2rem)] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] md:grid-cols-[1fr_170px]">
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, -1))} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-medium text-slate-900">{monthLabel(viewMonth)}</p>
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-700">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-100">
              {days.map((date) => {
                const isCurrentMonth = date.slice(0, 7) === viewMonth;
                const isStart = date === start;
                const isEnd = date === end;
                const isInRange = date >= start && date <= end;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => chooseDate(date)}
                    className={`h-9 text-xs transition ${isCurrentMonth ? "text-slate-800" : "text-slate-300"} ${isInRange ? "bg-lime-100" : "bg-white hover:bg-cyan-50"} ${isStart || isEnd ? "font-semibold text-white" : ""}`}
                  >
                    <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${isStart || isEnd ? "bg-lime-500 shadow-sm" : ""}`}>
                      {Number(date.slice(8, 10))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-6 border-t border-slate-200 pt-3">
              <label className="text-[11px] font-medium text-slate-500">
                Start date
                <input
                  type="date"
                  value={start}
                  onChange={(event) => handleInputChange("start", event.target.value)}
                  onFocus={() => setActiveEndpoint("start")}
                  className="mt-1 block w-full border-b border-slate-200 bg-transparent pb-1 text-xs font-medium text-slate-800 outline-none focus:border-cyan-500"
                  aria-label="Sales summary start date"
                />
                <span className="mt-1 block text-xs text-slate-700">{formatSlashDate(start)}</span>
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                End date
                <input
                  type="date"
                  value={end}
                  onChange={(event) => handleInputChange("end", event.target.value)}
                  onFocus={() => setActiveEndpoint("end")}
                  className="mt-1 block w-full border-b border-slate-200 bg-transparent pb-1 text-xs font-medium text-slate-800 outline-none focus:border-cyan-500"
                  aria-label="Sales summary end date"
                />
                <span className="mt-1 block text-xs text-slate-700">{formatSlashDate(end)}</span>
              </label>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 md:border-l md:border-t-0">
            {SUMMARY_DATE_PRESETS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onPresetChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-3 text-left text-sm transition ${preset === option.value ? "bg-slate-200 text-slate-950" : "text-slate-700 hover:bg-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryMetricCell({ label, value, delta, active = false }) {
  const amount = Number(delta?.amount || 0);
  const percent = Number(delta?.percent || 0);
  const isPositive = amount >= 0;
  return (
    <div className={`relative min-h-[92px] border-b px-5 py-4 sm:border-b-0 sm:border-r ${active ? "border-b-cyan-600 sm:after:absolute sm:after:bottom-0 sm:after:left-0 sm:after:h-[3px] sm:after:w-full sm:after:bg-cyan-600" : "border-slate-100"}`}>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-slate-950">{value}</p>
      <p className={`mt-1 text-xs ${isPositive ? "text-emerald-700" : "text-red-600"}`}>
        {isPositive ? "+" : "-"}{peso(Math.abs(amount)).replace("PHP", "₱")} ({isPositive ? "+" : "-"}{Math.abs(percent).toFixed(2)}%)
      </p>
    </div>
  );
}

function SummaryExportTable({ rows }) {
  if (!rows.length) return <Empty message="No daily sales found for this date range." />;
  return (
    <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white/92 shadow-[0_14px_38px_rgba(71,85,105,0.14)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <button className="text-xs font-semibold uppercase tracking-wide text-slate-800">Export</button>
        <div className="h-5 w-5 rounded border-2 border-slate-500" aria-hidden="true" />
      </div>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white text-[11px] text-slate-500">
          <tr>
            {["Date", "Gross sales", "Refunds", "Discounts", "Net sales", "Gross profit"].map((header, index) => (
              <th key={header} className={`border-b border-slate-200 px-5 py-4 font-medium ${index > 0 ? "text-right" : ""}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80">
          {rows.map((row) => (
            <tr key={row.date} className="text-slate-800 transition hover:bg-cyan-50/40">
              <td className="px-5 py-2.5">{displayDate(row.date)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{peso(row.gross)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{peso(row.refund)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{peso(row.discount)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{peso(row.net)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{peso(row.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function receiptPeso(value) {
  return peso(value).replace("PHP", "₱");
}

function ReceiptDrawer({ order, items = [], onClose }) {
  if (!order) return null;
  const totalCollected = Number(order.raw?.total_collected ?? order.raw?.["Total collected"] ?? order.net ?? 0);
  const change = Math.max(0, totalCollected - Number(order.net || 0));
  const tableLabel = order.raw?.table_name || order.raw?.table || (String(order.orderType || "").toLowerCase().includes("dine") ? "TABLE 1" : "");
  const paymentAmount = totalCollected || order.net;
  const hasCustomer = Boolean(order.customerName && !["walk-in", "web customer"].includes(String(order.customerName).toLowerCase()));
  const pointsEarned = hasCustomer ? Number(order.net || 0) * 0.04 : 0;
  const pointsBalance = Number(order.customerAvailablePoints ?? order.customerPointsBalance ?? NaN);
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/35 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-[320px] overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-8 items-center justify-between border-b border-slate-200 px-3 text-slate-500">
          <button onClick={onClose} className="text-2xl leading-none text-slate-500 transition hover:text-slate-900" aria-label="Close receipt">×</button>
          <span className="text-lg leading-none text-slate-500">...</span>
        </div>

        <div className="px-3 pb-6 pt-6 text-[11px] text-slate-900">
          <div className="text-center">
            <p className="text-2xl font-normal tracking-tight text-slate-950">{receiptPeso(order.net)}</p>
            <p className="mt-1 text-[11px] text-slate-500">Total</p>
          </div>

          <div className="mt-4 border-t border-slate-200 py-2 leading-4">
            <p>Order: {order.orderNumber}</p>
            <p>Employee: {order.cashierName || "-"}</p>
            <p>POS: {order.raw?.pos || order.raw?.POS || order.storeName || "-"}</p>
          </div>

          {hasCustomer ? (
            <div className="border-t border-slate-200 py-2 leading-4">
              <p>Customer: {order.customerName}</p>
              {order.customerPhone ? <p>{order.customerPhone}</p> : null}
            </div>
          ) : null}

          {tableLabel ? (
            <div className="border-t border-slate-200 py-2 text-xs font-semibold uppercase text-slate-900">
              {tableLabel}
            </div>
          ) : null}

          <div className="border-t border-slate-200">
            {(items.length ? items : [{ itemName: order.raw?.description || order.raw?.Description || "Receipt total", quantity: 1, unitPrice: order.net, net: order.net }]).map((item, index) => (
              <div key={item.id || index} className="flex gap-3 border-b border-slate-200 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-900">{item.itemName}</p>
                  <p className="text-slate-500">{number(item.quantity)} × {receiptPeso(item.unitPrice || (item.quantity ? item.net / item.quantity : item.net))}</p>
                </div>
                <p className="shrink-0 text-right text-slate-900">{receiptPeso(item.net)}</p>
              </div>
            ))}
          </div>

          <div className="border-b border-slate-200 py-2">
            {hasCustomer ? (
              <div className="mb-2 border-b border-slate-200 pb-2 text-green-600">
                <div className="flex justify-between gap-3">
                  <span>Points earned</span>
                  <span>{number(pointsEarned)}</span>
                </div>
                {Number.isFinite(pointsBalance) ? (
                  <div className="flex justify-between gap-3">
                    <span>Points balance</span>
                    <span>{number(pointsBalance)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-between gap-3 font-semibold">
              <span>Total</span>
              <span>{receiptPeso(order.net)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span>{order.paymentMethod || "Payment"}</span>
              <span>{receiptPeso(paymentAmount)}</span>
            </div>
            {change > 0 ? (
              <div className="flex justify-between gap-3">
                <span>Change</span>
                <span>{receiptPeso(change)}</span>
              </div>
            ) : null}
          </div>

          <div className="flex justify-between gap-3 pt-3 text-[11px] text-slate-500">
            <span>{displayDateTime(order.createdAt)}</span>
            <span>№ {order.orderNumber}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSalesPage() {
  const [activeTab, setActiveTab] = useState("summary");
  const [filters, setFilters] = useState(defaultFilters);
  const [rawData, setRawData] = useState({ sales: [], lineItems: [], shiftRecords: [], stores: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [receiptDetailItems, setReceiptDetailItems] = useState([]);
  const skippedInitialTabLoad = useRef(false);
  const searchParams = useSearchParams();

  async function loadData(nextFilters = filters, options = {}) {
    const reportTab = options.reportTab || activeTab;
    setLoading(true);
    setError("");
    const comparisonRange = previousRange(nextFilters.startDate, nextFilters.endDate);
    const start = `${comparisonRange.startDate}T00:00:00+08:00`;
    const fetchEnd = `${addDays(nextFilters.endDate, 1)}T12:00:00+08:00`;
    try {
      const [orders, webOrders, menuRes, storesRes, profilesRes, loyaltyRes, shiftRecords] = await Promise.all([
        fetchAllRows(() => supabase.from("orders").select("*").gte("created_at", start).lte("created_at", fetchEnd).order("created_at", { ascending: false })),
        fetchAllRows(() => supabase.from("web_orders").select("*").gte("created_at", start).lte("created_at", fetchEnd).order("created_at", { ascending: false })),
        supabase.from("menu_items").select("id,name,category,price"),
        supabase.from("stores").select("id,name").order("name"),
        supabase.from("profiles").select("id,full_name,email,role"),
        supabase.from("loyalty_members").select('id,customer_name,customer_code,"Phone","Available points","Points balance"'),
        fetchAllRows(() => supabase.from("cashier_pos").select("*").gte("created_at", start).lte("created_at", fetchEnd).order("created_at", { ascending: true })),
      ]);
      const errors = [menuRes.error, storesRes.error, profilesRes.error, loyaltyRes.error].filter(Boolean);
      if (errors.length) throw errors[0];

      const orderItems = ["items", "categories", "modifiers", "receipts", "exports"].includes(reportTab)
        ? await fetchOrderItems(orders.map((row) => row.id))
        : [];

      const normalized = normalizeSalesData({
        orders,
        orderItems,
        webOrders,
        menuItems: menuRes.data || [],
        profiles: profilesRes.data || [],
        stores: storesRes.data || [],
        loyaltyMembers: loyaltyRes.data || [],
        shiftRecords,
      });
      setRawData({
        ...normalized,
        stores: storesRes.data || [],
        shiftRecords,
      });
    } catch (err) {
      setError(err.message || "Unable to load sales report. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const tabAliases = {
      dashboard: "summary",
      sales: "receipts",
      products: "items",
      cashiers: "employees",
      voids: "receipts",
    };
    const requestedTab = searchParams.get("tab");
    const tab = tabAliases[requestedTab] || requestedTab;
    if (tab && REPORT_TABS.some((item) => item.key === tab)) setActiveTab(tab);
    if (!tab) setActiveTab("summary");
  }, [searchParams]);

  useEffect(() => {
    loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!skippedInitialTabLoad.current) {
      skippedInitialTabLoad.current = true;
      return;
    }
    loadData(filters, { reportTab: activeTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filtered = useMemo(() => applyFilters(rawData, filters), [rawData, filters]);
  const searchedSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return filtered.sales;
    return filtered.sales.filter((row) => [row.orderNumber, row.customerName, row.paymentMethod, row.orderType, row.cashierName, row.status].join(" ").toLowerCase().includes(term));
  }, [filtered.sales, search]);

  const summary = useMemo(() => getSalesSummary(filtered.sales), [filtered.sales]);
  const productRows = useMemo(() => getProductSalesReport(filtered.lineItems, summary.net), [filtered.lineItems, summary.net]);
  const categoryRows = useMemo(() => getCategorySalesReport(filtered.lineItems, summary.net), [filtered.lineItems, summary.net]);
  const paymentRows = useMemo(() => getPaymentReport(filtered.sales, summary.net), [filtered.sales, summary.net]);
  const discountRows = useMemo(() => getDiscountReport(filtered.sales), [filtered.sales]);
  const cashierRows = useMemo(() => getCashierReport(filtered.sales), [filtered.sales]);
  const voidRows = useMemo(() => getVoidRefundReport(filtered.sales), [filtered.sales]);
  const trendRows = useMemo(() => getSalesTrend(filtered.sales, filters.startDate, filters.endDate), [filtered.sales, filters.startDate, filters.endDate]);
  const shiftRows = useMemo(() => {
    const liveRows = buildShiftRows(rawData.shiftRecords || [], rawData.stores || [], filters);
    return liveRows.sort((a, b) => new Date(b.openedAt || b.closedAt || 0) - new Date(a.openedAt || a.closedAt || 0));
  }, [rawData.shiftRecords, rawData.stores, filters]);
  const pageRows = useMemo(() => searchedSales.slice((page - 1) * rowsPerPage, page * rowsPerPage), [searchedSales, page, rowsPerPage]);
  const selectedReceiptItems = receiptDetailItems;

  useEffect(() => {
    let cancelled = false;
    async function loadReceiptItems() {
      setReceiptDetailItems([]);
      if (!selectedOrder) return;
      const key = String(selectedOrder.orderKey || selectedOrder.id);
      const existing = rawData.lineItems.filter((item) => String(item.orderId) === key);
      if (existing.length) {
        setReceiptDetailItems(existing);
        return;
      }
      if (selectedOrder.source !== "POS") {
        setReceiptDetailItems([]);
        return;
      }
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", selectedOrder.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error(error);
        setReceiptDetailItems([]);
        return;
      }
      setReceiptDetailItems((data || []).map((item) => {
        const quantity = Number(item.quantity || 0);
        const net = Number(item.net_amount || item.line_total || 0);
        return {
          id: item.id,
          itemName: item.item_name || item.name || "Item",
          quantity,
          unitPrice: Number(item.unit_price || (quantity ? net / quantity : net)),
          net,
        };
      }));
    }
    loadReceiptItems();
    return () => {
      cancelled = true;
    };
  }, [rawData.lineItems, selectedOrder]);

  const paymentOptions = useMemo(() => [{ value: "All", label: "All payment methods" }, ...uniqueOptions(rawData.sales, "paymentMethod")], [rawData.sales]);
  const cashierOptions = useMemo(() => [{ value: "All", label: "All employees" }, ...uniqueOptions(rawData.sales, "cashierId", "cashierName")], [rawData.sales]);
  const categoryOptions = useMemo(() => [{ value: "All", label: "All categories" }, ...uniqueOptions(rawData.lineItems, "category")], [rawData.lineItems]);
  const productOptions = useMemo(() => [{ value: "All", label: "All products" }, ...uniqueOptions(rawData.lineItems, "itemId", "itemName")], [rawData.lineItems]);
  const branchOptions = useMemo(() => [{ value: "All", label: "All stores" }, ...uniqueOptions(rawData.sales, "storeId", "storeName")], [rawData.sales]);

  function updatePreset(preset) {
    const range = rangeFromPreset(preset);
    const next = { ...filters, preset, ...range };
    setFilters(next);
    setPage(1);
    loadData(next);
  }

  function updateFilter(key, value) {
    const next = { ...filters, [key]: value, preset: key === "startDate" || key === "endDate" ? "custom" : filters.preset };
    setFilters(next);
    setPage(1);
  }

  function updateSummaryFilters(patch) {
    const next = {
      ...filters,
      ...patch,
      preset: patch.preset || (patch.startDate || patch.endDate ? "custom" : filters.preset),
    };
    setFilters(next);
    setPage(1);
    loadData(next);
  }

  function shiftSummaryRange(direction) {
    const span = daysBetween(filters.startDate, filters.endDate);
    updateSummaryFilters({
      startDate: addDays(filters.startDate, direction * span),
      endDate: addDays(filters.endDate, direction * span),
      preset: "custom",
    });
  }

  function exportRows(kind) {
    const range = `${filters.startDate}-to-${filters.endDate}`;
    if (kind === "sales") exportReportToCSV(searchedSales, `juja-sales-report-${range}.csv`);
    if (kind === "products") exportReportToCSV(productRows, `juja-product-sales-${range}.csv`);
    if (kind === "categories") exportReportToCSV(categoryRows, `juja-category-sales-${range}.csv`);
    if (kind === "payments") exportReportToCSV(paymentRows, `juja-payment-sales-${range}.csv`);
    if (kind === "discounts") exportReportToCSV(discountRows, `juja-discounts-${range}.csv`);
    if (kind === "cashiers") exportReportToCSV(cashierRows, `juja-cashier-sales-${range}.csv`);
    if (kind === "voids") exportReportToCSV(voidRows, `juja-void-refund-${range}.csv`);
    if (kind === "shifts") exportReportToCSV(shiftRows, `juja-shifts-${range}.csv`);
  }

  const previous = previousRange(filters.startDate, filters.endDate);
  const previousSummary = getSalesSummary(applyFilters(rawData, { ...filters, startDate: previous.startDate, endDate: previous.endDate }).sales);
  const summaryDailyRows = [...trendRows].reverse();
  const metricDelta = (current, previousValue) => ({
    amount: Number(current || 0) - Number(previousValue || 0),
    percent: Number(previousValue || 0) ? ((Number(current || 0) - Number(previousValue || 0)) / Number(previousValue || 0)) * 100 : 0,
  });

  const salesColumns = [
    { key: "createdAt", label: "Date / Time", render: (row) => displayDateTime(row.createdAt) },
    { key: "orderNumber", label: "Order no.", emphasis: true },
    { key: "customerName", label: "Customer" },
    { key: "orderType", label: "Order type" },
    { key: "paymentMethod", label: "Payment" },
    { key: "gross", label: "Gross", align: "right", render: (row) => peso(row.gross) },
    { key: "discount", label: "Discount", align: "right", render: (row) => peso(row.discount) },
    { key: "net", label: "Net", align: "right", emphasis: true, render: (row) => peso(row.net) },
    { key: "cashierName", label: "Cashier" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="space-y-6">
      {activeTab !== "summary" && (
        <>
          <section className="rounded-[32px] border border-white/70 bg-slate-700/88 p-6 text-white shadow-[0_24px_80px_rgba(51,65,85,0.26)] backdrop-blur-xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">Admin Sales</p>
                <h1 className="mt-2 text-3xl font-semibold">Sales Report System</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-100">Daily, weekly, monthly, yearly, and custom analytics for POS and completed web orders.</p>
              </div>
              <button onClick={() => loadData(filters)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/12 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </section>

          <Card>
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr] xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
              <div className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date range</span>
                <SummaryDateRangeControl
                  startDate={filters.startDate}
                  endDate={filters.endDate}
                  preset={filters.preset}
                  onRangeChange={(startDate, endDate) => updateSummaryFilters({ startDate, endDate, preset: "custom" })}
                  onPresetChange={updatePreset}
                  buttonClassName="w-full justify-start"
                />
              </div>
              <SelectInput label="Branch" value={filters.branchId} onChange={(value) => updateFilter("branchId", value)} options={branchOptions} />
              <SelectInput label="Payment" value={filters.paymentMethod} onChange={(value) => updateFilter("paymentMethod", value)} options={paymentOptions} />
              <SelectInput label="Order type" value={filters.orderType} onChange={(value) => updateFilter("orderType", value)} options={ORDER_TYPE_OPTIONS} />
              <SelectInput label="Cashier" value={filters.cashierId} onChange={(value) => updateFilter("cashierId", value)} options={cashierOptions} />
              <SelectInput label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)} options={STATUS_OPTIONS} />
              <SelectInput label="Category" value={filters.categoryId} onChange={(value) => updateFilter("categoryId", value)} options={categoryOptions} />
              <SelectInput label="Product" value={filters.productId} onChange={(value) => updateFilter("productId", value)} options={productOptions} />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Filter className="h-4 w-4" /> Filters apply to every report tab.</div>
              <button onClick={() => loadData(filters)} className="rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/10 transition hover:-translate-y-0.5 hover:bg-cyan-600">Apply Filters</button>
            </div>
          </Card>
        </>
      )}

      {error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-3xl border border-white/70 bg-white/80 p-10 text-center text-sm font-semibold text-slate-500">Loading sales report...</div> : null}

      {!loading && activeTab === "summary" && (
        <div className="space-y-4">
          <div className="rounded-t-md bg-slate-700 px-4 py-3 shadow-sm">
            <h1 className="text-lg font-semibold text-white">Sales summary</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => shiftSummaryRange(-1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-cyan-50" aria-label="Previous range">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <SummaryDateRangeControl
              startDate={filters.startDate}
              endDate={filters.endDate}
              preset={filters.preset}
              onRangeChange={(startDate, endDate) => updateSummaryFilters({ startDate, endDate, preset: "custom" })}
              onPresetChange={updatePreset}
            />
            <button type="button" onClick={() => shiftSummaryRange(1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-cyan-50" aria-label="Next range">
              <ChevronRight className="h-4 w-4" />
            </button>
            <SummarySelectControl icon={Clock} value={filters.paymentMethod} onChange={(value) => updateSummaryFilters({ paymentMethod: value })} options={paymentOptions} allLabel="All day" />
            <SummarySelectControl icon={Store} value={filters.branchId} onChange={(value) => updateSummaryFilters({ branchId: value })} options={branchOptions} wide />
            <SummarySelectControl icon={UserRound} value={filters.cashierId} onChange={(value) => updateSummaryFilters({ cashierId: value })} options={cashierOptions} wide />
            <button onClick={() => loadData(filters)} className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-700 px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-600">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          <div className="overflow-hidden rounded-sm border border-slate-200 bg-white/94 shadow-[0_14px_38px_rgba(71,85,105,0.14)]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5">
              <SummaryMetricCell active label="Gross sales" value={peso(summary.gross)} delta={metricDelta(summary.gross, previousSummary.gross)} />
              <SummaryMetricCell label="Refunds" value={peso(summary.refund)} delta={metricDelta(summary.refund, previousSummary.refund)} />
              <SummaryMetricCell label="Discounts" value={peso(summary.discount)} delta={metricDelta(summary.discount, previousSummary.discount)} />
              <SummaryMetricCell label="Net sales" value={peso(summary.net)} delta={metricDelta(summary.net, previousSummary.net)} />
              <SummaryMetricCell label="Gross profit" value={peso(summary.net)} delta={metricDelta(summary.net, previousSummary.net)} />
            </div>

            <div className="border-t border-slate-200 px-5 py-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-medium text-slate-900">Gross sales</h2>
                <div className="flex gap-6 text-xs font-medium text-slate-600">
                  <button className="border-b border-slate-400 pb-2">Area</button>
                  <button className="border-b border-slate-400 pb-2">Days</button>
                </div>
              </div>
              <div className="h-[290px]">
                <ResponsiveContainer>
                  <AreaChart data={trendRows} margin={{ top: 12, right: 18, bottom: 12, left: 8 }}>
                    <defs>
                      <linearGradient id="summaryGross" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748b" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#64748b" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "#475569" }} angle={-45} textAnchor="end" height={58} />
                    <YAxis tickFormatter={(value) => peso(value).replace("PHP", "P")} tick={{ fontSize: 11, fill: "#475569" }} width={82} />
                    <Tooltip formatter={(value) => peso(value)} labelFormatter={displayDate} />
                    <Area type="monotone" dataKey="gross" stroke="#64748b" fill="url(#summaryGross)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <SummaryExportTable rows={summaryDailyRows} />
        </div>
      )}

      {!loading && activeTab === "receipts" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search order, customer, cashier..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white/85 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" /></div>
            <button onClick={() => exportRows("sales")} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"><Download className="h-4 w-4" /> Export CSV</button>
          </div>
          <DataTable columns={salesColumns} rows={pageRows} empty="No sales found for this date range." onView={setSelectedOrder} />
          <PaginationFooter
            page={page}
            totalRows={searchedSales.length}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={(value) => {
              setRowsPerPage(value);
              setPage(1);
            }}
          />
        </div>
      )}

      {!loading && activeTab === "items" && <ReportSection icon={PackageSearch} title="Sales by item" exportAction={() => exportRows("products")}><DataTable rows={productRows} empty="No item sales found." columns={[{ key: "productName", label: "Item", emphasis: true }, { key: "category", label: "Category" }, { key: "quantity", label: "Items sold", align: "right", render: (r) => number(r.quantity) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "discount", label: "Discounts", align: "right", render: (r) => peso(r.discount) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "averageSellingPrice", label: "Avg price", align: "right", render: (r) => peso(r.averageSellingPrice) }, { key: "share", label: "% sales", align: "right", render: (r) => `${r.share.toFixed(1)}%` }]} /></ReportSection>}
      {!loading && activeTab === "categories" && <ReportSection icon={BarChart3} title="Sales by category" exportAction={() => exportRows("categories")}><DataTable rows={categoryRows} empty="No category sales found." columns={[{ key: "category", label: "Category", emphasis: true }, { key: "quantity", label: "Items sold", align: "right", render: (r) => number(r.quantity) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "share", label: "% share", align: "right", render: (r) => `${r.share.toFixed(1)}%` }, { key: "orderCount", label: "Orders", align: "right", render: (r) => number(r.orderCount) }]} /></ReportSection>}
      {!loading && activeTab === "payments" && <ReportSection icon={WalletCards} title="Sales by payment type" exportAction={() => exportRows("payments")}><DataTable rows={paymentRows} empty="No payment sales found." columns={[{ key: "paymentMethod", label: "Payment type", emphasis: true }, { key: "transactions", label: "Transactions", align: "right", render: (r) => number(r.transactions) }, { key: "gross", label: "Gross amount", align: "right", render: (r) => peso(r.gross) }, { key: "discounts", label: "Discounts", align: "right", render: (r) => peso(r.discounts) }, { key: "refundTransactions", label: "Refund transactions", align: "right", render: (r) => number(r.refundTransactions) }, { key: "refunds", label: "Refund amount", align: "right", render: (r) => peso(r.refunds) }, { key: "net", label: "Net amount", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "share", label: "% share", align: "right", render: (r) => `${r.share.toFixed(1)}%` }]} /></ReportSection>}
      {!loading && activeTab === "discounts" && <ReportSection icon={FileText} title="Discounts" exportAction={() => exportRows("discounts")}><DataTable rows={discountRows} empty="No discounts found." columns={[{ key: "discountType", label: "Discount type", emphasis: true }, { key: "uses", label: "Uses", align: "right", render: (r) => number(r.uses) }, { key: "discountAmount", label: "Discount amount", align: "right", emphasis: true, render: (r) => peso(r.discountAmount) }, { key: "beforeDiscount", label: "Before discount", align: "right", render: (r) => peso(r.beforeDiscount) }, { key: "afterDiscount", label: "After discount", align: "right", render: (r) => peso(r.afterDiscount) }]} /></ReportSection>}
      {!loading && activeTab === "employees" && <ReportSection icon={UserRound} title="Sales by employee" exportAction={() => exportRows("cashiers")}><DataTable rows={cashierRows} empty="No employee sales found." columns={[{ key: "cashierName", label: "Employee", emphasis: true }, { key: "orders", label: "Orders", align: "right", render: (r) => number(r.orders) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "discounts", label: "Discounts", align: "right", render: (r) => peso(r.discounts) }, { key: "refunds", label: "Refunds", align: "right", render: (r) => peso(r.refunds) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "averageOrderValue", label: "AOV", align: "right", render: (r) => peso(r.averageOrderValue) }, { key: "paymentBreakdown", label: "Payment breakdown" }]} /></ReportSection>}
      {!loading && activeTab === "modifiers" && <ReportSection icon={PackageSearch} title="Sales by modifier" exportAction={() => exportRows("products")}><Empty message="Modifier-level sales are not stored separately yet. POS currently saves selected variants inside item notes/details, so this report needs modifier line persistence before totals can be exact." /></ReportSection>}
      {!loading && activeTab === "taxes" && <ReportSection icon={FileText} title="Taxes" exportAction={() => exportRows("sales")}><Empty message="No tax records found. The current POS flow does not store separate tax lines yet." /></ReportSection>}
      {!loading && activeTab === "shifts" && (
        <ShiftsTable
          rows={shiftRows}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(1);
          }}
          onSelect={setSelectedShift}
          onExport={() => exportRows("shifts")}
        />
      )}
      {!loading && activeTab === "exports" && (
        <Card>
          <h2 className="text-xl font-semibold text-slate-900">Export Reports</h2>
          <p className="mt-1 text-sm text-slate-500">Every export respects the active filters and date range.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[["sales", "Export Sales Report CSV"], ["products", "Export Product Sales CSV"], ["categories", "Export Category Sales CSV"], ["payments", "Export Payment Report CSV"], ["discounts", "Export Discount Report CSV"], ["cashiers", "Export Cashier Report CSV"], ["voids", "Export Void / Refund CSV"]].map(([key, label]) => (
              <button key={key} onClick={() => exportRows(key)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-4 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50"><Download className="h-4 w-4" /> {label}</button>
            ))}
          </div>
        </Card>
      )}

      <ReceiptDrawer order={selectedOrder} items={selectedReceiptItems} onClose={() => setSelectedOrder(null)} />
      <ShiftReportDrawer shift={selectedShift} onClose={() => setSelectedShift(null)} />
    </div>
  );
}

function ReportSection({ icon: Icon, title, exportAction, children }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700"><Icon className="h-5 w-5" /></div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        </div>
        <button onClick={exportAction} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"><Download className="h-4 w-4" /> Export CSV</button>
      </div>
      {children}
    </div>
  );
}
