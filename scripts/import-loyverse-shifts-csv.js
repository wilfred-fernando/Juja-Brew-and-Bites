/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Client } = require("pg");

const DEFAULT_SHIFTS = "C:\\Users\\wilfr\\Downloads\\shifts-2024-04-01-2026-05-31.csv";
const DEFAULT_PAYINS_PAYOUTS = "C:\\Users\\wilfr\\Downloads\\payins-payouts-2024-04-01-2026-05-31.csv";

const SHIFT_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "store_name",
  "pos",
  "shift_number",
  "shift_opening_time",
  "shift_opened",
  "shift_closing_time",
  "shift_closed",
  "starting_cash",
  "cash_payments",
  "cash_refunds",
  "paid_in",
  "paid_out",
  "expected_cash_amount",
  "actual_cash_amount",
  "difference",
  "raw_data",
  "Store",
  "POS",
  "Shift number",
  "Shift opening time",
  "Shift opened",
  "Shift closing time",
  "Shift closed",
  "Starting cash",
  "Cash payments",
  "Cash refunds",
  "Paid in",
  "Paid out",
  "Expected cash amount",
  "Actual cash amount",
  "Difference",
];

const PAYIN_PAYOUT_COLUMNS = [
  "import_batch_id",
  "source_file",
  "source_row_number",
  "row_hash",
  "entry_date",
  "store_name",
  "pos",
  "shift_number",
  "entry_type",
  "employee",
  "comment",
  "amount",
  "raw_data",
  "Date",
  "Store",
  "POS",
  "Shift number",
  "Type",
  "Employee",
  "Comment",
  "Amount",
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
  return String(value ?? "")
    .replace(/\u202f/g, " ")
    .replace(/â€¯/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amount(value) {
  const text = cleanText(value).replace(/[₱,\s]/g, "");
  if (!text || text === "-") return 0;
  const numeric = Number(text.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseLoyverseDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  const [, month, day, rawYear, rawHour, minute, meridiem] = match;
  const year = Number(rawYear.length === 2 ? `20${rawYear}` : rawYear);
  let hour = Number(rawHour);
  const upper = meridiem.toUpperCase();
  if (upper === "PM" && hour !== 12) hour += 12;
  if (upper === "AM" && hour === 12) hour = 0;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00+08:00`;
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

function shiftValues(row, sourceFile, rowNumber, batchId) {
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_loyverse_shifts", sourceFile, rowNumber, row),
    store_name: cleanText(row.Store),
    pos: cleanText(row.POS),
    shift_number: cleanText(row["Shift number"]),
    shift_opening_time: parseLoyverseDate(row["Shift opening time"]),
    shift_opened: cleanText(row["Shift opened"]),
    shift_closing_time: parseLoyverseDate(row["Shift closing time"]),
    shift_closed: cleanText(row["Shift closed"]),
    starting_cash: amount(row["Starting cash"]),
    cash_payments: amount(row["Cash payments"]),
    cash_refunds: amount(row["Cash refunds"]),
    paid_in: amount(row["Paid in"]),
    paid_out: amount(row["Paid out"]),
    expected_cash_amount: amount(row["Expected cash amount"]),
    actual_cash_amount: amount(row["Actual cash amount"]),
    difference: amount(row.Difference),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(SHIFT_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
  };
}

function payinPayoutValues(row, sourceFile, rowNumber, batchId) {
  return {
    import_batch_id: batchId,
    source_file: path.basename(sourceFile),
    source_row_number: rowNumber,
    row_hash: rowHash("imported_loyverse_payins_payouts", sourceFile, rowNumber, row),
    entry_date: parseLoyverseDate(row.Date),
    store_name: cleanText(row.Store),
    pos: cleanText(row.POS),
    shift_number: cleanText(row["Shift number"]),
    entry_type: cleanText(row.Type),
    employee: cleanText(row.Employee),
    comment: cleanText(row.Comment),
    amount: amount(row.Amount),
    raw_data: JSON.stringify(row),
    ...Object.fromEntries(PAYIN_PAYOUT_COLUMNS.filter((column) => row[column] !== undefined).map((column) => [column, cleanText(row[column])])),
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
  const shiftsFile = process.argv[2] || DEFAULT_SHIFTS;
  const payinsPayoutsFile = process.argv[3] || DEFAULT_PAYINS_PAYOUTS;
  const batchId = `loyverse-shifts-${new Date().toISOString().slice(0, 10)}`;

  const [shifts, payinsPayouts] = await Promise.all([
    readCsv(shiftsFile, shiftValues, batchId),
    readCsv(payinsPayoutsFile, payinPayoutValues, batchId),
  ]);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await upsertRows(client, "imported_loyverse_shifts", SHIFT_COLUMNS, shifts);
    await upsertRows(client, "imported_loyverse_payins_payouts", PAYIN_PAYOUT_COLUMNS, payinsPayouts);
  } finally {
    await client.end();
  }

  console.log(`Imported shift rows: ${shifts.length}`);
  console.log(`Imported pay-in/pay-out rows: ${payinsPayouts.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
