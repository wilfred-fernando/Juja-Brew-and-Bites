"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Boxes, CalendarDays, RefreshCw, Save, Send, Table2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { convertQuantity, normalizeUnit } from "@/lib/inventory";
import { manilaDate, shiftBusinessDate } from "@/lib/businessDay";

const supabase = getSupabaseClient();
const today = () => manilaDate();

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function qty(value) {
  const amount = numberValue(value);
  return amount.toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

function dateRangeForManila(date) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function addDays(date, days) {
  const [year, month, day] = String(date || "").split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function Input(props) {
  return (
    <input
      {...props}
      className={`h-9 w-full min-w-20 rounded-lg border border-slate-200 bg-white/90 px-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-200/50 ${props.className || ""}`}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-200/50 ${props.className || ""}`}
    />
  );
}

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-white/70 bg-white/86 p-4 shadow-[0_20px_55px_rgba(51,65,85,0.12)] backdrop-blur-xl ${className}`}>
      {children}
    </section>
  );
}

export default function FinanceInventoryManager() {
  const [profile, setProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [inventoryDate, setInventoryDate] = useState(today());
  const [items, setItems] = useState([]);
  const [references, setReferences] = useState([]);
  const [dailyEntries, setDailyEntries] = useState([]);
  const [previousEntries, setPreviousEntries] = useState([]);
  const [purchaseLinks, setPurchaseLinks] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);
  const [pettyRows, setPettyRows] = useState([]);
  const [posTransactions, setPosTransactions] = useState([]);
  const [ordersById, setOrdersById] = useState({});
  const [transfers, setTransfers] = useState([]);
  const [edits, setEdits] = useState({});
  const [itemSearch, setItemSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [transferForm, setTransferForm] = useState({ inventory_item_id: "", from_store_id: "", to_store_id: "", bulk: "", small: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const isCashier = String(profile?.role || "").toLowerCase() === "cashier";
  const canChooseStore = !isCashier;

  const storeNameById = useMemo(() => Object.fromEntries(stores.map((store) => [String(store.id), store.name])), [stores]);

  const referencesByItem = useMemo(() => {
    const map = {};
    references.forEach((ref) => {
      map[normalizeText(ref.name)] = ref;
    });
    return map;
  }, [references]);
  const visibleItems = useMemo(() => {
    const itemTerm = normalizeText(itemSearch);
    const categoryTerm = normalizeText(categorySearch);
    return items.filter((item) => {
      const ref = itemReference(item);
      const itemText = normalizeText(`${item.item_name || ""} ${item.common_name || ""} ${ref?.common_name || ""}`);
      const categoryText = normalizeText(`${item.category || ""} ${ref?.item_category || ""}`);
      if (itemTerm && !itemText.includes(itemTerm)) return false;
      if (categoryTerm && !categoryText.includes(categoryTerm)) return false;
      return true;
    });
  }, [categorySearch, itemSearch, items, referencesByItem]);

  const entriesByItem = useMemo(() => Object.fromEntries(dailyEntries.map((row) => [row.inventory_item_id, row])), [dailyEntries]);
  const previousByItem = useMemo(() => Object.fromEntries(previousEntries.map((row) => [row.inventory_item_id, row])), [previousEntries]);

  function showNotice(type, message) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3500);
  }

  function itemReference(item) {
    return referencesByItem[normalizeText(item?.item_name)] || null;
  }

  function smallUnit(item) {
    const ref = itemReference(item);
    return normalizeUnit(ref?.reference_unit || item?.unit || "");
  }

  function referenceQuantity(item) {
    return numberValue(itemReference(item)?.reference_quantity);
  }

  function toBulk(item, amount, unit) {
    const value = numberValue(amount);
    const itemUnit = normalizeUnit(item?.unit);
    const fromUnit = normalizeUnit(unit);
    if (!value) return 0;
    if (!itemUnit || fromUnit === itemUnit) return value;
    const refQty = referenceQuantity(item);
    const refUnit = smallUnit(item);
    if (refQty > 0 && fromUnit === refUnit) return value / refQty;
    try {
      return convertQuantity(value, fromUnit, itemUnit);
    } catch {
      return value;
    }
  }

  function splitBulk(item, amount) {
    const value = numberValue(amount);
    const sign = value < 0 ? -1 : 1;
    const absoluteValue = Math.abs(value);
    const refQty = referenceQuantity(item);
    const itemUnit = normalizeUnit(item?.unit);
    const refUnit = smallUnit(item);
    if (!refQty || !refUnit || refUnit === itemUnit) {
      return { bulk: value, small: 0, bulkUnit: itemUnit || "", smallUnit: refUnit || itemUnit || "" };
    }
    const bulk = Math.trunc(absoluteValue) * sign;
    const small = Math.round((absoluteValue - Math.trunc(absoluteValue)) * refQty * 1000) / 1000 * sign;
    return { bulk, small, bulkUnit: itemUnit || "", smallUnit: refUnit };
  }

  function combineBulkSmall(item, bulk, small) {
    const refQty = referenceQuantity(item);
    const whole = numberValue(bulk);
    const remainder = numberValue(small);
    return refQty > 0 ? whole + (remainder / refQty) : whole + remainder;
  }

  function calculateSourceTotals({ purchaseLinks: linkRows = [], expenseRows: expenseList = [], pettyRows: pettyList = [], transfers: transferList = [], posTransactions: txList = [], ordersById: orderMap = {} }) {
    const purchases = {};
    const transferMap = {};
    const deductions = {};
    let purchaseRows = 0;
    const linkedExpenseIds = new Set();
    const expensePettyIds = new Set();

    linkRows.forEach((link) => {
      const item = items.find((row) => row.id === link.inventory_item_id);
      if (!item) return;
      linkedExpenseIds.add(String(link.expense_id));
      purchaseRows += 1;
      purchases[item.id] = (purchases[item.id] || 0) + toBulk(item, link.purchased_quantity, link.purchased_unit);
    });

    expenseList.forEach((expense) => {
      if (expense.petty_cash_entry_id) expensePettyIds.add(String(expense.petty_cash_entry_id));
      if (!expense.inventory_item_id || linkedExpenseIds.has(String(expense.id))) return;
      const item = items.find((row) => row.id === expense.inventory_item_id);
      if (!item) return;
      purchaseRows += 1;
      purchases[item.id] = (purchases[item.id] || 0) + toBulk(item, expense.quantity, expense.unit || item.unit);
    });

    pettyList.forEach((petty) => {
      if (!petty.inventory_item_id || expensePettyIds.has(String(petty.id))) return;
      const item = items.find((row) => row.id === petty.inventory_item_id);
      if (!item) return;
      purchaseRows += 1;
      purchases[item.id] = (purchases[item.id] || 0) + toBulk(item, petty.quantity, petty.unit || item.unit);
    });

    transferList.forEach((transfer) => {
      const item = items.find((row) => row.id === transfer.inventory_item_id);
      if (!item) return;
      const direction = String(transfer.from_store_id) === String(selectedStoreId) ? 1 : -1;
      transferMap[item.id] = (transferMap[item.id] || 0) + direction * toBulk(item, transfer.quantity, transfer.unit);
    });

    txList.forEach((tx) => {
      const order = orderMap[String(tx.reference_id)];
      if (!order || (String(order.store_id || order.branch_id) !== String(selectedStoreId))) return;
      const item = items.find((row) => row.id === tx.inventory_item_id);
      if (!item) return;
      deductions[item.id] = (deductions[item.id] || 0) + Math.abs(toBulk(item, tx.quantity_effect || tx.quantity, tx.unit));
    });

    return { purchases, transfers: transferMap, deductions, purchaseRows };
  }

  async function loadBase() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    const { data: profileRow, error: profileError } = userId
      ? await supabase.from("profiles").select("id, full_name, role, store_id").eq("id", userId).maybeSingle()
      : { data: null, error: null };
    if (profileError) {
      showNotice("error", profileError.message);
      setLoading(false);
      return;
    }

    const [storesRes, itemsRes, refsRes] = await Promise.all([
      supabase.from("stores").select("id, name, is_active, sort_order, created_at").order("sort_order").order("created_at"),
      supabase.from("inventory_items").select("id, item_name, common_name, common_name_id, category, unit, is_active").eq("is_active", true).order("item_name"),
      supabase.from("finance_references").select("name, common_name, item_category, reference_quantity, reference_unit, show_to_cashier").eq("ref_type", "item").eq("is_active", true),
    ]);

    const error = [storesRes.error, itemsRes.error, refsRes.error].find(Boolean);
    if (error) {
      showNotice("error", `Inventory setup failed: ${error.message}`);
      setLoading(false);
      return;
    }

    const visibleStores = (storesRes.data || [])
      .filter((store) => store.is_active !== false)
      .filter((store) => String(profileRow?.role || "").toLowerCase() !== "cashier" || String(store.id) === String(profileRow?.store_id));

    setProfile(profileRow || null);
    setStores(visibleStores);
    const profileIsCashier = String(profileRow?.role || "").toLowerCase() === "cashier";
    const referenceRows = (refsRes.data || []).filter((row) => !profileIsCashier || row.show_to_cashier !== false);
    const visibleItemNames = new Set(referenceRows.map((row) => normalizeText(row.name)));
    const itemRows = (itemsRes.data || []).filter((item) => !profileIsCashier || visibleItemNames.size === 0 || visibleItemNames.has(normalizeText(item.item_name)));
    setItems(itemRows);
    setReferences(referenceRows);
    setSelectedStoreId((prev) => {
      if (profileRow?.store_id && String(profileRow.role || "").toLowerCase() === "cashier") return profileRow.store_id;
      return prev && visibleStores.some((store) => String(store.id) === String(prev)) ? prev : visibleStores[0]?.id || "";
    });
    setLoading(false);
  }

  async function loadDailyData() {
    if (!selectedStoreId || !inventoryDate) return;
    setLoading(true);
    const previousDate = addDays(inventoryDate, -1);
    const { start, end } = dateRangeForManila(inventoryDate);

    const [entriesRes, historicalEntriesRes, transfersRes, expensesRes, pettyRes, txRes, historicalTransfersRes, historicalExpensesRes, historicalPettyRes, historicalTxRes, shiftRes] = await Promise.all([
      supabase.from("finance_daily_inventory_entries").select("*").eq("store_id", selectedStoreId).eq("inventory_date", inventoryDate),
      supabase.from("finance_daily_inventory_entries").select("*").eq("store_id", selectedStoreId).lte("inventory_date", previousDate).order("inventory_date").limit(10000),
      supabase.from("finance_inventory_transfers").select("*").eq("transfer_date", inventoryDate).or(`from_store_id.eq.${selectedStoreId},to_store_id.eq.${selectedStoreId}`),
      supabase.from("finance_expenses").select("id, expense_date, store_id, petty_cash_entry_id, inventory_item_id, quantity, unit").eq("expense_date", inventoryDate),
      supabase.from("finance_petty_cash_entries").select("id, expense_date, inventory_item_id, quantity, unit").eq("store_id", selectedStoreId).eq("expense_date", inventoryDate),
      supabase.from("inventory_transactions").select("*").eq("transaction_type", "pos_deduction").lt("created_at", addDays(inventoryDate, 2) + "T00:00:00+08:00").order("created_at").limit(10000),
      supabase.from("finance_inventory_transfers").select("*").lte("transfer_date", previousDate).or(`from_store_id.eq.${selectedStoreId},to_store_id.eq.${selectedStoreId}`).order("transfer_date").limit(10000),
      supabase.from("finance_expenses").select("id, expense_date, store_id, petty_cash_entry_id, inventory_item_id, quantity, unit").lte("expense_date", previousDate).order("expense_date").limit(10000),
      supabase.from("finance_petty_cash_entries").select("id, expense_date, inventory_item_id, quantity, unit").eq("store_id", selectedStoreId).lte("expense_date", previousDate).order("expense_date").limit(10000),
      supabase.from("inventory_transactions").select("*").eq("transaction_type", "pos_deduction").lt("created_at", start).order("created_at").limit(10000),
      supabase.from("cashier_pos").select("*").lte("created_at", addDays(inventoryDate, 2) + "T00:00:00+08:00").order("created_at").limit(10000),
    ]);

    const error = [entriesRes.error, historicalEntriesRes.error, transfersRes.error, expensesRes.error, pettyRes.error, txRes.error, historicalTransfersRes.error, historicalExpensesRes.error, historicalPettyRes.error, historicalTxRes.error, shiftRes.error].find(Boolean);
    if (error) {
      showNotice("error", `Daily inventory failed: ${error.message}`);
      setLoading(false);
      return;
    }

    const selectedPettyIds = new Set((pettyRes.data || []).map((row) => String(row.id)));
    const shiftRows = shiftRes.data || [];
    const currentTxRows = (txRes.data || []).filter((tx) => (
      shiftBusinessDate(tx.created_at, selectedStoreId, shiftRows) === inventoryDate
    ));
    const historicalTxRows = (historicalTxRes.data || []).filter((tx) => (
      shiftBusinessDate(tx.created_at, selectedStoreId, shiftRows) <= previousDate
    ));
    const relevantExpenses = (expensesRes.data || []).filter((row) => (
      String(row.store_id || "") === String(selectedStoreId)
      || (row.petty_cash_entry_id && selectedPettyIds.has(String(row.petty_cash_entry_id)))
    ));
    const expenseIds = relevantExpenses.map((row) => row.id);

    const historicalPettyIds = new Set((historicalPettyRes.data || []).map((row) => String(row.id)));
    const historicalRelevantExpenses = (historicalExpensesRes.data || []).filter((row) => (
      String(row.store_id || "") === String(selectedStoreId)
      || (row.petty_cash_entry_id && historicalPettyIds.has(String(row.petty_cash_entry_id)))
    ));
    const historicalExpenseIds = historicalRelevantExpenses.map((row) => row.id);

    const linksRes = expenseIds.length
      ? await supabase.from("expense_inventory_links").select("*").in("expense_id", expenseIds)
      : { data: [], error: null };
    const historicalLinksRes = historicalExpenseIds.length
      ? await supabase.from("expense_inventory_links").select("*").in("expense_id", historicalExpenseIds)
      : { data: [], error: null };

    const orderIds = [...new Set(currentTxRows
      .filter((tx) => tx.reference_type === "pos_order" && tx.reference_id)
      .map((tx) => tx.reference_id))];
    const historicalOrderIds = [...new Set(historicalTxRows
      .filter((tx) => tx.reference_type === "pos_order" && tx.reference_id)
      .map((tx) => tx.reference_id))];
    const ordersRes = orderIds.length
      ? await supabase.from("orders").select("id, store_id, branch_id").in("id", orderIds)
      : { data: [], error: null };
    const historicalOrdersRes = historicalOrderIds.length
      ? await supabase.from("orders").select("id, store_id, branch_id").in("id", historicalOrderIds)
      : { data: [], error: null };

    if (linksRes.error || historicalLinksRes.error || ordersRes.error || historicalOrdersRes.error) {
      showNotice("error", (linksRes.error || historicalLinksRes.error || ordersRes.error || historicalOrdersRes.error).message);
      setLoading(false);
      return;
    }

    const historicalOrdersById = Object.fromEntries((historicalOrdersRes.data || []).map((row) => [String(row.id), row]));
    const dates = [...new Set([
      ...(historicalEntriesRes.data || []).map((row) => row.inventory_date),
      ...historicalRelevantExpenses.map((row) => row.expense_date),
      ...(historicalPettyRes.data || []).map((row) => row.expense_date),
      ...(historicalTransfersRes.data || []).map((row) => row.transfer_date),
      ...historicalTxRows.map((row) => shiftBusinessDate(row.created_at, selectedStoreId, shiftRows)),
    ].filter(Boolean))].sort();
    const runningByItem = Object.fromEntries(items.map((item) => [item.id, 0]));

    dates.forEach((date) => {
      const savedByItem = Object.fromEntries((historicalEntriesRes.data || [])
        .filter((row) => row.inventory_date === date)
        .map((row) => [row.inventory_item_id, row]));
      const dateSources = calculateSourceTotals({
        purchaseLinks: (historicalLinksRes.data || []).filter((link) => {
          const expense = historicalRelevantExpenses.find((row) => row.id === link.expense_id);
          return expense?.expense_date === date;
        }),
        expenseRows: historicalRelevantExpenses.filter((row) => row.expense_date === date),
        pettyRows: (historicalPettyRes.data || []).filter((row) => row.expense_date === date),
        transfers: (historicalTransfersRes.data || []).filter((row) => row.transfer_date === date),
        posTransactions: historicalTxRows.filter((row) => shiftBusinessDate(row.created_at, selectedStoreId, shiftRows) === date),
        ordersById: historicalOrdersById,
      });

      items.forEach((item) => {
        const saved = savedByItem[item.id];
        if (saved) {
          runningByItem[item.id] = numberValue(saved.ending_quantity);
          return;
        }
        runningByItem[item.id] += numberValue(dateSources.purchases[item.id])
          - numberValue(dateSources.transfers[item.id])
          - numberValue(dateSources.deductions[item.id]);
      });
    });
    const previousComputedEntries = items.map((item) => ({
      inventory_item_id: item.id,
      ending_quantity: runningByItem[item.id] || 0,
    }));

    setDailyEntries(entriesRes.data || []);
    setPreviousEntries(previousComputedEntries);
    setTransfers(transfersRes.data || []);
    setPurchaseLinks(linksRes.data || []);
    setExpenseRows(relevantExpenses);
    setPettyRows(pettyRes.data || []);
    setPosTransactions(currentTxRows);
    setOrdersById(Object.fromEntries((ordersRes.data || []).map((row) => [String(row.id), row])));
    setEdits({});
    setTransferForm((prev) => ({
      ...prev,
      from_store_id: prev.from_store_id || selectedStoreId,
      to_store_id: prev.to_store_id && String(prev.to_store_id) !== String(selectedStoreId) ? prev.to_store_id : "",
    }));
    setLoading(false);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadDailyData();
  }, [selectedStoreId, inventoryDate]);

  const sourceTotals = useMemo(() => {
    return calculateSourceTotals({
      purchaseLinks,
      expenseRows,
      pettyRows,
      transfers,
      posTransactions,
      ordersById,
    });
  }, [expenseRows, items, ordersById, pettyRows, posTransactions, purchaseLinks, selectedStoreId, transfers]);

  const rows = useMemo(() => items.map((item) => {
    const saved = entriesByItem[item.id];
    const previous = previousByItem[item.id];
    const edit = edits[item.id] || {};
    const beginning = numberValue(previous?.ending_quantity);
    const reorder = numberValue(sourceTotals.purchases[item.id]);
    const transfer = numberValue(sourceTotals.transfers[item.id]);
    const posDeduction = numberValue(sourceTotals.deductions[item.id]);
    const manual = edit.manual != null ? numberValue(edit.manual) : numberValue(saved?.manual_adjustment_quantity);
    const computedEnding = beginning + reorder - transfer - posDeduction + manual;
    const ending = computedEnding;
    return { item, saved, beginning, reorder, total: beginning + reorder, transfer, posDeduction, manual, ending, note: edit.note ?? saved?.manual_adjustment_note ?? "", computedEnding };
  }), [edits, entriesByItem, items, previousByItem, sourceTotals]);
  const visibleRows = useMemo(() => {
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    return rows.filter((row) => visibleIds.has(row.item.id));
  }, [rows, visibleItems]);

  const summary = useMemo(() => rows.reduce((acc, row) => {
    acc.reorder += row.reorder;
    acc.deductions += row.posDeduction;
    acc.manual += row.manual;
    return acc;
  }, { reorder: 0, deductions: 0, manual: 0 }), [rows]);

  function updateRow(item, field, value) {
    setEdits((prev) => {
      const next = { ...(prev[item.id] || {}) };
      if (field === "manualBulk" || field === "manualSmall") {
        const split = splitBulk(item, next.manual ?? (entriesByItem[item.id]?.manual_adjustment_quantity || 0));
        const bulk = field === "manualBulk" ? value : next.manualBulk ?? split.bulk;
        const small = field === "manualSmall" ? value : next.manualSmall ?? split.small;
        next.manualBulk = bulk;
        next.manualSmall = small;
        next.manual = combineBulkSmall(item, bulk, small);
      } else {
        next[field] = value;
      }
      return { ...prev, [item.id]: next };
    });
  }

  async function saveDailyInventory() {
    if (!selectedStoreId) return showNotice("error", "Select store first.");
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    const payload = rows.map((row) => ({
      inventory_date: inventoryDate,
      store_id: selectedStoreId,
      inventory_item_id: row.item.id,
      beginning_quantity: row.beginning,
      reorder_quantity: row.reorder,
      transfer_quantity: row.transfer,
      pos_deduction_quantity: row.posDeduction,
      manual_adjustment_quantity: row.manual,
      manual_adjustment_note: row.note || null,
      ending_quantity: row.ending,
      created_by: row.saved?.created_by || userId,
      updated_by: userId,
    }));
    const { error } = await supabase
      .from("finance_daily_inventory_entries")
      .upsert(payload, { onConflict: "inventory_date,store_id,inventory_item_id" });
    setSaving(false);
    if (error) return showNotice("error", error.message);
    showNotice("success", "Daily inventory saved.");
    loadDailyData();
  }

  async function saveTransfer(e) {
    e.preventDefault();
    const item = items.find((row) => row.id === transferForm.inventory_item_id);
    if (!item) return showNotice("error", "Select item name.");
    if (!transferForm.from_store_id || !transferForm.to_store_id || transferForm.from_store_id === transferForm.to_store_id) {
      return showNotice("error", "Select different source and receiving stores.");
    }
    const amount = combineBulkSmall(item, transferForm.bulk, transferForm.small);
    if (amount <= 0) return showNotice("error", "Enter transfer quantity.");
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("finance_inventory_transfers").insert([{
      transfer_date: inventoryDate,
      inventory_item_id: item.id,
      from_store_id: transferForm.from_store_id,
      to_store_id: transferForm.to_store_id,
      quantity: amount,
      unit: normalizeUnit(item.unit),
      note: transferForm.note || null,
      created_by: sessionData?.session?.user?.id || null,
    }]);
    if (error) return showNotice("error", error.message);
    showNotice("success", "Transfer saved.");
    setTransferForm({ inventory_item_id: "", from_store_id: selectedStoreId, to_store_id: "", bulk: "", small: "", note: "" });
    loadDailyData();
  }

  function QuantityCell({ item, value, part = "bulk", muted = false }) {
    const split = splitBulk(item, value);
    const amount = part === "small" ? split.small : split.bulk;
    const unit = part === "small" ? split.smallUnit : split.bulkUnit;
    return (
      <div className={`grid grid-cols-[1fr_auto] gap-1 text-sm ${muted ? "text-slate-500" : "text-slate-950"}`}>
        <span className="text-right tabular-nums">{qty(amount)}</span>
        <span className="text-slate-500">{unit}</span>
      </div>
    );
  }

  function ManualInput({ item, row, part }) {
    const edit = edits[item.id] || {};
    const split = splitBulk(item, row.manual);
    const value = part === "small" ? edit.manualSmall ?? split.small : edit.manualBulk ?? split.bulk;
    const unit = part === "small" ? split.smallUnit : split.bulkUnit;
    return (
      <div className="relative mx-auto w-24">
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => updateRow(item, part === "small" ? "manualSmall" : "manualBulk", e.target.value)}
          className="h-8 min-w-0 pr-9 text-right"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 max-w-8 -translate-y-1/2 truncate text-[10px] font-semibold uppercase text-slate-500">
          {unit}
        </span>
      </div>
    );
  }

  if (loading && !items.length) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-5">
      {notice ? (
        <div className={`fixed right-4 top-20 z-[250] rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.message}
        </div>
      ) : null}

      <section className="rounded-3xl border border-sky-200/40 bg-slate-600/92 p-5 text-white shadow-[0_24px_70px_rgba(51,65,85,0.24)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100">Finance Inventory Control</p>
            <h1 className="mt-1 text-3xl font-semibold">Daily Inventory</h1>
            <p className="mt-2 max-w-3xl text-sm text-sky-50">
              Beginning comes from the previous day ending count. Reorder comes from inventory purchases in Expenses. POS deduction uses recipe ingredient movements.
            </p>
          </div>
          <button onClick={loadDailyData} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/12 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-white/20">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </section>

      <Card>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Inventory Date
            <div className="relative mt-1">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="date" value={inventoryDate} onChange={(e) => setInventoryDate(e.target.value)} className="pl-9" />
            </div>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Store
            <Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} disabled={!canChooseStore}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </Select>
          </label>
          <button onClick={saveDailyInventory} disabled={saving || !rows.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_16px_34px_rgba(3,105,161,0.22)] transition hover:-translate-y-0.5 hover:bg-sky-600 disabled:bg-slate-300">
            <Save size={15} /> {saving ? "Saving..." : "Save Daily Inventory"}
          </button>
        </div>
        {sourceTotals.purchaseRows === 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No reorder purchases found for {storeNameById[String(selectedStoreId)] || "selected store"} on {inventoryDate}. Check the store/date, or set the Inventory Store when saving an Overall Expense purchase.
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Found {sourceTotals.purchaseRows} reorder purchase{sourceTotals.purchaseRows === 1 ? "" : "s"} for this store/date.
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder Purchases</p><p className="mt-2 text-2xl font-semibold text-slate-950">{qty(summary.reorder)}</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">POS Auto Deduct</p><p className="mt-2 text-2xl font-semibold text-slate-950">{qty(summary.deductions)}</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Manual Adjustment</p><p className="mt-2 text-2xl font-semibold text-slate-950">{qty(summary.manual)}</p></Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-sky-700" />
          <h2 className="text-lg font-semibold text-slate-950">Store Transfer</h2>
        </div>
        <form onSubmit={saveTransfer} className="grid gap-3 lg:grid-cols-6">
          <Select value={transferForm.inventory_item_id} onChange={(e) => setTransferForm((p) => ({ ...p, inventory_item_id: e.target.value }))}>
            <option value="">Select item</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}
          </Select>
          <Select value={transferForm.from_store_id} onChange={(e) => setTransferForm((p) => ({ ...p, from_store_id: e.target.value }))}>
            <option value="">From store</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </Select>
          <Select value={transferForm.to_store_id} onChange={(e) => setTransferForm((p) => ({ ...p, to_store_id: e.target.value }))}>
            <option value="">To store</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </Select>
          <Input placeholder="Bulk qty" value={transferForm.bulk} onChange={(e) => setTransferForm((p) => ({ ...p, bulk: e.target.value }))} />
          <Input placeholder="Small qty" value={transferForm.small} onChange={(e) => setTransferForm((p) => ({ ...p, small: e.target.value }))} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-sky-600"><Send size={14} /> Save Transfer</button>
          <Input placeholder="Transfer note" value={transferForm.note} onChange={(e) => setTransferForm((p) => ({ ...p, note: e.target.value }))} className="lg:col-span-6" />
        </form>
      </Card>

      <Card className="p-0">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-sky-700" />
            <h2 className="text-lg font-semibold text-slate-950">{storeNameById[String(selectedStoreId)] || "Store"} Inventory Form</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[520px]">
            <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Item Category
              <Input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Search category" className="mt-1" />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Item Name
              <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search item name" className="mt-1" />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1680px] border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-800">
              <tr className="border-b border-slate-300 text-center text-[11px] font-semibold uppercase tracking-[0.12em]">
                <th rowSpan={2} className="border-r border-slate-300 px-3 py-3 text-left">Item Name</th>
                <th rowSpan={2} className="border-r border-slate-300 px-3 py-3 text-left">Common Name</th>
                <th colSpan={2} className="border-r border-slate-300 px-3 py-2">Reference</th>
                <th colSpan={2} className="border-r border-slate-300 px-3 py-2">Beginning</th>
                <th className="border-r border-slate-300 px-3 py-2">Reorder</th>
                <th colSpan={2} className="border-r border-slate-300 px-3 py-2">Total</th>
                <th colSpan={2} className="border-r border-slate-300 px-3 py-2">Transfer</th>
                <th className="w-[88px] border-r border-slate-300 px-2 py-2">POS Auto Deduct</th>
                <th colSpan={3} className="border-r border-slate-300 px-2 py-2">Manual Adjustment</th>
                <th colSpan={2} className="w-[170px] px-4 py-2">Ending</th>
              </tr>
              <tr className="border-b border-slate-300 text-center text-[10px] font-semibold uppercase tracking-[0.12em]">
                <th className="border-r border-slate-300 px-3 py-2">Qty</th>
                <th className="border-r border-slate-300 px-3 py-2">Unit</th>
                <th className="border-r border-slate-300 px-2 py-2">Bulk</th>
                <th className="border-r border-slate-300 px-2 py-2">Small</th>
                <th className="border-r border-slate-300 px-3 py-2">Bulk</th>
                <th className="border-r border-slate-300 px-3 py-2">Bulk</th>
                <th className="w-[88px] border-r border-slate-300 px-2 py-2">Small</th>
                <th className="border-r border-slate-300 px-3 py-2">Bulk</th>
                <th className="border-r border-slate-300 px-3 py-2">Small</th>
                <th className="border-r border-slate-300 px-3 py-2">Small</th>
                <th className="border-r border-slate-300 px-3 py-2">Bulk</th>
                <th className="border-r border-slate-300 px-3 py-2">Small</th>
                <th className="border-r border-slate-300 px-3 py-2">Note</th>
                <th className="w-[86px] border-r border-slate-300 px-4 py-2">Bulk</th>
                <th className="w-[86px] px-4 py-2">Small</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white/82">
              {visibleRows.map((row) => {
                const ref = itemReference(row.item);
                const posSmall = splitBulk(row.item, row.posDeduction);
                return (
                  <tr key={row.item.id} className="transition hover:bg-sky-50/55">
                    <td className="border-r border-slate-200 px-3 py-3 font-semibold text-slate-950">{row.item.item_name}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-slate-700">{row.item.common_name || ref?.common_name || "-"}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-right tabular-nums">{ref?.reference_quantity ? qty(ref.reference_quantity) : "1"}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-slate-600">{normalizeUnit(ref?.reference_unit || row.item.unit)}</td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.beginning} part="bulk" muted /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.beginning} part="small" muted /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.reorder} part="bulk" /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.total} part="bulk" /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.total} part="small" /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.transfer} part="bulk" /></td>
                    <td className="border-r border-slate-200 px-3 py-3"><QuantityCell item={row.item} value={row.transfer} part="small" /></td>
                    <td className="border-r border-slate-200 px-2 py-3 text-right text-xs tabular-nums text-red-700">{qty(posSmall.small || posSmall.bulk)} {posSmall.smallUnit}</td>
                    <td className="border-r border-slate-200 px-1.5 py-2"><ManualInput item={row.item} row={row} part="bulk" /></td>
                    <td className="border-r border-slate-200 px-1.5 py-2"><ManualInput item={row.item} row={row} part="small" /></td>
                    <td className="border-r border-slate-200 px-2 py-2"><Input value={row.note} onChange={(e) => updateRow(row.item, "note", e.target.value)} placeholder="Note" /></td>
                    <td className="border-r border-slate-200 bg-sky-50/50 px-4 py-3 font-semibold"><QuantityCell item={row.item} value={row.ending} part="bulk" /></td>
                    <td className="bg-sky-50/50 px-4 py-3 font-semibold"><QuantityCell item={row.item} value={row.ending} part="small" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleRows.length ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <Boxes className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              No inventory items found.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
