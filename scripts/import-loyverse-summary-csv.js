/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Client } = require("pg");

const DEFAULT_ITEM_SUMMARY =
  "C:\\Users\\wilfr\\Downloads\\item-sales-summary-2024-04-01-2026-05-31.csv";
const DEFAULT_CATEGORY_SUMMARY =
  "C:\\Users\\wilfr\\Downloads\\category-sales-summary-2024-04-01-2026-05-31.csv";

const ITEM_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "report_start_date",
  "report_end_date",
  "item_name",
  "sku",
  "category",
  "items_sold",
  "gross_sales",
  "items_refunded",
  "refunds",
  "discounts",
  "net_sales",
  "cost_of_goods",
  "gross_profit",
  "margin_percent",
  "taxes",
  "raw_data",
  "Item name",
  "SKU",
  "Category",
  "Items sold",
  "Gross sales",
  "Items refunded",
  "Refunds",
  "Discounts",
  "Net sales",
  "Cost of goods",
  "Gross profit",
  "Margin",
  "Taxes",
];

const CATEGORY_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "report_start_date",
  "report_end_date",
  "category",
  "items_sold",
  "gross_sales",
  "items_refunded",
  "refunds",
  "discounts",
  "net_sales",
  "cost_of_goods",
  "gross_profit",
  "margin_percent",
  "taxes",
  "raw_data",
  "Category",
  "Items sold",
  "Gross sales",
  "Items refunded",
  "Refunds",
  "Discounts",
  "Net sales",
  "Cost of goods",
  "Gross profit",
  "Margin",
  "Taxes",
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
  const text = cleanText(value).replace(/[₱,\s]/g, "").replace(/%$/, "");
  if (!text || text === "-") return 0;
  const numeric = Number(text.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(numeric) ? numeric : 0;
}

function q(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function rowHash(table, sourceFile, rowNumber, row) {
  return crypto
    .createHash("sha256")
    .update(`${table}:${path.basename(sourceFile)}:${rowNumber}:${JSON.stringify(row)}`)
    .digest("hex");
}

function periodFromFile(filePath) {
  const match = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.csv$/);
  return {
    startDate: match?.[1] || null,
    endDate: match?.[2] || null,
  };
}

function itemSummaryValues(row, sourceFile, rowNumber, batchId) {
  const period = periodFromFile(sourceFile);
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_loyverse_item_sales_summary", sourceFile, rowNumber, row),
    report_start_date: period.startDate,
    report_end_date: period.endDate,
    item_name: cleanText(row["Item name"]),
    sku: cleanText(row.SKU),
    category: cleanText(row.Category),
    items_sold: amount(row["Items sold"]),
    gross_sales: amount(row["Gross sales"]),
    items_refunded: amount(row["Items refunded"]),
    refunds: amount(row.Refunds),
    discounts: amount(row.Discounts),
    net_sales: amount(row["Net sales"]),
    cost_of_goods: amount(row["Cost of goods"]),
    gross_profit: amount(row["Gross profit"]),
    margin_percent: amount(row.Margin),
    taxes: amount(row.Taxes),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(ITEM_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
  };
}

function categorySummaryValues(row, sourceFile, rowNumber, batchId) {
  const period = periodFromFile(sourceFile);
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_loyverse_category_sales_summary", sourceFile, rowNumber, row),
    report_start_date: period.startDate,
    report_end_date: period.endDate,
    category: cleanText(row.Category),
    items_sold: amount(row["Items sold"]),
    gross_sales: amount(row["Gross sales"]),
    items_refunded: amount(row["Items refunded"]),
    refunds: amount(row.Refunds),
    discounts: amount(row.Discounts),
    net_sales: amount(row["Net sales"]),
    cost_of_goods: amount(row["Cost of goods"]),
    gross_profit: amount(row["Gross profit"]),
    margin_percent: amount(row.Margin),
    taxes: amount(row.Taxes),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(CATEGORY_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
  };
}

function readCsv(filePath, mapper, batchId) {
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
  if (!rows.length) return;
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
  const itemFile = process.argv[2] || DEFAULT_ITEM_SUMMARY;
  const categoryFile = process.argv[3] || DEFAULT_CATEGORY_SUMMARY;
  const batchId = `loyverse-summary-${new Date().toISOString().slice(0, 10)}`;

  const [items, categories] = await Promise.all([
    readCsv(itemFile, itemSummaryValues, batchId),
    readCsv(categoryFile, categorySummaryValues, batchId),
  ]);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await upsertRows(client, "imported_loyverse_item_sales_summary", ITEM_COLUMNS, items);
    await upsertRows(client, "imported_loyverse_category_sales_summary", CATEGORY_COLUMNS, categories);
  } finally {
    await client.end();
  }

  console.log(`Imported item summary rows: ${items.length}`);
  console.log(`Imported category summary rows: ${categories.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
