import { expenseSupplierDetails } from "./financeSuppliers.js";
import { expenseVatBreakdown } from "./financeVat.js";

const normalized = (value) => String(value || "").trim().toLowerCase();
const cents = (value) => Math.round((Number(value) || 0) * 100);

export function pettyCashMonthlySummary(entries, references = [], { includePcv = true } = {}) {
  const categories = new Map();
  const addCategory = (name) => {
    const label = String(name || "").trim() || "Uncategorized";
    if (!categories.has(normalized(label))) categories.set(normalized(label), label);
    return normalized(label);
  };
  references.filter((ref) => ref.ref_type === "item_category").forEach((ref) => addCategory(ref.name));
  const items = new Map();
  references.filter((ref) => ref.ref_type === "item").forEach((ref) => {
    if (ref.item_category) addCategory(ref.item_category);
    const key = normalized(ref.name);
    if (!items.has(key) || ref.is_active !== false) items.set(key, ref);
  });
  const groups = new Map();
  entries.forEach((entry, index) => {
    const number = String(entry.or_si_no || "").trim();
    const date = entry.or_si_date || entry.expense_date;
    const type = String(entry.receipt_type || "").trim().toUpperCase();
    const key = number
      ? JSON.stringify([entry.store_id, date, normalized(entry.supplier_name), type, number])
      : `unreceipted:${entry.id || index}`;
    if (!groups.has(key)) groups.set(key, {
      date, supplier: expenseSupplierDetails(entry, references).companyName, tin: expenseSupplierDetails(entry, references).tinNumber,
      descriptions: new Set(), remarks: new Set(), quantity: 0, number, type,
      base: 0, exempt: 0, ar: 0, discount: 0, vat: 0, total: 0, categories: new Map(),
    });
    const group = groups.get(key);
    if (entry.description) group.descriptions.add(entry.description);
    if (entry.remarks) group.remarks.add(entry.remarks);
    group.quantity += Number(entry.quantity) || 0;
    const tax = expenseVatBreakdown(entry.total, entry.tax_type);
    group.base += cents(tax.vatableSales);
    group.vat += cents(tax.vatAmount);
    if (["non-vat", "vat exempt", "vat-exempt"].includes(normalized(entry.tax_type))) group.exempt += cents(entry.total);
    if (normalized(entry.tax_type) === "ar") group.ar += cents(entry.total);
    group.discount += cents(entry.discount);
    group.total += cents(entry.total);
    const category = addCategory(entry.item_category || items.get(normalized(entry.description))?.item_category);
    group.categories.set(category, (group.categories.get(category) || 0) + cents(entry.total));
  });
  const usedCategories = new Set();
  for (const group of groups.values()) {
    for (const [key, amount] of group.categories) {
      if (amount !== 0) usedCategories.add(key);
    }
  }
  const categoryKeys = [...categories.keys()]
    .filter((key) => usedCategories.has(key))
    .sort((a, b) => a.localeCompare(b));
  const headers = ["Date", "PCV No.", "Supplier / Employees Name", "TIN No.", "Description", "Qty", "OR No.", "SI No.", "Other Receipt No.", "VAT Amount", "VAT Exempt", "AR", "Discount", "Input VAT", "Total Amount", ...categoryKeys.map((key) => categories.get(key)), "Remarks"];
  const rows = [...groups.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.number.localeCompare(b.number)).map((group) => [
    group.date, "", group.supplier, group.tin, [...group.descriptions].join("; "), group.quantity,
    group.type === "OR" ? group.number : "", group.type === "SI" ? group.number : "",
    !["OR", "SI"].includes(group.type) ? [group.type, group.number].filter(Boolean).join(": ") : "",
    group.base / 100, group.exempt / 100, group.ar / 100, group.discount / 100, group.vat / 100, group.total / 100,
    ...categoryKeys.map((key) => (group.categories.get(key) || 0) / 100), [...group.remarks].join("; "),
  ]);
  const totals = headers.map((_, column) => column === 0 ? "TOTAL" : column === 5 ? rows.reduce((sum, row) => sum + row[column], 0) : column >= 9 && column < headers.length - 1 ? rows.reduce((sum, row) => sum + cents(row[column]), 0) / 100 : "");
  if (!includePcv) {
    headers.splice(1, 1);
    rows.forEach((row) => row.splice(1, 1));
    totals.splice(1, 1);
  }
  return { headers, rows, totals };
}

export function pettyCashMonthlyCsv(summary) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^\s*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [summary.headers, ...summary.rows, summary.totals].map((row) => row.map(cell).join(",")).join("\r\n");
}
