import { expenseVatBreakdown } from "./financeVat";

export function financeExpensesCsv(rows, storeNames = {}) {
  const headers = ["ID", "Date", "Source", "Store", "Description", "Common Name", "Supplier", "Quantity", "Unit", "Unit Price", "Subtotal", "Discount", "Tax Type", "Vatable Sales", "VAT", "Total", "Receipt Type", "Receipt No.", "Receipt Date", "Category", "Payment Type", "Cheque No.", "Cheque Date", "Cheque Amount", "Remarks", "Submitted By", "Date Submitted", "Inventory Status"];
  const cell = (value) => {
    let text = String(value ?? "");
    // Prevent user-entered text from executing as a spreadsheet formula.
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const lines = rows.map((row) => {
    const vat = expenseVatBreakdown(row.total, row.tax_type);
    return [row.id, row.expense_date, row.source_tag || "Petty Cash", storeNames[row.store_id] || row.store_name || row.store_id || "", row.description, row.item_common_name, row.supplier_name, Number(row.quantity || 0), row.unit, Number(row.unit_price || 0), Number(row.subtotal || 0), Number(row.discount || 0), row.tax_type || "Unspecified", row.tax_type ? vat.vatableSales : "", row.tax_type ? vat.vatAmount : "", Number(row.total || 0), row.receipt_type, row.or_si_no, row.or_si_date, row.category, row.payment_type, row.cheque_no, row.cheque_date, row.cheque_amount == null ? "" : Number(row.cheque_amount), row.remarks, row.submitted_by, row.date_submitted, row.inventory_sync_status];
  });
  return "\uFEFF" + [headers, ...lines].map((line) => line.map(cell).join(",")).join("\r\n");
}
