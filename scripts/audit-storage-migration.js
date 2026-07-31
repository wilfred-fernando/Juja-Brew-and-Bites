/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.r2-migration"));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function listFolder(bucket, prefix = "") {
  const objects = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      const objectPath = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id) objects.push(objectPath);
      else objects.push(...(await listFolder(bucket, objectPath)));
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return objects;
}

function classifyUrl(value) {
  const text = String(value || "");
  if (!text) return null;
  if (text.includes("/storage/v1/object/")) return "supabase-storage";
  if (text.includes("files.jujabrewandbites.com")) return "r2-public";
  if (/^https?:\/\//i.test(text)) return "external";
  return null;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    buckets: [],
    databaseUrlColumns: [],
    supabaseStorageReferences: [],
  };

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) throw bucketError;
  for (const bucket of buckets || []) {
    try {
      const objects = await listFolder(bucket.name);
      report.buckets.push({ name: bucket.name, public: bucket.public, objectCount: objects.length });
    } catch (error) {
      report.buckets.push({ name: bucket.name, error: error.message });
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the schema audit.");
  const pg = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const columnsResult = await pg.query(`
      select table_schema, table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and data_type in ('text', 'character varying', 'character')
        and (
          column_name ilike '%url%'
          or column_name ilike '%image%'
          or column_name ilike '%photo%'
          or column_name ilike '%proof%'
          or column_name ilike '%file%'
          or column_name ilike '%avatar%'
          or column_name ilike '%attachment%'
          or column_name ilike '%document%'
          or column_name ilike '%apk%'
        )
      order by table_name, column_name
    `);

    for (const column of columnsResult.rows) {
      const table = `"${column.table_schema.replaceAll('"', '""')}"."${column.table_name.replaceAll('"', '""')}"`;
      const field = `"${column.column_name.replaceAll('"', '""')}"`;
      const valuesResult = await pg.query(
        `select ${field} as value, count(*)::int as count
         from ${table}
         where ${field} is not null and btrim(${field}) <> ''
         group by ${field}`
      );
      const classifications = {};
      for (const row of valuesResult.rows) {
        const kind = classifyUrl(row.value) || "non-url";
        classifications[kind] = (classifications[kind] || 0) + row.count;
        if (kind === "supabase-storage") {
          report.supabaseStorageReferences.push({
            table: column.table_name,
            column: column.column_name,
            count: row.count,
            value: row.value,
          });
        }
      }
      report.databaseUrlColumns.push({
        table: column.table_name,
        column: column.column_name,
        nonNullCount: valuesResult.rows.reduce((sum, row) => sum + row.count, 0),
        classifications,
      });
    }
  } finally {
    await pg.end();
  }

  const outputDir = path.resolve(process.cwd(), "tmp", "storage-migration");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-audit.json`
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    buckets: report.buckets,
    databaseUrlColumns: report.databaseUrlColumns,
    supabaseStorageReferenceCount: report.supabaseStorageReferences.reduce(
      (sum, row) => sum + row.count,
      0
    ),
    report: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
