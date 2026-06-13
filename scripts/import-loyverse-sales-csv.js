/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Client } = require("pg");

const DEFAULT_RECEIPTS =
  "C:\\Users\\wilfr\\Downloads\\receipts-2024-04-01-2026-05-31.csv";
const DEFAULT_RECEIPT_ITEMS =
  "C:\\Users\\wilfr\\Downloads\\receipts-by-item-2024-04-01-2026-05-31.csv";

const RECEIPT_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "receipt_date",
  "receipt_day",
  "receipt_number",
  "receipt_type",
  "gross_sales",
  "discounts",
  "net_sales",
  "taxes",
  "total_collected",
  "cost_of_goods",
  "gross_profit",
  "payment_type",
  "description",
  "dining_option",
  "pos",
  "store_name",
  "cashier_name",
  "customer_name",
  "customer_contacts",
  "status",
  "raw_data",
  "Date",
  "Receipt number",
  "Receipt type",
  "Gross sales",
  "Discounts",
  "Net sales",
  "Taxes",
  "Total collected",
  "Cost of goods",
  "Gross profit",
  "Payment type",
  "Description",
  "Dining option",
  "POS",
  "Store",
  "Cashier name",
  "Customer name",
  "Customer contacts",
  "Status",
];

const RECEIPT_ITEM_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "receipt_date",
  "receipt_day",
  "receipt_number",
  "receipt_type",
  "category",
  "sku",
  "item",
  "variant",
  "modifiers_applied",
  "quantity",
  "gross_sales",
  "discounts",
  "net_sales",
  "cost_of_goods",
  "gross_profit",
  "taxes",
  "dining_option",
  "pos",
  "store_name",
  "cashier_name",
  "customer_name",
  "comment",
  "status",
  "raw_data",
  "Date",
  "Receipt number",
  "Receipt type",
  "Category",
  "SKU",
  "Item",
  "Variant",
  "Modifiers applied",
  "Quantity",
  "Gross sales",
  "Discounts",
  "Net sales",
  "Cost of goods",
  "Gross profit",
  "Taxes",
  "Dining option",
  "POS",
  "Store",
  "Cashier name",
  "Customer name",
  "Comment",
  "Status",
];

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function cleanText(value) {
  return String(value ?? "").replace(/\u202f/g, " ").trim();
}

function amount(value) {
  const text = cleanText(value).replace(/[₱,\s]/g, "");
  if (!text || text === "-") return 0;
  const numeric = Number(text.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseReceiptDate(value) {
  const text = cleanText(value);
  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (!match) return { timestamp: null, day: null };

  const [, monthValue, dayValue, yearValue, hourValue, minuteValue, meridiem] = match;
  const yearNumber = Number(yearValue);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  let hour = Number(hourValue);
  if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;

  const month = String(Number(monthValue)).padStart(2, "0");
  const day = String(Number(dayValue)).padStart(2, "0");
  const minute = String(Number(minuteValue)).padStart(2, "0");
  const timestamp = `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${minute}:00+08:00`;
  return { timestamp, day: `${year}-${month}-${day}` };
}

function rowHash(table, sourceFile, rowNumber, row) {
  return crypto
    .createHash("sha256")
    .update(`${table}:${path.basename(sourceFile)}:${rowNumber}:${JSON.stringify(row)}`)
    .digest("hex");
}

function q(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function receiptValues(row, sourceFile, rowNumber, batchId) {
  const parsedDate = parseReceiptDate(row.Date);
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_receipts", sourceFile, rowNumber, row),
    receipt_date: parsedDate.timestamp,
    receipt_day: parsedDate.day,
    receipt_number: cleanText(row["Receipt number"]),
    receipt_type: cleanText(row["Receipt type"]),
    gross_sales: amount(row["Gross sales"]),
    discounts: amount(row.Discounts),
    net_sales: amount(row["Net sales"]),
    taxes: amount(row.Taxes),
    total_collected: amount(row["Total collected"]),
    cost_of_goods: amount(row["Cost of goods"]),
    gross_profit: amount(row["Gross profit"]),
    payment_type: cleanText(row["Payment type"]),
    description: cleanText(row.Description),
    dining_option: cleanText(row["Dining option"]),
    pos: cleanText(row.POS),
    store_name: cleanText(row.Store),
    cashier_name: cleanText(row["Cashier name"]),
    customer_name: cleanText(row["Customer name"]),
    customer_contacts: cleanText(row["Customer contacts"]),
    status: cleanText(row.Status),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(RECEIPT_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
  };
}

function receiptItemValues(row, sourceFile, rowNumber, batchId) {
  const parsedDate = parseReceiptDate(row.Date);
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_receipt_items", sourceFile, rowNumber, row),
    receipt_date: parsedDate.timestamp,
    receipt_day: parsedDate.day,
    receipt_number: cleanText(row["Receipt number"]),
    receipt_type: cleanText(row["Receipt type"]),
    category: cleanText(row.Category),
    sku: cleanText(row.SKU),
    item: cleanText(row.Item),
    variant: cleanText(row.Variant),
    modifiers_applied: cleanText(row["Modifiers applied"]),
    quantity: amount(row.Quantity),
    gross_sales: amount(row["Gross sales"]),
    discounts: amount(row.Discounts),
    net_sales: amount(row["Net sales"]),
    cost_of_goods: amount(row["Cost of goods"]),
    gross_profit: amount(row["Gross profit"]),
    taxes: amount(row.Taxes),
    dining_option: cleanText(row["Dining option"]),
    pos: cleanText(row.POS),
    store_name: cleanText(row.Store),
    cashier_name: cleanText(row["Cashier name"]),
    customer_name: cleanText(row["Customer name"]),
    comment: cleanText(row.Comment),
    status: cleanText(row.Status),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(RECEIPT_ITEM_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
  };
}

async function readCsv(filePath, mapper, batchId) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let rowNumber = 0;
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        rowNumber += 1;
        rows.push(mapper(row, filePath, rowNumber, batchId));
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function upsertRows(client, tableName, columns, rows) {
  const chunkSize = 500;
  let total = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const rowPlaceholders = columns.map((column, columnIndex) => {
        values.push(row[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });
    const updates = columns
      .filter((column) => !["id", "row_hash"].includes(column))
      .map((column) => `${q(column)} = excluded.${q(column)}`)
      .join(", ");
    await client.query(
      `
        insert into public.${q(tableName)} (${columns.map(q).join(", ")})
        values ${placeholders.join(", ")}
        on conflict (row_hash) do update set ${updates}
      `,
      values
    );
    total += chunk.length;
    console.log(`${tableName}: ${total}/${rows.length}`);
  }
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

  const receiptsFile = process.argv[2] || DEFAULT_RECEIPTS;
  const receiptItemsFile = process.argv[3] || DEFAULT_RECEIPT_ITEMS;
  const batchId = `loyverse-${new Date().toISOString().slice(0, 10)}`;

  const [receipts, receiptItems] = await Promise.all([
    readCsv(receiptsFile, receiptValues, batchId),
    readCsv(receiptItemsFile, receiptItemValues, batchId),
  ]);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await upsertRows(client, "imported_receipts", RECEIPT_COLUMNS, receipts);
    await upsertRows(client, "imported_receipt_items", RECEIPT_ITEM_COLUMNS, receiptItems);
  } finally {
    await client.end();
  }

  console.log(`Imported receipts: ${receipts.length}`);
  console.log(`Imported receipt item rows: ${receiptItems.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
