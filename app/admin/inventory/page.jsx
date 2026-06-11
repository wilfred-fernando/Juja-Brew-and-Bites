"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  Edit3,
  History,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { INVENTORY_UNITS } from "@/lib/inventory";
import { formatDateTime } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

const emptyCommon = { common_name: "", category: "", default_unit: "pc", description: "", is_active: true };
const emptyItem = {
  common_name_id: "",
  item_name: "",
  common_name: "",
  sku: "",
  category: "",
  unit: "pc",
  minimum_stock: 0,
  reorder_level: 0,
  cost_per_unit: 0,
  supplier: "",
  is_active: true,
};
const emptyRecipe = { menu_item_id: "", inventory_item_id: "", common_name_id: "", quantity_required: "", unit: "pc", deduction_multiplier: 1, is_active: true };
const emptyRecipeLine = { inventory_item_id: "", common_name_id: "", quantity_required: "", unit: "pc", deduction_multiplier: 1, is_active: true };
const emptyAdjustment = { inventory_item_id: "", mode: "add", quantity: "", notes: "" };

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stockStatus(item) {
  const stock = numberValue(item.current_stock);
  if (stock <= 0) return ["Out of stock", "bg-red-50 text-red-700 border-red-100"];
  if (stock <= numberValue(item.minimum_stock)) return ["Critical", "bg-orange-50 text-orange-700 border-orange-100"];
  if (stock <= numberValue(item.reorder_level)) return ["Low stock", "bg-amber-50 text-amber-700 border-amber-100"];
  return ["Healthy", "bg-cyan-50 text-cyan-700 border-cyan-100"];
}

function Field({ label, children }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm text-slate-800 shadow-sm outline-none transition duration-200 placeholder:text-slate-400 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20 ${props.className || ""}`}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm text-slate-800 shadow-sm outline-none transition duration-200 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20 ${props.className || ""}`}
    />
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-200/80 ${className}`}>
      {children}
    </div>
  );
}

function Modal({ open, title, children, onClose, width = "max-w-3xl" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_30px_90px_rgba(2,6,23,0.35)]`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ message }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">{message}</div>;
}

export default function AdminInventoryPage() {
  const [tab, setTab] = useState("dashboard");
  const [items, setItems] = useState([]);
  const [commonNames, setCommonNames] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [txFilter, setTxFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [itemModal, setItemModal] = useState(false);
  const [commonModal, setCommonModal] = useState(false);
  const [recipeModal, setRecipeModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingCommonId, setEditingCommonId] = useState(null);
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [commonForm, setCommonForm] = useState(emptyCommon);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [recipeLines, setRecipeLines] = useState([emptyRecipeLine]);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);

  function showNotice(type, message) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  }

  async function loadData() {
    setLoading(true);
    const [itemRes, commonRes, txRes, recipeRes, menuRes, warningRes, settingsRes] = await Promise.all([
      supabase.from("inventory_items").select("*, common_inventory_names(common_name)").order("item_name"),
      supabase.from("common_inventory_names").select("*").order("common_name"),
      supabase.from("inventory_transactions").select("*, inventory_items(item_name, common_name), common_inventory_names(common_name)").order("created_at", { ascending: false }).limit(300),
      supabase.from("menu_item_ingredients").select("*, inventory_items(item_name, common_name), common_inventory_names(common_name)").order("created_at", { ascending: false }),
      supabase.from("menu_items").select("id, name, category, variants").order("name"),
      supabase.from("inventory_warnings").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(100),
      supabase.from("inventory_settings").select("*").eq("id", "default").maybeSingle(),
    ]);

    const error = [itemRes.error, commonRes.error, txRes.error, recipeRes.error, menuRes.error, warningRes.error, settingsRes.error].find(Boolean);
    if (error) {
      showNotice("error", `Inventory tables unavailable. Run supabase/inventory_system_setup.sql first. ${error.message}`);
      setLoading(false);
      return;
    }
    setItems(itemRes.data || []);
    setCommonNames(commonRes.data || []);
    setTransactions(txRes.data || []);
    setRecipes(recipeRes.data || []);
    setMenuItems(menuRes.data || []);
    setWarnings(warningRes.data || []);
    setSettings(settingsRes.data || null);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const categories = useMemo(() => {
    return [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => {
        const text = `${item.item_name || ""} ${item.sku || ""} ${item.category || ""} ${item.supplier || ""}`.toLowerCase();
        return text.includes(search.toLowerCase());
      });
  }, [items, search, categoryFilter]);

  const lowStockItems = useMemo(() => items.filter((item) => numberValue(item.current_stock) <= Math.max(numberValue(item.minimum_stock), numberValue(item.reorder_level))), [items]);
  const outOfStockItems = useMemo(() => items.filter((item) => numberValue(item.current_stock) <= 0), [items]);
  const inventoryValue = useMemo(() => items.reduce((sum, item) => sum + numberValue(item.current_stock) * numberValue(item.cost_per_unit), 0), [items]);
  const todayDeductions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return transactions.filter((tx) => tx.transaction_type === "pos_deduction" && String(tx.created_at || "").slice(0, 10) === today).length;
  }, [transactions]);
  const monthPurchases = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return transactions.filter((tx) => tx.transaction_type === "purchase" && String(tx.created_at || "").slice(0, 7) === month).reduce((sum, tx) => sum + Math.abs(numberValue(tx.quantity_effect)), 0);
  }, [transactions]);

  const filteredTransactions = transactions.filter((tx) => txFilter === "all" || tx.transaction_type === txFilter);

  function openItem(row = null) {
    setEditingItemId(row?.id || null);
    setItemForm(row ? {
      common_name_id: row.common_name_id || "",
      item_name: row.item_name || "",
      common_name: row.common_name || row.common_inventory_names?.common_name || row.item_name || "",
      sku: row.sku || "",
      category: row.category || "",
      unit: row.unit || "pc",
      minimum_stock: row.minimum_stock || 0,
      reorder_level: row.reorder_level || 0,
      cost_per_unit: row.cost_per_unit || 0,
      supplier: row.supplier || "",
      is_active: row.is_active !== false,
    } : emptyItem);
    setItemModal(true);
  }

  function openCommon(row = null) {
    setEditingCommonId(row?.id || null);
    setCommonForm(row ? {
      common_name: row.common_name || "",
      category: row.category || "",
      default_unit: row.default_unit || "pc",
      description: row.description || "",
      is_active: row.is_active !== false,
    } : emptyCommon);
    setCommonModal(true);
  }

  function openRecipe(row = null) {
    setEditingRecipeId(row?.id || null);
    setRecipeForm(row ? {
      menu_item_id: row.menu_item_id || "",
      inventory_item_id: "",
      common_name_id: "",
      quantity_required: "",
      unit: "pc",
      deduction_multiplier: 1,
      is_active: true,
    } : emptyRecipe);
    setRecipeLines(row?.id ? [{
      inventory_item_id: row.inventory_item_id || "",
      common_name_id: row.common_name_id || "",
      quantity_required: row.quantity_required || "",
      unit: row.unit || "pc",
      deduction_multiplier: row.deduction_multiplier || 1,
      is_active: row.is_active !== false,
    }] : [emptyRecipeLine]);
    setRecipeModal(true);
  }

  function updateRecipeLine(index, patch) {
    setRecipeLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function addRecipeLine() {
    setRecipeLines((prev) => [...prev, { ...emptyRecipeLine }]);
  }

  function removeRecipeLine(index) {
    setRecipeLines((prev) => (prev.length > 1 ? prev.filter((_, lineIndex) => lineIndex !== index) : prev));
  }

  async function saveItem(e) {
    e.preventDefault();
    if (!itemForm.item_name.trim()) return showNotice("error", "Item name is required.");
    const payload = {
      ...itemForm,
      common_name_id: itemForm.common_name_id || null,
      common_name: itemForm.common_name.trim() || itemForm.item_name.trim(),
      minimum_stock: numberValue(itemForm.minimum_stock),
      reorder_level: numberValue(itemForm.reorder_level),
      cost_per_unit: numberValue(itemForm.cost_per_unit),
      updated_at: new Date().toISOString(),
    };
    const response = editingItemId
      ? await supabase.from("inventory_items").update(payload).eq("id", editingItemId)
      : await supabase.from("inventory_items").insert([payload]);
    if (response.error) return showNotice("error", response.error.message);
    setItemModal(false);
    showNotice("success", editingItemId ? "Inventory item updated." : "Inventory item created.");
    loadData();
  }

  async function saveCommon(e) {
    e.preventDefault();
    if (!commonForm.common_name.trim()) return showNotice("error", "Common name is required.");
    const payload = { ...commonForm, updated_at: new Date().toISOString() };
    const response = editingCommonId
      ? await supabase.from("common_inventory_names").update(payload).eq("id", editingCommonId)
      : await supabase.from("common_inventory_names").insert([payload]);
    if (response.error) return showNotice("error", response.error.message);
    setCommonModal(false);
    showNotice("success", editingCommonId ? "Common name updated." : "Common name created.");
    loadData();
  }

  async function saveRecipe(e) {
    e.preventDefault();
    const validLines = recipeLines
      .map((line) => ({ ...line, quantity_required: numberValue(line.quantity_required) }))
      .filter((line) => line.inventory_item_id && line.quantity_required > 0);

    if (!recipeForm.menu_item_id || !validLines.length) {
      return showNotice("error", "Menu item and at least one ingredient with quantity are required.");
    }
    const payloads = validLines.map((line) => {
      const selectedItem = items.find((item) => item.id === line.inventory_item_id);
      return {
        menu_item_id: recipeForm.menu_item_id,
        inventory_item_id: line.inventory_item_id,
        common_name_id: line.common_name_id || selectedItem?.common_name_id || null,
        quantity_required: numberValue(line.quantity_required),
        unit: line.unit || selectedItem?.unit || "pc",
        deduction_multiplier: numberValue(line.deduction_multiplier || 1),
        is_active: line.is_active !== false,
        updated_at: new Date().toISOString(),
      };
    });

    let response;
    if (editingRecipeId) {
      const [firstPayload, ...extraPayloads] = payloads;
      response = await supabase.from("menu_item_ingredients").update(firstPayload).eq("id", editingRecipeId);
      if (!response.error && extraPayloads.length) {
        response = await supabase.from("menu_item_ingredients").insert(extraPayloads);
      }
    } else {
      response = await supabase.from("menu_item_ingredients").insert(payloads);
    }

    if (response.error) return showNotice("error", response.error.message);
    setRecipeModal(false);
    showNotice("success", editingRecipeId ? "Recipe row updated." : "Recipe ingredients added.");
    loadData();
  }

  async function reconcileInventoryPurchases() {
    const { data, error } = await supabase.rpc("reconcile_expense_inventory_purchases");
    if (error) return showNotice("error", error.message);
    showNotice("success", `Inventory reconciled. Synced ${data?.synced || 0} expense purchase${Number(data?.synced || 0) === 1 ? "" : "s"}.`);
    loadData();
  }

  async function archiveItem(row) {
    const { error } = await supabase.from("inventory_items").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return showNotice("error", error.message);
    showNotice("success", "Inventory item archived.");
    loadData();
  }

  async function saveAdjustment(e) {
    e.preventDefault();
    const item = items.find((row) => row.id === adjustmentForm.inventory_item_id);
    if (!item) return showNotice("error", "Select an item name.");
    const qty = numberValue(adjustmentForm.quantity);
    if (!qty && adjustmentForm.mode !== "set") return showNotice("error", "Quantity is required.");
    const current = numberValue(item.current_stock);
    const effect = adjustmentForm.mode === "deduct" ? -Math.abs(qty) : adjustmentForm.mode === "set" ? qty - current : Math.abs(qty);
    const { error } = await supabase.rpc("add_inventory_transaction", {
      p_inventory_item_id: item.id,
      p_common_name_id: item.common_name_id || null,
      p_transaction_type: "manual_adjustment",
      p_quantity: Math.abs(effect),
      p_unit: item.unit,
      p_quantity_effect: effect,
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: adjustmentForm.notes || "Manual adjustment",
      p_created_by: null,
    });
    if (error) return showNotice("error", error.message);
    setAdjustmentForm(emptyAdjustment);
    showNotice("success", "Stock adjustment saved.");
    loadData();
  }

  async function saveSettings(next) {
    setSettings(next);
    const { error } = await supabase.from("inventory_settings").upsert({ ...next, id: "default", updated_at: new Date().toISOString() });
    if (error) showNotice("error", error.message);
  }

  function renderDashboard() {
    const topDeducted = transactions
      .filter((tx) => tx.transaction_type === "pos_deduction")
      .reduce((map, tx) => {
        const key = tx.inventory_item_id || tx.common_name_id || "unknown";
        map[key] = map[key] || { name: tx.inventory_items?.item_name || tx.inventory_items?.common_name || tx.common_inventory_names?.common_name || "Unknown", qty: 0, unit: tx.unit };
        map[key].qty += Math.abs(numberValue(tx.quantity_effect));
        return map;
      }, {});

    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Total Items", items.length, Boxes],
            ["Low Stock", lowStockItems.length, AlertTriangle],
            ["Out of Stock", outOfStockItems.length, AlertTriangle],
            ["Inventory Value", peso(inventoryValue), Database],
            ["Today POS Deductions", todayDeductions, History],
            ["Month Purchases", monthPurchases.toLocaleString("en-PH"), BarChart3],
          ].map(([label, value, Icon]) => (
            <Card key={label}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
                </div>
                <Icon className="h-8 w-8 rounded-xl bg-cyan-50 p-2 text-cyan-700" />
              </div>
            </Card>
          ))}
        </div>

        {warnings.length ? (
          <Card className="border-amber-200/80 bg-amber-50/80">
            <p className="text-sm font-semibold text-amber-900">Inventory warnings</p>
            <div className="mt-3 space-y-2">
              {warnings.slice(0, 5).map((warning) => (
                <div key={warning.id} className="rounded-xl border border-amber-100 bg-white/80 p-3 text-sm text-amber-900">{warning.message}</div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <h2 className="text-sm font-semibold text-slate-950">Low Stock List</h2>
            <div className="mt-3 space-y-2">
              {lowStockItems.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/80 p-3 text-sm">
                  <span>{item.item_name}</span>
                  <span className="font-semibold text-red-600">{item.current_stock} {item.unit}</span>
                </div>
              ))}
              {!lowStockItems.length ? <Empty message="No low stock items." /> : null}
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold text-slate-950">Recent Transactions</h2>
            <div className="mt-3 space-y-2">
              {transactions.slice(0, 8).map((tx) => (
                <div key={tx.id} className="rounded-xl border border-slate-100 bg-white/80 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>{tx.inventory_items?.item_name || tx.inventory_items?.common_name || tx.common_inventory_names?.common_name || "-"}</span>
                    <span className={numberValue(tx.quantity_effect) < 0 ? "text-red-600" : "text-cyan-700"}>{tx.quantity_effect} {tx.unit}</span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{tx.transaction_type}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold text-slate-950">Top Deducted</h2>
            <div className="mt-3 space-y-2">
              {Object.values(topDeducted).sort((a, b) => b.qty - a.qty).slice(0, 8).map((row) => (
                <div key={row.name} className="flex justify-between rounded-xl border border-slate-100 bg-white/80 p-3 text-sm">
                  <span>{row.name}</span>
                  <span className="font-semibold text-slate-950">{row.qty.toLocaleString("en-PH")} {row.unit}</span>
                </div>
              ))}
              {!Object.keys(topDeducted).length ? <Empty message="No POS deductions yet." /> : null}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/78 p-4 shadow-sm backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory..." className="pl-9" />
            </div>
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-xs">
              <option value="all">All categories</option>
              {categories.map((cat) => <option key={cat}>{cat}</option>)}
            </Select>
          </div>
          <button onClick={() => openItem()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-cyan-600">
            <Plus size={15} /> Add Item Name
          </button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/88 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <table className="w-full min-w-[860px] table-auto text-sm">
            <thead className="bg-slate-700 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Common Name</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {filteredItems.map((item) => {
                const [label, cls] = stockStatus(item);
                return (
                  <tr key={item.id} className="transition hover:bg-cyan-50/45">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{item.item_name}</p>
                      <p className="text-xs text-slate-400">{item.sku || item.category || "-"}</p>
                    </td>
                    <td className="px-4 py-3">{item.common_name || item.common_inventory_names?.common_name || "-"}</td>
                    <td className="px-4 py-3 font-semibold">{Number(item.current_stock || 0).toLocaleString("en-PH")} {item.unit}</td>
                    <td className="px-4 py-3">{peso(item.cost_per_unit)}</td>
                    <td className="px-4 py-3">{item.supplier || "-"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${cls}`}>{label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openItem(item)} className="mr-2 inline-flex h-8 items-center rounded-lg border border-cyan-100 bg-cyan-50 px-3 text-cyan-700 transition hover:bg-cyan-100"><Edit3 size={13} /></button>
                      <button onClick={() => archiveItem(item)} className="inline-flex h-8 items-center rounded-lg border border-red-100 bg-red-50 px-3 text-red-600 transition hover:bg-red-100"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredItems.length ? <Empty message="No item names found." /> : null}
        </div>
      </div>
    );
  }

  function renderCommonNames() {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => openCommon()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600"><Plus size={15} /> Add Common Name</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {commonNames.map((row) => (
            <Card key={row.id}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{row.common_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.category || "Uncategorized"} / {row.default_unit}</p>
                </div>
                <button onClick={() => openCommon(row)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><Edit3 size={14} /></button>
              </div>
              <p className="mt-3 text-xs text-slate-500">{row.description || "No description."}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  function renderRecipes() {
    const recipesByMenu = recipes.reduce((map, row) => {
      map[row.menu_item_id] = map[row.menu_item_id] || [];
      map[row.menu_item_id].push(row);
      return map;
    }, {});
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => openRecipe()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600"><Plus size={15} /> Add Ingredient</button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {menuItems.map((menu) => (
            <Card key={menu.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{menu.name}</p>
                  <p className="text-xs text-slate-500">{menu.category || "No category"}</p>
                </div>
                <button onClick={() => openRecipe({ ...emptyRecipe, menu_item_id: String(menu.id) })} className="rounded-lg bg-cyan-50 px-3 py-2 text-[10px] font-semibold uppercase text-cyan-700">Add</button>
              </div>
              <div className="mt-3 space-y-2">
                {(recipesByMenu[String(menu.id)] || []).length ? recipesByMenu[String(menu.id)].map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/85 p-3 text-sm">
                    <span>{row.inventory_items?.item_name || row.inventory_items?.common_name || row.common_inventory_names?.common_name || "Ingredient"}</span>
                    <button onClick={() => openRecipe(row)} className="text-cyan-700">{row.quantity_required} {row.unit}</button>
                  </div>
                )) : <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">No recipe set. POS will complete sale but log a missing recipe warning.</p>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  function renderTransactions() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/70 bg-white/78 p-4 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <Field label="Transaction Type">
            <Select value={txFilter} onChange={(e) => setTxFilter(e.target.value)}>
              <option value="all">All transactions</option>
              {["purchase", "pos_deduction", "manual_adjustment", "waste", "return", "correction"].map((type) => <option key={type}>{type}</option>)}
            </Select>
          </Field>
          <button onClick={() => downloadCSV()} className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 px-4 text-xs font-semibold uppercase tracking-wider text-cyan-700">Export CSV</button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/88 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-700 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Effect</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                  <td className="px-4 py-3">{formatDateTime(tx.created_at)}</td>
                  <td className="px-4 py-3">{tx.inventory_items?.item_name || tx.inventory_items?.common_name || tx.common_inventory_names?.common_name || "-"}</td>
                  <td className="px-4 py-3">{tx.transaction_type}</td>
                  <td className={`px-4 py-3 font-semibold ${numberValue(tx.quantity_effect) < 0 ? "text-red-600" : "text-cyan-700"}`}>{tx.quantity_effect} {tx.unit}</td>
                  <td className="px-4 py-3">{tx.reference_type || "-"} {tx.reference_id || ""}</td>
                  <td className="px-4 py-3">{tx.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderLowStock() {
    return (
      <div className="space-y-3">
        {lowStockItems.map((item) => {
          const [label, cls] = stockStatus(item);
          return (
            <Card key={item.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{item.item_name}</p>
                  <p className="mt-1 text-xs text-slate-500">Current {item.current_stock} {item.unit} / Reorder {item.reorder_level} {item.unit}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full border px-3 py-2 text-[10px] font-semibold uppercase ${cls}`}>{label}</span>
                  <a href={`/finance/expenses?inventoryItemId=${item.id}`} className="rounded-xl bg-slate-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600">Create Purchase Expense</a>
                </div>
              </div>
            </Card>
          );
        })}
        {!lowStockItems.length ? <Empty message="No low stock alerts." /> : null}
      </div>
    );
  }

  function renderAdjustment() {
    return (
      <Card>
        <form onSubmit={saveAdjustment} className="grid gap-4 md:grid-cols-2">
          <Field label="Item Name">
            <Select value={adjustmentForm.inventory_item_id} onChange={(e) => setAdjustmentForm((p) => ({ ...p, inventory_item_id: e.target.value }))}>
              <option value="">Select item</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.current_stock} {item.unit})</option>)}
            </Select>
          </Field>
          <Field label="Adjustment Type">
            <Select value={adjustmentForm.mode} onChange={(e) => setAdjustmentForm((p) => ({ ...p, mode: e.target.value }))}>
              <option value="add">Add stock</option>
              <option value="deduct">Deduct stock</option>
              <option value="set">Set exact stock</option>
            </Select>
          </Field>
          <Field label="Quantity">
            <Input type="number" step="0.001" value={adjustmentForm.quantity} onChange={(e) => setAdjustmentForm((p) => ({ ...p, quantity: e.target.value }))} />
          </Field>
          <Field label="Reason / Notes">
            <Input value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600 md:col-span-2"><Save size={15} /> Save Adjustment</button>
        </form>
      </Card>
    );
  }

  function renderSettings() {
    if (!settings) return <Empty message="Inventory settings not loaded." />;
    const toggles = [
      ["inventory_enabled", "Inventory Enabled"],
      ["allow_negative_stock", "Allow Negative Stock"],
      ["warn_missing_recipe", "Warn Missing Recipe"],
      ["auto_sync_expenses", "Auto Sync Expenses"],
      ["low_stock_alert_enabled", "Low Stock Alerts"],
    ];
    return (
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          {toggles.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/80 p-4 text-sm">
              <span className="font-semibold text-slate-800">{label}</span>
              <input type="checkbox" checked={settings[key] !== false} onChange={(e) => saveSettings({ ...settings, [key]: e.target.checked })} className="h-5 w-5 accent-cyan-600" />
            </label>
          ))}
        </div>
      </Card>
    );
  }

  function downloadCSV() {
    const rows = filteredTransactions.map((tx) => ({
      date: tx.created_at,
      item: tx.inventory_items?.item_name || tx.inventory_items?.common_name || tx.common_inventory_names?.common_name || "",
      type: tx.transaction_type,
      quantity_effect: tx.quantity_effect,
      unit: tx.unit,
      reference: `${tx.reference_type || ""} ${tx.reference_id || ""}`.trim(),
      notes: tx.notes || "",
    }));
    const headers = Object.keys(rows[0] || { date: "", item: "", type: "", quantity_effect: "", unit: "", reference: "", notes: "" });
    const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    ["dashboard", "Dashboard", BarChart3],
    ["items", "Item Names", Boxes],
    ["common", "Common Names", Database],
    ["recipes", "Recipes", ClipboardList],
    ["transactions", "Transactions", History],
    ["alerts", "Low Stock Alerts", AlertTriangle],
    ["adjust", "Manual Adjustment", Plus],
    ["settings", "Settings", Settings],
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/20 bg-slate-600/78 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Admin Control Center</p>
            <p className="mt-1 text-2xl font-semibold sm:text-3xl">Inventory System</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Manage stock using Item Name as inventory items and Common Name as standardized names.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={reconcileInventoryPurchases} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-white/12 px-4 text-xs font-semibold uppercase tracking-wider text-cyan-50 transition hover:-translate-y-0.5 hover:bg-cyan-300/18">
              <Database size={15} /> Reconcile
            </button>
            <button onClick={loadData} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 text-xs font-semibold uppercase tracking-wider text-cyan-50 transition hover:-translate-y-0.5 hover:bg-cyan-300/18">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>
      </header>

      {notice ? <div className={`rounded-2xl border p-3 text-sm font-semibold ${notice.type === "error" ? "border-red-100 bg-red-50 text-red-600" : "border-cyan-100 bg-cyan-50 text-cyan-800"}`}>{notice.message}</div> : null}

      <div className="grid gap-2 rounded-2xl border border-white/70 bg-white/72 p-1 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {tabs.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-semibold uppercase tracking-wider transition ${tab === key ? "bg-slate-300/78 text-white shadow-[0_0_28px_rgba(34,211,238,0.16)]" : "text-slate-600 hover:-translate-y-0.5 hover:bg-cyan-50 hover:text-cyan-700"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-80 items-center justify-center rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
        </div>
      ) : tab === "dashboard" ? renderDashboard()
        : tab === "items" ? renderItems()
        : tab === "common" ? renderCommonNames()
        : tab === "recipes" ? renderRecipes()
        : tab === "transactions" ? renderTransactions()
        : tab === "alerts" ? renderLowStock()
        : tab === "adjust" ? renderAdjustment()
        : renderSettings()}

      <Modal open={itemModal} title={editingItemId ? "Edit Item Name" : "Add Item Name"} onClose={() => setItemModal(false)}>
        <form onSubmit={saveItem} className="grid gap-4 md:grid-cols-2">
          <Field label="Item Name"><Input value={itemForm.item_name} onChange={(e) => setItemForm((p) => ({ ...p, item_name: e.target.value }))} /></Field>
          <Field label="Common Name"><Input value={itemForm.common_name} list="inventory-common-name-options" onChange={(e) => setItemForm((p) => ({ ...p, common_name: e.target.value, common_name_id: "" }))} /></Field>
          <datalist id="inventory-common-name-options">
            {commonNames.map((row) => <option key={row.id} value={row.common_name} />)}
          </datalist>
          <Field label="SKU"><Input value={itemForm.sku} onChange={(e) => setItemForm((p) => ({ ...p, sku: e.target.value }))} /></Field>
          <Field label="Category"><Input value={itemForm.category} onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))} /></Field>
          <Field label="Unit"><Select value={itemForm.unit} onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))}>{INVENTORY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</Select></Field>
          <Field label="Minimum Stock"><Input type="number" step="0.001" value={itemForm.minimum_stock} onChange={(e) => setItemForm((p) => ({ ...p, minimum_stock: e.target.value }))} /></Field>
          <Field label="Reorder Level"><Input type="number" step="0.001" value={itemForm.reorder_level} onChange={(e) => setItemForm((p) => ({ ...p, reorder_level: e.target.value }))} /></Field>
          <Field label="Cost Per Unit"><Input type="number" step="0.0001" value={itemForm.cost_per_unit} onChange={(e) => setItemForm((p) => ({ ...p, cost_per_unit: e.target.value }))} /></Field>
          <Field label="Supplier"><Input value={itemForm.supplier} onChange={(e) => setItemForm((p) => ({ ...p, supplier: e.target.value }))} /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={itemForm.is_active} onChange={(e) => setItemForm((p) => ({ ...p, is_active: e.target.checked }))} /> Active</label>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600 md:col-span-2"><Save size={15} /> Save Item</button>
        </form>
      </Modal>

      <Modal open={commonModal} title={editingCommonId ? "Edit Common Name" : "Add Common Name"} onClose={() => setCommonModal(false)} width="max-w-2xl">
        <form onSubmit={saveCommon} className="grid gap-4 md:grid-cols-2">
          <Field label="Common Name"><Input value={commonForm.common_name} onChange={(e) => setCommonForm((p) => ({ ...p, common_name: e.target.value }))} /></Field>
          <Field label="Category"><Input value={commonForm.category} onChange={(e) => setCommonForm((p) => ({ ...p, category: e.target.value }))} /></Field>
          <Field label="Default Unit"><Select value={commonForm.default_unit} onChange={(e) => setCommonForm((p) => ({ ...p, default_unit: e.target.value }))}>{INVENTORY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</Select></Field>
          <Field label="Description"><Input value={commonForm.description} onChange={(e) => setCommonForm((p) => ({ ...p, description: e.target.value }))} /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={commonForm.is_active} onChange={(e) => setCommonForm((p) => ({ ...p, is_active: e.target.checked }))} /> Active</label>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-600 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600 md:col-span-2"><Save size={15} /> Save Common Name</button>
        </form>
      </Modal>

      <Modal open={recipeModal} title={editingRecipeId ? "Edit Recipe Ingredient" : "Add Recipe Ingredients"} onClose={() => setRecipeModal(false)}>
        <form onSubmit={saveRecipe} className="space-y-4">
          <Field label="Menu Item">
            <Select value={recipeForm.menu_item_id} onChange={(e) => setRecipeForm((p) => ({ ...p, menu_item_id: e.target.value }))}>
              <option value="">Select menu item</option>
              {menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>

          <div className="space-y-3">
            {recipeLines.map((line, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ingredient {index + 1}</p>
                  <button type="button" onClick={() => removeRecipeLine(index)} disabled={recipeLines.length === 1} className="inline-flex h-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 px-3 text-[10px] font-semibold uppercase text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  <Field label="Item Name">
                    <Select value={line.inventory_item_id} onChange={(e) => {
                      const item = items.find((row) => row.id === e.target.value);
                      updateRecipeLine(index, {
                        inventory_item_id: e.target.value,
                        common_name_id: item?.common_name_id || line.common_name_id,
                        unit: item?.unit || line.unit,
                      });
                    }}>
                      <option value="">Select expense item name</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Qty"><Input type="number" step="0.001" value={line.quantity_required} onChange={(e) => updateRecipeLine(index, { quantity_required: e.target.value })} /></Field>
                  <Field label="Unit"><Select value={line.unit} onChange={(e) => updateRecipeLine(index, { unit: e.target.value })}>{INVENTORY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</Select></Field>
                  <Field label="Multiplier"><Input type="number" step="0.001" value={line.deduction_multiplier} onChange={(e) => updateRecipeLine(index, { deduction_multiplier: e.target.value })} /></Field>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={line.is_active} onChange={(e) => updateRecipeLine(index, { is_active: e.target.checked })} /> Active</label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={addRecipeLine} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-semibold uppercase tracking-wider text-cyan-800 transition hover:bg-cyan-100">
              <Plus size={15} /> Add Another Item
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-600 px-5 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-600"><Save size={15} /> Save Recipe</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
