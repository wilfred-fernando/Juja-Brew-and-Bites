export function expenseSupplierDetails(row, references = []) {
  const name = String(row.supplier_name || "").trim().toLowerCase();
  const matches = name ? references.filter((reference) => reference.ref_type === "supplier" && String(reference.name || "").trim().toLowerCase() === name) : [];
  const supplier = matches.find((reference) => reference.is_active !== false) || matches[0];
  return {
    companyName: row.supplier_company_name ?? supplier?.supplier_company_name ?? "",
    tinNumber: row.supplier_tin_number ?? supplier?.supplier_tin_number ?? "",
  };
}
