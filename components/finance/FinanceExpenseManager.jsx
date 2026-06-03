"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dateFormat";

const CATEGORY_OPTIONS = ["OP-EX", "PERSONAL"];
const PAYMENT_TYPES = ["CASH", "CHEQUE", "GCASH -9393", "GCASH -0668", "GCASH -8199", "CARD", "BANK TRANSFER"];
const UNIT_OPTIONS = ["pc", "pack", "box", "kilo", "sack", "cup", "tin", "lot", "month", "whole"];
const FUND_SOURCES = ["CASH SALES", "GCASH -9393", "GCASH -0668", "GCASH -8199", "CBS MRFS"];
const REF_TYPES = [
  ["item", "Item Name"],
  ["supplier", "Supplier"],
  ["payment_type", "Payment Type"],
  ["unit", "Unit"],
  ["category", "Category"],
  ["fund_source", "Source of Fund"],
];

const initialExpenseForm = {
  expense_date: new Date().toISOString().slice(0, 10),
  description: "",
  supplier_name: "",
  item_common_name: "",
  quantity: "1",
  unit: "",
  unit_price: "",
  discount: "",
  category: "OP-EX",
  payment_type: "CASH",
  cheque_no: "",
  cheque_date: "",
  cheque_amount: "",
  or_si_no: "",
  or_si_date: "",
  remarks: "",
  submitted_by: "",
};

const initialFundForm = {
  fund_date: new Date().toISOString().slice(0, 10),
  source_of_fund: "CASH SALES",
  particular: "",
  amount: "",
  submitted_by: "",
};

const initialReferenceForm = {
  ref_type: "item",
  name: "",
  common_name: "",
  notes: "",
  is_active: true,
};

const emptyDateFilter = {
  from: "",
  to: "",
};

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueOptions(...groups) {
  const seen = new Set();
  return groups
    .flat()
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalize(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function lineMath(form) {
  const quantity = numberValue(form.quantity || 1);
  const unitPrice = numberValue(form.unit_price);
  const discount = numberValue(form.discount);
  const subtotal = quantity * unitPrice;
  const total = Math.max(0, subtotal - discount);
  return { quantity, unitPrice, discount, subtotal, total };
}

function allocationFor(category, total) {
  return {
    opex: category === "OP-EX" ? total : 0,
    personal: category === "PERSONAL" ? total : 0,    
  };
}

function dateInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function isWithinDateFilter(value, filter) {
  const date = dateInputValue(value);
  if (!date) return false;
  if (filter.from && date < filter.from) return false;
  if (filter.to && date > filter.to) return false;
  return true;
}

function isWithinLast24Hours(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= 24 * 60 * 60 * 1000;
}

function dateText(value) {
  if (!value) return "-";
  return formatDate(value);
}

function shortStoreLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const upper = text.toUpperCase();
  if (upper.includes("PASONG")) return "PASONG TAMO";
  if (upper.includes("DILIMAN")) return "DILIMAN";

  return upper
    .replace(/^JUJA\s*(BREW\s*&\s*BITES|BNB)?\s*[-/]?\s*/i, "")
    .replace(/^BRANCH\s*[-/]?\s*/i, "")
    .trim() || upper;
}

function expenseSourceLabel(row, storeNameById) {
  if (row.entry_source === "petty_cash") {
    const storeName = row.store_name || storeNameById[row.store_id];
    return `PC/${shortStoreLabel(storeName)}`;
  }

  return String(row.source_tag || "Overall").toUpperCase();
}

function Field({ label, children }) {
  return (
    <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#FC687D]/60 ${props.className || ""}`}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#FC687D]/60 ${props.className || ""}`}
    />
  );
}

function SummaryCard({ label, value, icon: Icon, tone = "rose" }) {
  const tones = {
    rose: "bg-rose-50 text-[#FC687D] border-rose-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${tones[tone] || tones.rose}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-rose-100 bg-white p-6 text-center text-sm font-semibold text-slate-400">
      {message}
    </div>
  );
}

function Modal({ open, title, children, onClose, width = "max-w-5xl" }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-rose-950/40 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-2xl border border-rose-100 bg-white p-4 shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-rose-50 pb-3">
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function FinanceExpenseManager() {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState("overall");
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [overallExpenses, setOverallExpenses] = useState([]);
  const [pettyEntries, setPettyEntries] = useState([]);
  const [pettyFunds, setPettyFunds] = useState([]);
  const [references, setReferences] = useState([]);
  const [expenseForm, setExpenseForm] = useState(initialExpenseForm);
  const [pettyForm, setPettyForm] = useState(initialExpenseForm);
  const [fundForm, setFundForm] = useState(initialFundForm);
  const [referenceForm, setReferenceForm] = useState(initialReferenceForm);
  const [referenceFilter, setReferenceFilter] = useState("item");
  const [editingReferenceId, setEditingReferenceId] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingFund, setEditingFund] = useState(null);
  const [expenseModalScope, setExpenseModalScope] = useState("");
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [referenceModalOpen, setReferenceModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [overallDateFilter, setOverallDateFilter] = useState(emptyDateFilter);
  const [pettyDateFilter, setPettyDateFilter] = useState(emptyDateFilter);
  const [deleteRequests, setDeleteRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState(null);
  const [setupMissing, setSetupMissing] = useState(false);

  const userRole = String(currentProfile?.role || "").toLowerCase();
  const isCashier = userRole === "cashier";
  const canManageAll = userRole === "admin" || userRole === "super_admin";

  const storeNameById = useMemo(() => {
    const map = {};
    stores.forEach((store) => {
      map[store.id] = store.name;
    });
    return map;
  }, [stores]);

  const selectedStoreName = storeNameById[selectedStoreId] || "Select Store";

  const activeReferences = useMemo(
    () => references.filter((row) => row.is_active !== false),
    [references]
  );

  const referencesByType = useMemo(() => {
    const map = {};
    REF_TYPES.forEach(([key]) => {
      map[key] = activeReferences.filter((row) => row.ref_type === key);
    });
    return map;
  }, [activeReferences]);

  const itemReferences = referencesByType.item || [];
  const supplierReferences = referencesByType.supplier || [];
  const paymentTypeOptions = uniqueOptions(PAYMENT_TYPES, (referencesByType.payment_type || []).map((row) => row.name));
  const unitOptions = uniqueOptions(UNIT_OPTIONS, (referencesByType.unit || []).map((row) => row.name));
  const fundSourceOptions = uniqueOptions(FUND_SOURCES, (referencesByType.fund_source || []).map((row) => row.name));
  const categoryOptions = uniqueOptions(CATEGORY_OPTIONS, (referencesByType.category || []).map((row) => row.name));
  const commonNameOptions = uniqueOptions(itemReferences.map((row) => row.common_name).filter(Boolean));

  function commonNameForItem(itemName) {
    const match = itemReferences.find((row) => normalize(row.name) === normalize(itemName));
    return match?.common_name || "";
  }

  const filteredOverallExpenses = useMemo(
    () => overallExpenses.filter((row) => isWithinDateFilter(row.expense_date, overallDateFilter)),
    [overallDateFilter, overallExpenses]
  );

  const filteredPettyEntries = useMemo(
    () => pettyEntries.filter((entry) => isWithinDateFilter(entry.expense_date, pettyDateFilter)),
    [pettyDateFilter, pettyEntries]
  );

  const filteredPettyFunds = useMemo(
    () => pettyFunds.filter((fund) => isWithinDateFilter(fund.fund_date, pettyDateFilter)),
    [pettyDateFilter, pettyFunds]
  );

  const selectedStoreEntries = useMemo(
    () => filteredPettyEntries.filter((entry) => String(entry.store_id) === String(selectedStoreId)),
    [filteredPettyEntries, selectedStoreId]
  );

  const selectedStoreFunds = useMemo(
    () => filteredPettyFunds.filter((fund) => String(fund.store_id) === String(selectedStoreId)),
    [filteredPettyFunds, selectedStoreId]
  );

  const overallSummary = useMemo(() => {
    return filteredOverallExpenses.reduce(
      (acc, row) => {
        const total = numberValue(row.total);
        const allocation = allocationFor(row.category, total);
        acc.total += total;
        acc.opex += allocation.opex;
        acc.personal += allocation.personal;        
        return acc;
      },
      { total: 0, opex: 0, personal: 0 }
    );
  }, [filteredOverallExpenses]);

  const pettyStoreSummary = useMemo(() => {
    return stores.map((store) => {
      const fundTotal = filteredPettyFunds
        .filter((fund) => String(fund.store_id) === String(store.id))
        .reduce((sum, fund) => sum + numberValue(fund.amount), 0);
      const expenseTotal = filteredPettyEntries
        .filter((entry) => String(entry.store_id) === String(store.id))
        .reduce((sum, entry) => sum + numberValue(entry.total), 0);
      return {
        store,
        fundTotal,
        expenseTotal,
        cashOnHand: fundTotal - expenseTotal,
      };
    });
  }, [filteredPettyEntries, filteredPettyFunds, stores]);

  const selectedPettySummary = useMemo(() => {
    const funds = selectedStoreFunds.reduce((sum, fund) => sum + numberValue(fund.amount), 0);
    const expenses = selectedStoreEntries.reduce((sum, entry) => sum + numberValue(entry.total), 0);
    return { funds, expenses, cashOnHand: funds - expenses };
  }, [selectedStoreEntries, selectedStoreFunds]);

  function updateExpenseForm(scope, key, value) {
    const setter = scope === "overall" ? setExpenseForm : setPettyForm;
    setter((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "description") {
        const commonName = commonNameForItem(value);
        if (commonName) next.item_common_name = commonName;
      }
      return next;
    });
  }

  function showNotice(type, message) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function loadData() {
    setLoading(true);
    setSetupMissing(false);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    setCurrentUserId(userId);

    const { data: profile, error: profileError } = userId
      ? await supabase.from("profiles").select("full_name, role, store_id").eq("id", userId).maybeSingle()
      : { data: null, error: null };

    if (profileError) {
      showNotice("error", profileError.message);
      setLoading(false);
      return;
    }

    const profileRole = String(profile?.role || "").toLowerCase();
    const cashierStoreId = profileRole === "cashier" ? profile?.store_id || "" : "";
    setCurrentProfile(profile || null);

    const submittedBy = profile?.full_name || sessionData?.session?.user?.email || "";
    setExpenseForm((prev) => ({ ...prev, submitted_by: prev.submitted_by || submittedBy }));
    setPettyForm((prev) => ({ ...prev, submitted_by: prev.submitted_by || submittedBy }));
    setFundForm((prev) => ({ ...prev, submitted_by: prev.submitted_by || submittedBy }));

    const storesRes = await supabase
      .from("stores")
      .select("id, name, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (storesRes.error) {
      showNotice("error", storesRes.error.message);
      setLoading(false);
      return;
    }

    const activeStores = (storesRes.data || []).filter((store) => store.is_active !== false);
    const visibleStores = cashierStoreId
      ? activeStores.filter((store) => String(store.id) === String(cashierStoreId))
      : activeStores;
    setStores(visibleStores);
    setSelectedStoreId((prev) => {
      if (cashierStoreId) return cashierStoreId;
      return prev && visibleStores.some((store) => String(store.id) === String(prev)) ? prev : visibleStores[0]?.id || "";
    });
    if (profileRole === "cashier") setTab("petty");

    let overallQuery = supabase.from("finance_expenses").select("*").order("expense_date", { ascending: false }).limit(1000);
    let pettyQuery = supabase.from("finance_petty_cash_entries").select("*").order("expense_date", { ascending: false }).limit(1000);
    let fundsQuery = supabase.from("finance_petty_cash_funds").select("*").order("fund_date", { ascending: false }).limit(1000);
    let deleteRequestQuery = supabase.from("finance_delete_requests").select("*").order("requested_at", { ascending: false }).limit(200);

    if (cashierStoreId) {
      overallQuery = overallQuery.eq("entry_source", "petty_cash").eq("store_id", cashierStoreId);
      pettyQuery = pettyQuery.eq("store_id", cashierStoreId);
      fundsQuery = fundsQuery.eq("store_id", cashierStoreId);
      deleteRequestQuery = deleteRequestQuery.eq("store_id", cashierStoreId);
    }

    const [overallRes, pettyRes, fundsRes, referencesRes, deleteRequestsRes] = await Promise.all([
      overallQuery,
      pettyQuery,
      fundsQuery,
      supabase.from("finance_references").select("*").order("ref_type", { ascending: true }).order("name", { ascending: true }),
      deleteRequestQuery,
    ]);

    const tableError = [overallRes.error, pettyRes.error, fundsRes.error, referencesRes.error, deleteRequestsRes.error].find(Boolean);
    if (tableError) {
      setSetupMissing(true);
      setOverallExpenses([]);
      setPettyEntries([]);
      setPettyFunds([]);
      setReferences([]);
      setDeleteRequests([]);
      showNotice("error", "Run supabase/finance_expenses_setup.sql in Supabase first.");
      setLoading(false);
      return;
    }

    setOverallExpenses(overallRes.data || []);
    setPettyEntries(pettyRes.data || []);
    setPettyFunds(fundsRes.data || []);
    setReferences(referencesRes.data || []);
    setDeleteRequests(deleteRequestsRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isCashier) setTab("petty");
  }, [isCashier]);

  function buildExpensePayload(form, prefix, extra = {}) {
    const math = lineMath(form);
    return {
      id: makeId(prefix),
      expense_date: form.expense_date || new Date().toISOString().slice(0, 10),
      description: form.description.trim(),
      supplier_name: form.supplier_name.trim() || null,
      item_common_name: form.item_common_name.trim() || commonNameForItem(form.description) || null,
      quantity: math.quantity,
      unit: form.unit || null,
      unit_price: math.unitPrice,
      subtotal: math.subtotal,
      discount: math.discount,
      total: math.total,
      category: form.category || "OP-EX",
      payment_type: form.payment_type || null,
      cheque_no: form.cheque_no.trim() || null,
      cheque_date: form.cheque_date || null,
      cheque_amount: form.cheque_amount ? numberValue(form.cheque_amount) : null,
      or_si_no: form.or_si_no.trim() || null,
      or_si_date: form.or_si_date || null,
      remarks: form.remarks.trim() || null,
      submitted_by: form.submitted_by.trim() || null,
      created_by: currentUserId,
      ...extra,
    };
  }

  function expenseFormFromRow(row) {
    return {
      ...initialExpenseForm,
      expense_date: dateInputValue(row.expense_date) || initialExpenseForm.expense_date,
      description: row.description || "",
      supplier_name: row.supplier_name || "",
      item_common_name: row.item_common_name || "",
      quantity: String(row.quantity ?? "1"),
      unit: row.unit || "",
      unit_price: String(row.unit_price ?? ""),
      discount: String(row.discount ?? ""),
      category: row.category || "OP-EX",
      payment_type: row.payment_type || "",
      cheque_no: row.cheque_no || "",
      cheque_date: dateInputValue(row.cheque_date),
      cheque_amount: row.cheque_amount == null ? "" : String(row.cheque_amount),
      or_si_no: row.or_si_no || "",
      or_si_date: dateInputValue(row.or_si_date),
      remarks: row.remarks || "",
      submitted_by: row.submitted_by || expenseForm.submitted_by || pettyForm.submitted_by || "",
    };
  }

  function openExpenseModal(scope, row = null) {
    setEditingExpense(row ? { scope, row } : null);
    if (scope === "overall") {
      setExpenseForm(row ? expenseFormFromRow(row) : (prev) => ({ ...initialExpenseForm, submitted_by: prev.submitted_by }));
    } else {
      setPettyForm(row ? expenseFormFromRow(row) : (prev) => ({ ...initialExpenseForm, submitted_by: prev.submitted_by }));
      if (row?.store_id) setSelectedStoreId(row.store_id);
    }
    setExpenseModalScope(scope);
  }

  function closeExpenseModal() {
    setEditingExpense(null);
    setExpenseModalScope("");
  }

  function fundFormFromRow(row) {
    return {
      ...initialFundForm,
      fund_date: dateInputValue(row.fund_date) || initialFundForm.fund_date,
      source_of_fund: row.source_of_fund || "CASH SALES",
      particular: row.particular || "",
      amount: row.amount == null ? "" : String(row.amount),
      submitted_by: row.submitted_by || fundForm.submitted_by || "",
    };
  }

  function openFundModal(row = null) {
    setEditingFund(row || null);
    setFundForm(row ? fundFormFromRow(row) : (prev) => ({ ...initialFundForm, submitted_by: prev.submitted_by }));
    if (row?.store_id) setSelectedStoreId(row.store_id);
    setFundModalOpen(true);
  }

  function closeFundModal() {
    setEditingFund(null);
    setFundModalOpen(false);
  }

  async function saveOverallExpense(event) {
    event.preventDefault();
    if (!canManageAll) return showNotice("error", "Only admin accounts can manage overall expenses.");
    if (!expenseForm.description.trim()) return showNotice("error", "Description is required.");

    setSaving("overall");
    const submittedAt = new Date().toISOString();
    const payload = buildExpensePayload(expenseForm, "exp", {
      entry_source: "overall",
      source_tag: "Overall",
      date_submitted: submittedAt,
      created_at: submittedAt,
    });

    if (editingExpense?.row?.id) {
      payload.id = editingExpense.row.id;
      delete payload.created_at;
      delete payload.date_submitted;
      const { error } = await supabase.from("finance_expenses").update(payload).eq("id", editingExpense.row.id);
      if (error) {
        showNotice("error", error.message);
      } else {
        const pettyPatch = { ...payload };
        delete pettyPatch.entry_source;
        delete pettyPatch.source_tag;
        delete pettyPatch.store_name;
        delete pettyPatch.petty_cash_entry_id;
        if (editingExpense.row.petty_cash_entry_id) {
          await supabase
            .from("finance_petty_cash_entries")
            .update({ ...pettyPatch, id: editingExpense.row.petty_cash_entry_id, store_id: editingExpense.row.store_id })
            .eq("id", editingExpense.row.petty_cash_entry_id);
        }
        setOverallExpenses((prev) => prev.map((row) => (row.id === editingExpense.row.id ? { ...row, ...payload } : row)));
        if (editingExpense.row.petty_cash_entry_id) {
          setPettyEntries((prev) => prev.map((row) => (
            row.id === editingExpense.row.petty_cash_entry_id ? { ...row, ...pettyPatch, id: row.id, store_id: row.store_id } : row
          )));
        }
        closeExpenseModal();
        showNotice("success", "Overall expense updated.");
      }
      setSaving("");
      return;
    }

    const { error } = await supabase.from("finance_expenses").insert([payload]);
    if (error) {
      showNotice("error", error.message);
    } else {
      setOverallExpenses((prev) => [payload, ...prev]);
      setExpenseForm((prev) => ({ ...initialExpenseForm, submitted_by: prev.submitted_by }));
      closeExpenseModal();
      showNotice("success", "Overall expense saved.");
    }
    setSaving("");
  }

  async function savePettyExpense(event) {
    event.preventDefault();
    if (!selectedStoreId) return showNotice("error", "Select a store first.");
    if (isCashier && String(selectedStoreId) !== String(currentProfile?.store_id || "")) {
      return showNotice("error", "Cashier accounts can only use their assigned branch.");
    }
    if (!pettyForm.description.trim()) return showNotice("error", "Description is required.");

    setSaving("petty");
    const submittedAt = new Date().toISOString();
    const payload = buildExpensePayload(pettyForm, "pc_exp", {
      store_id: selectedStoreId,
      date_submitted: submittedAt,
      created_at: submittedAt,
    });

    if (editingExpense?.row?.id) {
      payload.id = editingExpense.row.id;
      delete payload.created_at;
      delete payload.date_submitted;
      const { error } = await supabase.from("finance_petty_cash_entries").update(payload).eq("id", editingExpense.row.id);
      if (error) {
        showNotice("error", error.message);
      } else {
        const overallPatch = {
          ...payload,
          entry_source: "petty_cash",
          source_tag: "Petty Cash",
          store_name: selectedStoreName,
          petty_cash_entry_id: editingExpense.row.id,
        };
        const overallUpdate = { ...overallPatch };
        delete overallUpdate.id;
        await supabase.from("finance_expenses").update(overallUpdate).eq("petty_cash_entry_id", editingExpense.row.id);
        setPettyEntries((prev) => prev.map((row) => (row.id === editingExpense.row.id ? { ...row, ...payload } : row)));
        setOverallExpenses((prev) => prev.map((row) => (
          row.petty_cash_entry_id === editingExpense.row.id ? { ...row, ...overallUpdate } : row
        )));
        closeExpenseModal();
        showNotice("success", `${selectedStoreName} petty cash expense updated.`);
      }
      setSaving("");
      return;
    }

    const { error } = await supabase.from("finance_petty_cash_entries").insert([payload]);
    if (error) {
      showNotice("error", error.message);
    } else {
      const overallPayload = {
        ...payload,
        id: makeId("exp"),
        entry_source: "petty_cash",
        source_tag: "Petty Cash",
        store_name: selectedStoreName,
        petty_cash_entry_id: payload.id,
      };
      const { error: overallError } = await supabase.from("finance_expenses").insert([overallPayload]);
      if (overallError) {
        await supabase.from("finance_petty_cash_entries").delete().eq("id", payload.id);
        showNotice("error", `Petty cash saved failed to sync overall expenses: ${overallError.message}`);
        setSaving("");
        return;
      }
      setPettyEntries((prev) => [payload, ...prev]);
      setOverallExpenses((prev) => [overallPayload, ...prev]);
      setPettyForm((prev) => ({ ...initialExpenseForm, submitted_by: prev.submitted_by }));
      closeExpenseModal();
      showNotice("success", `${selectedStoreName} petty cash expense saved.`);
    }
    setSaving("");
  }

  async function savePettyFund(event) {
    event.preventDefault();
    if (!selectedStoreId) return showNotice("error", "Select a store first.");
    if (isCashier && String(selectedStoreId) !== String(currentProfile?.store_id || "")) {
      return showNotice("error", "Cashier accounts can only use their assigned branch.");
    }
    if (!fundForm.amount || numberValue(fundForm.amount) <= 0) return showNotice("error", "Enter cash-in amount.");

    setSaving("fund");
    const submittedAt = new Date().toISOString();
    const payload = {
      id: makeId("pc_fund"),
      store_id: selectedStoreId,
      fund_date: fundForm.fund_date || new Date().toISOString().slice(0, 10),
      source_of_fund: fundForm.source_of_fund || "CASH SALES",
      particular: fundForm.particular.trim() || null,
      amount: numberValue(fundForm.amount),
      submitted_by: fundForm.submitted_by.trim() || null,
      date_submitted: submittedAt,
      created_at: submittedAt,
      created_by: currentUserId,
    };

    if (editingFund?.id) {
      payload.id = editingFund.id;
      delete payload.created_at;
      delete payload.date_submitted;
      const { error } = await supabase.from("finance_petty_cash_funds").update(payload).eq("id", editingFund.id);
      if (error) {
        showNotice("error", error.message);
      } else {
        setPettyFunds((prev) => prev.map((row) => (row.id === editingFund.id ? { ...row, ...payload } : row)));
        closeFundModal();
        showNotice("success", `${selectedStoreName} cash-in updated.`);
      }
      setSaving("");
      return;
    }

    const { error } = await supabase.from("finance_petty_cash_funds").insert([payload]);
    if (error) {
      showNotice("error", error.message);
    } else {
      setPettyFunds((prev) => [payload, ...prev]);
      setFundForm((prev) => ({ ...initialFundForm, submitted_by: prev.submitted_by }));
      closeFundModal();
      showNotice("success", `${selectedStoreName} cash-in saved.`);
    }
    setSaving("");
  }

  async function requestDeleteApproval(table, row) {
    if (!row?.id) return;
    const allowedCashierTables = ["finance_petty_cash_entries", "finance_petty_cash_funds"];
    if (!allowedCashierTables.includes(table)) {
      showNotice("error", "Cashier accounts cannot request deletion for this record.");
      return;
    }

    const rowStoreId = row.store_id || selectedStoreId;
    if (String(rowStoreId) !== String(currentProfile?.store_id || "")) {
      showNotice("error", "Cashier accounts can only request deletion for their assigned branch.");
      return;
    }

    const confirmed = window.confirm("Send delete request for admin approval?");
    if (!confirmed) return;

    setSaving(`delete_request_${row.id}`);
    const payload = {
      id: makeId("fin_del"),
      table_name: table,
      record_id: row.id,
      record_snapshot: row,
      store_id: rowStoreId,
      store_name: storeNameById[rowStoreId] || selectedStoreName,
      requested_by: currentUserId,
      requested_by_name: currentProfile?.full_name || row.submitted_by || "",
      status: "pending",
    };

    const { error } = await supabase.from("finance_delete_requests").insert([payload]);
    if (error) {
      showNotice("error", error.message);
    } else {
      setDeleteRequests((prev) => [payload, ...prev]);
      showNotice("success", "Delete request sent for admin approval.");
    }
    setSaving("");
  }

  async function removeRow(table, rowOrId) {
    const row = typeof rowOrId === "object" ? rowOrId : { id: rowOrId };
    const rowId = row.id;
    const cashierCanDeleteNow =
      isCashier
      && ["finance_petty_cash_entries", "finance_petty_cash_funds"].includes(table)
      && String(row.store_id || selectedStoreId) === String(currentProfile?.store_id || "")
      && isWithinLast24Hours(row.created_at || row.date_submitted);

    if (isCashier) {
      if (!cashierCanDeleteNow) {
        await requestDeleteApproval(table, row);
        return;
      }

      const confirmed = window.confirm("Delete this record? Cashier deletion is allowed within 24 hours.");
      if (!confirmed) return;

      if (table === "finance_petty_cash_entries") {
        await supabase.from("finance_expenses").delete().eq("petty_cash_entry_id", rowId);
      }

      const { error } = await supabase.from(table).delete().eq("id", rowId);
      if (error) {
        showNotice("error", error.message);
        return;
      }

      if (table === "finance_petty_cash_entries") {
        setPettyEntries((prev) => prev.filter((entry) => entry.id !== rowId));
        setOverallExpenses((prev) => prev.filter((entry) => entry.petty_cash_entry_id !== rowId));
      }
      if (table === "finance_petty_cash_funds") setPettyFunds((prev) => prev.filter((fund) => fund.id !== rowId));
      showNotice("success", "Record deleted.");
      return;
    }

    const confirmed = window.confirm("Delete this finance record?");
    if (!confirmed) return;

    if (table === "finance_petty_cash_entries") {
      await supabase.from("finance_expenses").delete().eq("petty_cash_entry_id", rowId);
    }

    if (table === "finance_expenses" && row.petty_cash_entry_id) {
      await supabase.from("finance_petty_cash_entries").delete().eq("id", row.petty_cash_entry_id);
    }

    const { error } = await supabase.from(table).delete().eq("id", rowId);
    if (error) {
      showNotice("error", error.message);
      return;
    }

    if (table === "finance_expenses") setOverallExpenses((prev) => prev.filter((row) => row.id !== rowId));
    if (table === "finance_petty_cash_entries") {
      setPettyEntries((prev) => prev.filter((row) => row.id !== rowId));
      setOverallExpenses((prev) => prev.filter((row) => row.petty_cash_entry_id !== rowId));
    }
    if (table === "finance_expenses" && row.petty_cash_entry_id) {
      setPettyEntries((prev) => prev.filter((entry) => entry.id !== row.petty_cash_entry_id));
    }
    if (table === "finance_petty_cash_funds") setPettyFunds((prev) => prev.filter((row) => row.id !== rowId));
    showNotice("success", "Record deleted.");
  }

  async function approveDeleteRequest(request) {
    if (!canManageAll) return;
    const confirmed = window.confirm("Approve this delete request and remove the record?");
    if (!confirmed) return;

    setSaving(`approve_${request.id}`);
    if (request.table_name === "finance_petty_cash_entries") {
      await supabase.from("finance_expenses").delete().eq("petty_cash_entry_id", request.record_id);
    }

    const { error: deleteError } = await supabase.from(request.table_name).delete().eq("id", request.record_id);
    if (deleteError) {
      showNotice("error", deleteError.message);
      setSaving("");
      return;
    }

    const { error: updateError } = await supabase
      .from("finance_delete_requests")
      .update({
        status: "approved",
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (updateError) {
      showNotice("error", updateError.message);
    } else {
      setDeleteRequests((prev) => prev.map((row) => (
        row.id === request.id ? { ...row, status: "approved", reviewed_by: currentUserId, reviewed_at: new Date().toISOString() } : row
      )));
      if (request.table_name === "finance_petty_cash_entries") {
        setPettyEntries((prev) => prev.filter((row) => row.id !== request.record_id));
        setOverallExpenses((prev) => prev.filter((row) => row.petty_cash_entry_id !== request.record_id));
      }
      if (request.table_name === "finance_petty_cash_funds") {
        setPettyFunds((prev) => prev.filter((row) => row.id !== request.record_id));
      }
      showNotice("success", "Delete request approved.");
    }
    setSaving("");
  }

  async function rejectDeleteRequest(request) {
    if (!canManageAll) return;
    const { error } = await supabase
      .from("finance_delete_requests")
      .update({
        status: "rejected",
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      showNotice("error", error.message);
    } else {
      setDeleteRequests((prev) => prev.map((row) => (
        row.id === request.id ? { ...row, status: "rejected", reviewed_by: currentUserId, reviewed_at: new Date().toISOString() } : row
      )));
      showNotice("success", "Delete request rejected.");
    }
  }

  function openReferenceModal(row = null) {
    if (row) {
      setEditingReferenceId(row.id);
      setReferenceForm({
        ref_type: row.ref_type || "item",
        name: row.name || "",
        common_name: row.common_name || "",
        notes: row.notes || "",
        is_active: row.is_active !== false,
      });
    } else {
      setEditingReferenceId(null);
      setReferenceForm((prev) => ({
        ...initialReferenceForm,
        ref_type: referenceFilter === "all" ? prev.ref_type : referenceFilter || prev.ref_type,
      }));
    }
    setReferenceModalOpen(true);
  }

  async function saveReference(event) {
    event.preventDefault();
    if (!referenceForm.name.trim()) return showNotice("error", "Reference name is required.");

    setSaving("reference");
    const payload = {
      ref_type: referenceForm.ref_type,
      name: referenceForm.name.trim(),
      common_name: referenceForm.ref_type === "item" ? referenceForm.common_name.trim() || null : null,
      notes: referenceForm.notes.trim() || null,
      is_active: referenceForm.is_active !== false,
      created_by: currentUserId,
    };

    if (editingReferenceId) {
      const { error } = await supabase.from("finance_references").update(payload).eq("id", editingReferenceId);
      if (error) {
        showNotice("error", error.message);
      } else {
        setReferences((prev) => prev.map((row) => row.id === editingReferenceId ? { ...row, ...payload } : row));
        setReferenceModalOpen(false);
        showNotice("success", "Reference updated.");
      }
    } else {
      const newRow = { id: makeId("fin_ref"), ...payload };
      const { error } = await supabase.from("finance_references").insert([newRow]);
      if (error) {
        showNotice("error", error.message);
      } else {
        setReferences((prev) => [...prev, newRow].sort((a, b) => a.ref_type.localeCompare(b.ref_type) || a.name.localeCompare(b.name)));
        setReferenceModalOpen(false);
        showNotice("success", "Reference added.");
      }
    }
    setSaving("");
  }

  function renderExpenseForm(scope) {
    const form = scope === "overall" ? expenseForm : pettyForm;
    const onSubmit = scope === "overall" ? saveOverallExpense : savePettyExpense;
    const math = lineMath(form);
    const allocation = allocationFor(form.category, math.total);
    const editingThisForm = editingExpense?.scope === scope;

    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">
              {scope === "overall" ? "Expenses Database" : `${selectedStoreName} Petty Cash`}
            </p>
            <h2 className="text-lg font-black text-slate-900">
              {editingThisForm ? "Edit Entry" : scope === "overall" ? "Add Overall Expense" : "Add Petty Cash Expense"}
            </h2>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-rose-400">Total</p>
            <p className="text-lg font-black text-slate-900">{peso(math.total)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={form.expense_date} onChange={(e) => updateExpenseForm(scope, "expense_date", e.target.value)} />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              list={`finance-item-names-${scope}`}
              onChange={(e) => updateExpenseForm(scope, "description", e.target.value)}
              required
            />
            <datalist id={`finance-item-names-${scope}`}>
              {itemReferences.map((row) => <option key={row.id} value={row.name} />)}
            </datalist>
          </Field>
          <Field label="Supplier / Name">
            <Input
              value={form.supplier_name}
              list={`finance-suppliers-${scope}`}
              onChange={(e) => updateExpenseForm(scope, "supplier_name", e.target.value)}
            />
            <datalist id={`finance-suppliers-${scope}`}>
              {supplierReferences.map((row) => <option key={row.id} value={row.name} />)}
            </datalist>
          </Field>
          <Field label="Common Name">
            <Input
              value={form.item_common_name}
              list={`finance-common-names-${scope}`}
              onChange={(e) => updateExpenseForm(scope, "item_common_name", e.target.value)}
              placeholder="Example: Caramel Sauce"
            />
            <datalist id={`finance-common-names-${scope}`}>
              {commonNameOptions.map((option) => <option key={option} value={option} />)}
            </datalist>
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => updateExpenseForm(scope, "category", e.target.value)}>
              {categoryOptions.map((option) => <option key={option}>{option}</option>)}
            </Select>
          </Field>
          <Field label="Qty">
            <Input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => updateExpenseForm(scope, "quantity", e.target.value)} />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => updateExpenseForm(scope, "unit", e.target.value)}>
              <option value="">Select unit</option>
              {unitOptions.map((option) => <option key={option}>{option}</option>)}
            </Select>
          </Field>
          <Field label="Unit Price">
            <Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => updateExpenseForm(scope, "unit_price", e.target.value)} />
          </Field>
          <Field label="Discount">
            <Input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => updateExpenseForm(scope, "discount", e.target.value)} />
          </Field>
          <Field label="Payment Type">
            <Select value={form.payment_type} onChange={(e) => updateExpenseForm(scope, "payment_type", e.target.value)}>
              <option value="">Select payment</option>
              {paymentTypeOptions.map((option) => <option key={option}>{option}</option>)}
            </Select>
          </Field>
          <Field label="Cheque No.">
            <Input value={form.cheque_no} onChange={(e) => updateExpenseForm(scope, "cheque_no", e.target.value)} />
          </Field>
          <Field label="Cheque Date">
            <Input type="date" value={form.cheque_date} onChange={(e) => updateExpenseForm(scope, "cheque_date", e.target.value)} />
          </Field>
          <Field label="Cheque Amount">
            <Input type="number" min="0" step="0.01" value={form.cheque_amount} onChange={(e) => updateExpenseForm(scope, "cheque_amount", e.target.value)} />
          </Field>
          <Field label="OR / SI No.">
            <Input value={form.or_si_no} onChange={(e) => updateExpenseForm(scope, "or_si_no", e.target.value)} />
          </Field>
          <Field label="OR / SI Date">
            <Input type="date" value={form.or_si_date} onChange={(e) => updateExpenseForm(scope, "or_si_date", e.target.value)} />
          </Field>
          <Field label="Submitted By">
            <Input value={form.submitted_by} onChange={(e) => updateExpenseForm(scope, "submitted_by", e.target.value)} />
          </Field>
          <Field label="Remarks">
            <Input value={form.remarks} onChange={(e) => updateExpenseForm(scope, "remarks", e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[9px] font-black uppercase text-slate-400">Sub-total</p>
            <p className="text-sm font-black">{peso(math.subtotal)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[9px] font-black uppercase text-slate-400">OP-EX</p>
            <p className="text-sm font-black">{peso(allocation.opex)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[9px] font-black uppercase text-slate-400">Personal</p>
            <p className="text-sm font-black">{peso(allocation.personal)}</p>
          </div>          
          <button
            type="submit"
            disabled={saving === scope || (scope === "petty" && !selectedStoreId)}
            className="h-full min-h-14 rounded-xl bg-[#FC687D] px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm transition active:scale-[0.99] disabled:bg-rose-200"
          >
            {saving === scope ? "Saving..." : editingThisForm ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </form>
    );
  }

  function renderExpenseTable(rows, tableName, options = {}) {
    const { showStore = false, showSource = false } = options;
    const isOverallTable = tableName === "finance_expenses";
    const dataPillClass = isOverallTable
      ? "rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-black"
      : "rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-black";
    if (rows.length === 0) return <EmptyState message="No expense records yet." />;

    return (
      <div className="overflow-x-auto rounded-2xl border border-rose-100 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-rose-50 text-left text-[10px] font-black uppercase tracking-wider text-rose-700">
            <tr>
              <th className="px-4 py-3">Date</th>
              {showSource ? <th className="px-4 py-3">Tag</th> : null}
              {showStore ? <th className="px-4 py-3">Store</th> : null}
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Common Name</th>
              <th className="px-4 py-3">Supplier / Name</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Sub-total</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sourceLabel = expenseSourceLabel(row, storeNameById);
              return (
                <tr key={row.id} className="border-t border-rose-50 text-slate-700">
                  <td className="px-4 py-3 font-semibold">{dateText(row.expense_date)}</td>
                  {showSource ? (
                    <td className="px-4 py-3">
                      <span className={dataPillClass}>
                        {sourceLabel}
                      </span>
                    </td>
                  ) : null}
                  {showStore ? <td className="px-4 py-3 font-semibold">{storeNameById[row.store_id] || "-"}</td> : null}
                  <td className="px-4 py-3 font-black text-slate-900">{row.description}</td>
                  <td className="px-4 py-3">{row.item_common_name || "-"}</td>
                  <td className="px-4 py-3">{row.supplier_name || "-"}</td>
                  <td className="px-4 py-3 text-right">{Number(row.quantity || 0).toLocaleString("en-PH")}</td>
                  <td className="px-4 py-3">{row.unit || "-"}</td>
                  <td className="px-4 py-3 text-right">{peso(row.subtotal)}</td>
                  <td className="px-4 py-3 text-right">{peso(row.discount)}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">{peso(row.total)}</td>
                  <td className="px-4 py-3">
                    <span className={dataPillClass}>{row.category}</span>
                  </td>
                  <td className="px-4 py-3">{row.payment_type || "-"}</td>
                  <td className="px-4 py-3">{row.submitted_by || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openExpenseModal(tableName === "finance_petty_cash_entries" ? "petty" : "overall", row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-[#FC687D]"
                        aria-label="Edit record"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(tableName, row)}
                        disabled={saving === `delete_request_${row.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 disabled:opacity-50"
                        aria-label="Delete record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderFundForm() {
    return (
      <form onSubmit={savePettyFund} className="space-y-3">
        <Field label="Date">
          <Input type="date" value={fundForm.fund_date} onChange={(e) => setFundForm((prev) => ({ ...prev, fund_date: e.target.value }))} />
        </Field>
        <Field label="Source of Fund">
          <Select value={fundForm.source_of_fund} onChange={(e) => setFundForm((prev) => ({ ...prev, source_of_fund: e.target.value }))}>
            {fundSourceOptions.map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
        <Field label="Particular">
          <Input value={fundForm.particular} onChange={(e) => setFundForm((prev) => ({ ...prev, particular: e.target.value }))} />
        </Field>
        <Field label="Amount">
          <Input type="number" min="0" step="0.01" value={fundForm.amount} onChange={(e) => setFundForm((prev) => ({ ...prev, amount: e.target.value }))} />
        </Field>
        <Field label="Submitted By">
          <Input value={fundForm.submitted_by} onChange={(e) => setFundForm((prev) => ({ ...prev, submitted_by: e.target.value }))} />
        </Field>
        <button
          type="submit"
          disabled={saving === "fund" || !selectedStoreId}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FC687D] text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:bg-rose-200"
        >
          <Plus size={15} />
          {saving === "fund" ? "Saving..." : editingFund ? "Update Cash In" : "Save Cash In"}
        </button>
      </form>
    );
  }

  function renderDateFilter(label, filter, setFilter) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label={`${label} From`}>
            <Input type="date" value={filter.from} onChange={(e) => setFilter((prev) => ({ ...prev, from: e.target.value }))} />
          </Field>
          <Field label={`${label} To`}>
            <Input type="date" value={filter.to} onChange={(e) => setFilter((prev) => ({ ...prev, to: e.target.value }))} />
          </Field>
          <button
            type="button"
            onClick={() => setFilter(emptyDateFilter)}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 px-4 text-xs font-black uppercase tracking-wider text-[#FC687D]"
          >
            Clear Date
          </button>
        </div>
      </div>
    );
  }

  function renderDeleteRequests() {
    const rows = deleteRequests.filter((request) => request.status === "pending");
    if (!canManageAll || rows.length === 0) return null;

    return (
      <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Approval</p>
            <h2 className="text-sm font-black text-slate-900">Pending Delete Requests</h2>
          </div>
          <span className="rounded-lg bg-amber-50 px-3 py-1 text-[10px] font-black uppercase text-amber-700">
            {rows.length} Pending
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((request) => {
            const snapshot = request.record_snapshot || {};
            return (
              <div key={request.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">{snapshot.description || snapshot.particular || request.record_id}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {request.store_name || storeNameById[request.store_id] || "Store"} / requested by {request.requested_by_name || "Cashier"} / {dateText(request.requested_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveDeleteRequest(request)}
                      disabled={saving === `approve_${request.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-[#FC687D] px-3 text-[10px] font-black uppercase tracking-wider text-white disabled:bg-rose-200"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectDeleteRequest(request)}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderReferenceForm() {
    return (
      <form onSubmit={saveReference} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reference Type">
            <Select value={referenceForm.ref_type} onChange={(e) => setReferenceForm((prev) => ({ ...prev, ref_type: e.target.value }))}>
              {REF_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Name">
            <Input value={referenceForm.name} onChange={(e) => setReferenceForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </Field>
          {referenceForm.ref_type === "item" ? (
            <Field label="Common Name">
              <Input
                value={referenceForm.common_name}
                onChange={(e) => setReferenceForm((prev) => ({ ...prev, common_name: e.target.value }))}
                placeholder="Example: Caramel Sauce"
              />
            </Field>
          ) : null}
          <Field label="Status">
            <Select
              value={referenceForm.is_active ? "active" : "inactive"}
              onChange={(e) => setReferenceForm((prev) => ({ ...prev, is_active: e.target.value === "active" }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Input value={referenceForm.notes} onChange={(e) => setReferenceForm((prev) => ({ ...prev, notes: e.target.value }))} />
        </Field>
        <button
          type="submit"
          disabled={saving === "reference"}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FC687D] text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:bg-rose-200"
        >
          {saving === "reference" ? "Saving..." : editingReferenceId ? "Save Reference" : "Add Reference"}
        </button>
      </form>
    );
  }

  function renderReferenceSettings() {
    const rows = references.filter((row) => referenceFilter === "all" || row.ref_type === referenceFilter);
    const labelByType = Object.fromEntries(REF_TYPES);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
          <Field label="Reference Type">
            <Select value={referenceFilter} onChange={(e) => setReferenceFilter(e.target.value)}>
              <option value="all">All references</option>
              {REF_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <button
            type="button"
            onClick={() => openReferenceModal()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FC687D] px-4 text-xs font-black uppercase tracking-wider text-white"
          >
            <Plus size={15} />
            Add Reference
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState message="No references yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-rose-100 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-rose-50 text-left text-[10px] font-black uppercase tracking-wider text-rose-700">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Common Name</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-rose-50">
                    <td className="px-4 py-3 font-bold text-slate-500">{labelByType[row.ref_type] || row.ref_type}</td>
                    <td className="px-4 py-3 font-black text-slate-900">{row.name}</td>
                    <td className="px-4 py-3">{row.common_name || "-"}</td>
                    <td className="px-4 py-3">{row.notes || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase ${row.is_active === false ? "border-slate-200 bg-slate-50 text-slate-500" : "border-emerald-100 bg-emerald-50 text-emerald-600"}`}>
                        {row.is_active === false ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openReferenceModal(row)}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 text-[10px] font-black uppercase text-[#FC687D]"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const financeTabs = isCashier
    ? [["petty", "Petty Cash", Wallet]]
    : [
      ["overall", "Overall Expenses", Database],
      ["petty", "Petty Cash", Wallet],
      ["settings", "References", Settings],
    ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">Finance</p>
          <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Expenses & Petty Cash</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Adapted from Data Entry v1.4: Database is the overall expense ledger, petty cash is separated by store.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FC687D] shadow-sm"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {notice ? (
        <div className={`rounded-2xl border p-3 text-sm font-bold ${notice.type === "error" ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {notice.message}
        </div>
      ) : null}

      {setupMissing ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Finance tables are not available yet. Run <span className="font-black">supabase/finance_expenses_setup.sql</span> in Supabase, then refresh this page.
        </div>
      ) : null}

      <div className={`grid gap-2 rounded-2xl border border-rose-100 bg-white p-1 shadow-sm md:w-fit ${financeTabs.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
        {financeTabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black uppercase tracking-wider transition ${
              tab === key ? "bg-[#FC687D] text-white shadow-sm" : "text-slate-500 hover:bg-rose-50"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-rose-100 bg-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-100 border-t-[#FC687D]" />
        </div>
      ) : tab === "overall" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Overall Expenses" value={peso(overallSummary.total)} icon={Database} />
            <SummaryCard label="OP-EX" value={peso(overallSummary.opex)} icon={ArrowDownCircle} tone="emerald" />
            <SummaryCard label="Personal" value={peso(overallSummary.personal)} icon={Wallet} tone="amber" />          
          </div>
          {renderDateFilter("Overall Expenses Date", overallDateFilter, setOverallDateFilter)}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => openExpenseModal("overall")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FC687D] px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm"
            >
              <Plus size={15} />
              Add Overall Expense
            </button>
          </div>
          {renderExpenseTable(filteredOverallExpenses, "finance_expenses", { showSource: true })}
        </div>
      ) : tab === "petty" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <Field label={isCashier ? "Assigned Branch" : "Petty Cash Store"}>
              <Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} disabled={isCashier}>
                <option value="">Select store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </Select>
            </Field>
            {isCashier ? (
              <p className="mt-2 text-[11px] font-semibold text-slate-500">Cashier access is locked to your assigned branch.</p>
            ) : null}
            </div>
            {renderDateFilter("Petty Cash Date", pettyDateFilter, setPettyDateFilter)}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label={`${selectedStoreName} Cash In`} value={peso(selectedPettySummary.funds)} icon={ArrowUpCircle} tone="emerald" />
            <SummaryCard label={`${selectedStoreName} Expenses`} value={peso(selectedPettySummary.expenses)} icon={ArrowDownCircle} tone="amber" />
            <SummaryCard label={`${selectedStoreName} Cash On Hand`} value={peso(selectedPettySummary.cashOnHand)} icon={Wallet} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => openExpenseModal("petty")}
              disabled={!selectedStoreId}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FC687D] px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:bg-rose-200"
            >
              <Plus size={15} />
              Add Petty Cash Expense
            </button>
            <button
              type="button"
              onClick={() => openFundModal()}
              disabled={!selectedStoreId}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FC687D] shadow-sm disabled:text-rose-200"
            >
              <ArrowUpCircle size={15} />
              Add Cash In
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Store size={17} className="text-[#FC687D]" />
                <h2 className="text-sm font-black text-slate-900">Store Petty Cash Balances</h2>
              </div>
              <div className="space-y-2">
                {pettyStoreSummary.length === 0 ? (
                  <EmptyState message="No active stores found." />
                ) : pettyStoreSummary.map((row) => (
                  <button
                    key={row.store.id}
                    type="button"
                    onClick={() => !isCashier && setSelectedStoreId(row.store.id)}
                    disabled={isCashier}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      String(selectedStoreId) === String(row.store.id) ? "border-rose-300 bg-rose-50" : "border-slate-100 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{row.store.name}</p>
                      <p className="text-sm font-black text-[#FC687D]">{peso(row.cashOnHand)}</p>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">
                      Cash in {peso(row.fundTotal)} / Expenses {peso(row.expenseTotal)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ArrowUpCircle size={17} className="text-emerald-600" />
                <h2 className="text-sm font-black text-slate-900">{selectedStoreName} Cash In Records</h2>
              </div>
              {selectedStoreFunds.length === 0 ? (
                <EmptyState message="No cash-in records for this store." />
              ) : (
                <div className="space-y-2">
                  {selectedStoreFunds.slice(0, 8).map((fund) => (
                    <div key={fund.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{fund.source_of_fund}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{dateText(fund.fund_date)} / {fund.particular || "Petty cash fund"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-emerald-600">{peso(fund.amount)}</p>
                        <button
                          type="button"
                          onClick={() => openFundModal(fund)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-[#FC687D]"
                          aria-label="Edit cash-in record"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow("finance_petty_cash_funds", fund)}
                          disabled={saving === `delete_request_${fund.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 disabled:opacity-50"
                          aria-label="Delete cash-in record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {renderDeleteRequests()}
          {renderExpenseTable(selectedStoreEntries, "finance_petty_cash_entries")}
        </div>
      ) : (
        renderReferenceSettings()
      )}

      <Modal
        open={Boolean(expenseModalScope)}
        title={editingExpense ? "Edit Expense Entry" : expenseModalScope === "petty" ? `Add Petty Cash Expense - ${selectedStoreName}` : "Add Overall Expense"}
        onClose={closeExpenseModal}
      >
        {expenseModalScope ? renderExpenseForm(expenseModalScope) : null}
      </Modal>

      <Modal
        open={fundModalOpen}
        title={editingFund ? `Edit Cash In - ${selectedStoreName}` : `Add Cash In - ${selectedStoreName}`}
        onClose={closeFundModal}
        width="max-w-lg"
      >
        {renderFundForm()}
      </Modal>

      <Modal
        open={referenceModalOpen}
        title={editingReferenceId ? "Edit Reference" : "Add Reference"}
        onClose={() => setReferenceModalOpen(false)}
        width="max-w-2xl"
      >
        {renderReferenceForm()}
      </Modal>

      <div className="rounded-2xl border border-rose-100 bg-white p-4 text-xs font-semibold text-slate-500 shadow-sm">
        <p className="font-black uppercase tracking-wider text-slate-700">Workbook mapping</p>
        <p className="mt-1">Database sheet = overall expenses. PettyCash sheet = store-specific petty cash expenses plus cash-in records.</p>
      </div>
    </div>
  );
}
