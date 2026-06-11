"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Filter,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  RotateCcw,
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
  defaultFilters,
  displayDate,
  displayDateTime,
  getCashierReport,
  getCategorySalesReport,
  getDiscountReport,
  getHourlySales,
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
const chartColors = ["#0891b2", "#475569", "#64748b", "#0f766e", "#7c3aed", "#dc2626", "#ca8a04"];
const PAGE_SIZE = 12;

function DateInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

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
    <div className={`rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_55px_rgba(71,85,105,0.14)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-200 ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, tone = "cyan" }) {
  const tones = {
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
    teal: "bg-teal-50 text-teal-700 border-teal-100",
  };
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tones[tone] || tones.cyan}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
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
            {columns.map((column) => <th key={column.key} className={`px-4 py-4 font-semibold ${column.align === "right" ? "text-right" : ""}`}>{column.label}</th>)}
            {onView ? <th className="px-4 py-4 text-right font-semibold">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.orderNumber || row.productName || row.category || index} className="text-slate-700 transition hover:bg-cyan-50/45">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-4 ${column.align === "right" ? "text-right tabular-nums" : ""} ${column.emphasis ? "font-semibold text-slate-950" : ""}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
              {onView ? (
                <td className="px-4 py-4 text-right">
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

function ReceiptDrawer({ order, onClose }) {
  if (!order) return null;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/35 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Receipt Details</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{order.orderNumber}</h2>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full border border-slate-200 bg-slate-50 text-slate-700">x</button>
        </div>
        <div className="mt-5 space-y-4 text-sm text-slate-700">
          {[
            ["Date", displayDateTime(order.createdAt)],
            ["Customer", order.customerName],
            ["Order type", order.orderType],
            ["Payment", order.paymentMethod],
            ["Cashier", order.cashierName],
            ["Store", order.storeName],
            ["Status", order.status],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <span className="text-slate-500">{label}</span>
              <span className="text-right font-semibold text-slate-900">{value}</span>
            </div>
          ))}
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex justify-between"><span>Gross</span><span>{peso(order.gross)}</span></div>
            <div className="mt-2 flex justify-between text-red-600"><span>Discount</span><span>({peso(order.discount)})</span></div>
            <div className="mt-2 flex justify-between text-red-600"><span>Refund / Void</span><span>({peso(order.refund)})</span></div>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-semibold text-slate-950"><span>Net</span><span>{peso(order.net)}</span></div>
          </div>
          <button onClick={() => window.print()} className="w-full rounded-2xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-600">Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSalesPage() {
  const [activeTab, setActiveTab] = useState("summary");
  const [filters, setFilters] = useState(defaultFilters);
  const [rawData, setRawData] = useState({ sales: [], lineItems: [] });
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const searchParams = useSearchParams();

  async function loadData(nextFilters = filters) {
    setLoading(true);
    setError("");
    const comparisonRange = previousRange(nextFilters.startDate, nextFilters.endDate);
    const start = `${comparisonRange.startDate}T00:00:00+08:00`;
    const end = `${nextFilters.endDate}T23:59:59+08:00`;
    try {
      const [ordersRes, webRes, menuRes, storesRes, profilesRes] = await Promise.all([
        supabase.from("orders").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(5000),
        supabase.from("web_orders").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(5000),
        supabase.from("menu_items").select("id,name,category,price"),
        supabase.from("stores").select("id,name").order("name"),
        supabase.from("profiles").select("id,full_name,email,role"),
      ]);
      const errors = [ordersRes.error, webRes.error, menuRes.error, storesRes.error, profilesRes.error].filter(Boolean);
      if (errors.length) throw errors[0];

      const orderIds = (ordersRes.data || []).map((row) => row.id);
      const itemsRes = orderIds.length
        ? await supabase.from("order_items").select("*").in("order_id", orderIds)
        : { data: [], error: null };
      if (itemsRes.error) throw itemsRes.error;

      setStores(storesRes.data || []);
      setRawData(
        normalizeSalesData({
          orders: ordersRes.data || [],
          orderItems: itemsRes.data || [],
          webOrders: webRes.data || [],
          menuItems: menuRes.data || [],
          profiles: profilesRes.data || [],
          stores: storesRes.data || [],
        })
      );
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
  const hourlyRows = useMemo(() => getHourlySales(filtered.sales), [filtered.sales]);
  const pageRows = useMemo(() => searchedSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [searchedSales, page]);

  const paymentOptions = useMemo(() => [{ value: "All", label: "All payment methods" }, ...uniqueOptions(rawData.sales, "paymentMethod")], [rawData.sales]);
  const cashierOptions = useMemo(() => [{ value: "All", label: "All employees" }, ...uniqueOptions(rawData.sales, "cashierId", "cashierName")], [rawData.sales]);
  const categoryOptions = useMemo(() => [{ value: "All", label: "All categories" }, ...uniqueOptions(rawData.lineItems, "category")], [rawData.lineItems]);
  const productOptions = useMemo(() => [{ value: "All", label: "All products" }, ...uniqueOptions(rawData.lineItems, "itemId", "itemName")], [rawData.lineItems]);
  const branchOptions = useMemo(() => [{ value: "All", label: "All stores" }, ...stores.map((store) => ({ value: String(store.id), label: store.name }))], [stores]);

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

  function exportRows(kind) {
    const range = `${filters.startDate}-to-${filters.endDate}`;
    if (kind === "sales") exportReportToCSV(searchedSales, `juja-sales-report-${range}.csv`);
    if (kind === "products") exportReportToCSV(productRows, `juja-product-sales-${range}.csv`);
    if (kind === "categories") exportReportToCSV(categoryRows, `juja-category-sales-${range}.csv`);
    if (kind === "payments") exportReportToCSV(paymentRows, `juja-payment-sales-${range}.csv`);
    if (kind === "discounts") exportReportToCSV(discountRows, `juja-discounts-${range}.csv`);
    if (kind === "cashiers") exportReportToCSV(cashierRows, `juja-cashier-sales-${range}.csv`);
    if (kind === "voids") exportReportToCSV(voidRows, `juja-void-refund-${range}.csv`);
  }

  const cardSub = `${displayDate(filters.startDate)} - ${displayDate(filters.endDate)}`;
  const previous = previousRange(filters.startDate, filters.endDate);
  const previousSummary = getSalesSummary(applyFilters(rawData, { ...filters, startDate: previous.startDate, endDate: previous.endDate }).sales);
  const netDelta = previousSummary.net ? ((summary.net - previousSummary.net) / previousSummary.net) * 100 : 0;
  const bestProduct = productRows[0]?.productName || "No sales yet";
  const bestCategory = categoryRows[0]?.category || "No category yet";

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
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr] xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          <SelectInput label="Date range" value={filters.preset} onChange={updatePreset} options={[
            { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "this_week", label: "This week" }, { value: "last_week", label: "Last week" }, { value: "this_month", label: "This month" }, { value: "last_month", label: "Last month" }, { value: "this_year", label: "This year" }, { value: "custom", label: "Custom date range" },
          ]} />
          <DateInput label="Start date" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
          <DateInput label="End date" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
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

      {error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-3xl border border-white/70 bg-white/80 p-10 text-center text-sm font-semibold text-slate-500">Loading sales report...</div> : null}

      {!loading && activeTab === "summary" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Gross Sales" value={peso(summary.gross)} sub={cardSub} icon={BarChart3} />
            <StatCard label="Net Sales" value={peso(summary.net)} sub={`${netDelta >= 0 ? "+" : ""}${netDelta.toFixed(1)}% vs previous range`} icon={WalletCards} tone="teal" />
            <StatCard label="Total Orders" value={number(summary.orders)} sub={`AOV ${peso(summary.averageOrderValue)}`} icon={ReceiptText} tone="slate" />
            <StatCard label="Refunds / Voids" value={peso(summary.refund)} sub={`Discounts ${peso(summary.discount)}`} icon={RotateCcw} tone="red" />
            <StatCard label="Cash Sales" value={peso(summary.cash)} sub="Cash payment total" icon={WalletCards} tone="slate" />
            <StatCard label="GCash / QRPH" value={peso(summary.gcash)} sub="Digital wallet total" icon={WalletCards} />
            <StatCard label="Card Sales" value={peso(summary.card)} sub="Card payment total" icon={WalletCards} tone="slate" />
            <StatCard label="Online Sales" value={peso(summary.online)} sub="Web / aggregator total" icon={Store} tone="teal" />
            <StatCard label="Best-Selling Item" value={bestProduct} sub={productRows[0] ? peso(productRows[0].net) : "No sales found"} icon={PackageSearch} />
            <StatCard label="Best Category" value={bestCategory} sub={categoryRows[0] ? peso(categoryRows[0].net) : "No sales found"} icon={BarChart3} tone="teal" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card><h2 className="mb-4 text-lg font-semibold text-slate-900">Sales trend</h2><div className="h-80"><ResponsiveContainer><AreaChart data={trendRows}><defs><linearGradient id="salesNet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.42}/><stop offset="95%" stopColor="#0891b2" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="date" tick={{ fontSize: 11 }}/><YAxis tickFormatter={(v) => `₱${Number(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }}/><Tooltip formatter={(v) => peso(v)} /><Area type="monotone" dataKey="net" stroke="#0891b2" fill="url(#salesNet)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></Card>
            <Card><h2 className="mb-4 text-lg font-semibold text-slate-900">Payment breakdown</h2><div className="h-80"><ResponsiveContainer><PieChart><Pie data={paymentRows} dataKey="net" nameKey="paymentMethod" outerRadius={110} label>{paymentRows.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(v) => peso(v)} /></PieChart></ResponsiveContainer></div></Card>
            <Card><h2 className="mb-4 text-lg font-semibold text-slate-900">Top-selling products</h2><div className="h-80"><ResponsiveContainer><BarChart data={productRows.slice(0, 10)}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="productName" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70}/><YAxis tick={{ fontSize: 11 }}/><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="net" fill="#0f766e" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            <Card><h2 className="mb-4 text-lg font-semibold text-slate-900">Hourly sales</h2><div className="h-80"><ResponsiveContainer><BarChart data={hourlyRows}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2}/><YAxis tick={{ fontSize: 11 }}/><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="net" fill="#475569" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          </div>
        </div>
      )}

      {!loading && activeTab === "receipts" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search order, customer, cashier..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white/85 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" /></div>
            <button onClick={() => exportRows("sales")} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"><Download className="h-4 w-4" /> Export CSV</button>
          </div>
          <DataTable columns={salesColumns} rows={pageRows} empty="No sales found for this date range." onView={setSelectedOrder} />
          <div className="flex justify-end gap-2">
            <button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-40">Previous</button>
            <button disabled={page * PAGE_SIZE >= searchedSales.length} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {!loading && activeTab === "items" && <ReportSection icon={PackageSearch} title="Sales by item" exportAction={() => exportRows("products")}><DataTable rows={productRows} empty="No item sales found." columns={[{ key: "productName", label: "Item", emphasis: true }, { key: "category", label: "Category" }, { key: "quantity", label: "Items sold", align: "right", render: (r) => number(r.quantity) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "discount", label: "Discounts", align: "right", render: (r) => peso(r.discount) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "averageSellingPrice", label: "Avg price", align: "right", render: (r) => peso(r.averageSellingPrice) }, { key: "share", label: "% sales", align: "right", render: (r) => `${r.share.toFixed(1)}%` }]} /></ReportSection>}
      {!loading && activeTab === "categories" && <ReportSection icon={BarChart3} title="Sales by category" exportAction={() => exportRows("categories")}><DataTable rows={categoryRows} empty="No category sales found." columns={[{ key: "category", label: "Category", emphasis: true }, { key: "quantity", label: "Items sold", align: "right", render: (r) => number(r.quantity) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "share", label: "% share", align: "right", render: (r) => `${r.share.toFixed(1)}%` }, { key: "orderCount", label: "Orders", align: "right", render: (r) => number(r.orderCount) }]} /></ReportSection>}
      {!loading && activeTab === "payments" && <ReportSection icon={WalletCards} title="Sales by payment type" exportAction={() => exportRows("payments")}><DataTable rows={paymentRows} empty="No payment sales found." columns={[{ key: "paymentMethod", label: "Payment type", emphasis: true }, { key: "transactions", label: "Transactions", align: "right", render: (r) => number(r.transactions) }, { key: "gross", label: "Gross amount", align: "right", render: (r) => peso(r.gross) }, { key: "discounts", label: "Discounts", align: "right", render: (r) => peso(r.discounts) }, { key: "refundTransactions", label: "Refund transactions", align: "right", render: (r) => number(r.refundTransactions) }, { key: "refunds", label: "Refund amount", align: "right", render: (r) => peso(r.refunds) }, { key: "net", label: "Net amount", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "share", label: "% share", align: "right", render: (r) => `${r.share.toFixed(1)}%` }]} /></ReportSection>}
      {!loading && activeTab === "discounts" && <ReportSection icon={FileText} title="Discounts" exportAction={() => exportRows("discounts")}><DataTable rows={discountRows} empty="No discounts found." columns={[{ key: "discountType", label: "Discount type", emphasis: true }, { key: "uses", label: "Uses", align: "right", render: (r) => number(r.uses) }, { key: "discountAmount", label: "Discount amount", align: "right", emphasis: true, render: (r) => peso(r.discountAmount) }, { key: "beforeDiscount", label: "Before discount", align: "right", render: (r) => peso(r.beforeDiscount) }, { key: "afterDiscount", label: "After discount", align: "right", render: (r) => peso(r.afterDiscount) }]} /></ReportSection>}
      {!loading && activeTab === "employees" && <ReportSection icon={UserRound} title="Sales by employee" exportAction={() => exportRows("cashiers")}><DataTable rows={cashierRows} empty="No employee sales found." columns={[{ key: "cashierName", label: "Employee", emphasis: true }, { key: "orders", label: "Orders", align: "right", render: (r) => number(r.orders) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "discounts", label: "Discounts", align: "right", render: (r) => peso(r.discounts) }, { key: "refunds", label: "Refunds", align: "right", render: (r) => peso(r.refunds) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "averageOrderValue", label: "AOV", align: "right", render: (r) => peso(r.averageOrderValue) }, { key: "paymentBreakdown", label: "Payment breakdown" }]} /></ReportSection>}
      {!loading && activeTab === "modifiers" && <ReportSection icon={PackageSearch} title="Sales by modifier" exportAction={() => exportRows("products")}><Empty message="Modifier-level sales are not stored separately yet. POS currently saves selected variants inside item notes/details, so this report needs modifier line persistence before totals can be exact." /></ReportSection>}
      {!loading && activeTab === "taxes" && <ReportSection icon={FileText} title="Taxes" exportAction={() => exportRows("sales")}><Empty message="No tax records found. The current POS flow does not store separate tax lines yet." /></ReportSection>}
      {!loading && activeTab === "shifts" && <ReportSection icon={CalendarDays} title="Shifts" exportAction={() => exportRows("cashiers")}><DataTable rows={cashierRows} empty="No shift sales found." columns={[{ key: "cashierName", label: "Employee", emphasis: true }, { key: "orders", label: "Orders", align: "right", render: (r) => number(r.orders) }, { key: "gross", label: "Gross sales", align: "right", render: (r) => peso(r.gross) }, { key: "net", label: "Net sales", align: "right", emphasis: true, render: (r) => peso(r.net) }, { key: "paymentBreakdown", label: "Payment breakdown" }]} /></ReportSection>}
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

      <ReceiptDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
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
