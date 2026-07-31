/* eslint-disable no-console */
const { createClient } = require("@supabase/supabase-js");
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const fs = require("node:fs");
const path = require("node:path");

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

const APPLY = process.argv.includes("--apply");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const MIGRATE_APKS = process.argv.includes("--apks");
const MIGRATE_MEDIA = process.argv.includes("--media");
const MIGRATE_PROOFS =
  process.argv.includes("--proofs") || (!MIGRATE_APKS && !MIGRATE_MEDIA);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const r2Endpoint =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  (process.env.CLOUDFLARE_ACCOUNT_ID
    ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET || "juja-assets";
const r2PublicUrl = String(process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/+$/, "");
const hasR2Config = Boolean(
  r2Endpoint &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    r2PublicUrl
);

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
].filter(([, value]) => !value);

if (APPLY || VERIFY_ONLY) {
  missing.push(
    ...[
      ["CLOUDFLARE_R2_ENDPOINT or CLOUDFLARE_ACCOUNT_ID", r2Endpoint],
      ["CLOUDFLARE_R2_ACCESS_KEY_ID", process.env.CLOUDFLARE_R2_ACCESS_KEY_ID],
      ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY],
      ["CLOUDFLARE_R2_PUBLIC_URL", r2PublicUrl],
    ].filter(([, value]) => !value)
  );
}

if (missing.length) {
  console.error(`Missing environment variables: ${missing.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r2 = hasR2Config
  ? new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const report = {
  startedAt: new Date().toISOString(),
  mode: APPLY ? "apply" : VERIFY_ONLY ? "verify" : "dry-run",
  planned: [],
  copied: [],
  existing: [],
  verified: [],
  failed: [],
  databaseUpdates: [],
  rollback: [],
};

function r2Url(key) {
  if (!r2PublicUrl) return `(R2 public URL)/${key}`;
  return `${r2PublicUrl}/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function parseSupabaseStorageUrl(url) {
  if (!url || !String(url).includes("/storage/v1/object/")) return null;
  const parsed = new URL(url);
  const marker = "/storage/v1/object/";
  const suffix = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length));
  const normalized = suffix.replace(/^(public|sign)\//, "");
  const slash = normalized.indexOf("/");
  if (slash < 1) return null;
  return {
    bucket: normalized.slice(0, slash),
    objectPath: normalized.slice(slash + 1),
  };
}

async function objectExists(key) {
  if (!r2) return false;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

async function verifyPublicUrl(url) {
  if (!url || url.startsWith("(R2 public URL)")) return false;
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Public URL verification failed with HTTP ${response.status}.`);
  }
  report.verified.push({ url, status: response.status });
  return true;
}

async function copySupabaseObject(bucket, objectPath, destinationKey) {
  if (r2 && (await objectExists(destinationKey))) {
    const url = r2Url(destinationKey);
    await verifyPublicUrl(url);
    report.existing.push({ bucket, objectPath, destinationKey, url });
    return url;
  }
  if (VERIFY_ONLY) throw new Error("Object is missing from R2.");
  if (!APPLY) {
    report.planned.push({
      source: `supabase://${bucket}/${objectPath}`,
      destinationKey,
      url: r2Url(destinationKey),
    });
    return r2Url(destinationKey);
  }

  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error(error?.message || "Supabase object download failed.");
  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: destinationKey,
      Body: Buffer.from(await data.arrayBuffer()),
      ContentType: data.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  if (!(await objectExists(destinationKey))) throw new Error("R2 verification failed after upload.");
  const url = r2Url(destinationKey);
  await verifyPublicUrl(url);
  report.copied.push({ bucket, objectPath, destinationKey, url });
  return url;
}

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
      if (row.id) {
        objects.push({ ...row, objectPath });
      } else {
        objects.push(...(await listFolder(bucket, objectPath)));
      }
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return objects;
}

async function migrateBucket(bucket) {
  let rows;
  try {
    rows = await listFolder(bucket);
  } catch (error) {
    report.failed.push({ bucket, error: error.message });
    return;
  }
  console.log(`${bucket}: ${rows.length} object(s) discovered`);
  for (const row of rows) {
    const objectPath = row.objectPath;
    const destinationKey = `${bucket}/${objectPath}`;
    try {
      await copySupabaseObject(bucket, objectPath, destinationKey);
    } catch (error) {
      report.failed.push({ bucket, objectPath, error: error.message });
    }
  }
}

async function migrateDatabaseProofUrls(table) {
  const { data, error } = await supabase
    .from(table)
    .select("id,payment_proof_url")
    .not("payment_proof_url", "is", null);
  if (error) {
    report.failed.push({ table, error: error.message });
    return;
  }
  const rows = (data || []).filter((row) => parseSupabaseStorageUrl(row.payment_proof_url));
  console.log(`${table}: ${rows.length} Supabase proof URL(s) discovered`);

  for (const row of rows) {
    const source = parseSupabaseStorageUrl(row.payment_proof_url);
    const destinationKey = `${source.bucket}/${source.objectPath}`;
    try {
      const newUrl = await copySupabaseObject(
        source.bucket,
        source.objectPath,
        destinationKey
      );
      if (!APPLY || VERIFY_ONLY) continue;
      const { error: updateError } = await supabase
        .from(table)
        .update({ payment_proof_url: newUrl })
        .eq("id", row.id)
        .eq("payment_proof_url", row.payment_proof_url);
      if (updateError) throw updateError;
      report.databaseUpdates.push({ table, id: row.id, column: "payment_proof_url", newUrl });
      report.rollback.push({
        table,
        id: row.id,
        column: "payment_proof_url",
        oldUrl: row.payment_proof_url,
        newUrl,
      });
    } catch (error) {
      report.failed.push({ table, id: row.id, error: error.message });
    }
  }
}

async function uploadLocalFile(
  localFile,
  destinationKey,
  contentType,
  cacheControl = "public, max-age=31536000, immutable"
) {
  if (!fs.existsSync(localFile)) {
    report.failed.push({ localFile, error: "Local file not found." });
    return;
  }
  if (r2 && (await objectExists(destinationKey))) {
    const url = r2Url(destinationKey);
    await verifyPublicUrl(url);
    report.existing.push({ localFile, destinationKey, url });
    return;
  }
  if (VERIFY_ONLY) throw new Error("Object is missing from R2.");
  if (!APPLY) {
    report.planned.push({
      source: path.relative(process.cwd(), localFile),
      destinationKey,
      size: fs.statSync(localFile).size,
      url: r2Url(destinationKey),
    });
    return;
  }
  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: destinationKey,
      Body: fs.createReadStream(localFile),
      ContentLength: fs.statSync(localFile).size,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
  if (!(await objectExists(destinationKey))) throw new Error("R2 verification failed.");
  const url = r2Url(destinationKey);
  await verifyPublicUrl(url);
  report.copied.push({ localFile, destinationKey, url });
}

async function migrateApks() {
  const manifests = [
    path.resolve("public/app-updates/pos.json"),
    path.resolve("public/app-updates/customer.json"),
  ];
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const fileName = path.basename(new URL(manifest.apkUrl).pathname);
    const localFile = path.resolve("releases", fileName);
    const destinationKey = `apk-downloads/${fileName}`;
    try {
      await uploadLocalFile(
        localFile,
        destinationKey,
        "application/vnd.android.package-archive",
        "public, max-age=3600"
      );
      const newUrl = r2Url(destinationKey);
      if (APPLY && !VERIFY_ONLY) {
        report.rollback.push({
          file: path.relative(process.cwd(), manifestPath),
          oldUrl: manifest.apkUrl,
          newUrl,
        });
        manifest.apkUrl = newUrl;
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    } catch (error) {
      report.failed.push({ localFile, error: error.message });
    }
  }
}

async function migratePublicMedia() {
  const media = [
    {
      source: "public/images/event-cart-milk-tea.jpg",
      destinationKey: "public-media/event-cart-milk-tea.jpg",
      references: [["app/event-cart/page.jsx", "/images/event-cart-milk-tea.jpg"]],
    },
    {
      source: "public/images/event-cart-picapica.jpg",
      destinationKey: "public-media/event-cart-picapica.jpg",
      references: [["app/event-cart/page.jsx", "/images/event-cart-picapica.jpg"]],
    },
    {
      source: "public/images/qrph.jpg",
      destinationKey: "public-media/qrph.jpg",
      references: [
        ["components/BookingForm.jsx", "/images/qrph.jpg"],
        ["app/customer/page.jsx", "/images/qrph.jpg"],
      ],
    },
    {
      source: "public/images/loyalty-card-bg.jpg",
      destinationKey: "public-media/loyalty-card-bg.jpg",
      references: [["app/customer/page.jsx", "/images/loyalty-card-bg.jpg"]],
    },
  ];
  for (const entry of media) {
    const { source, destinationKey, references } = entry;
    try {
      await uploadLocalFile(path.resolve(source), destinationKey, "image/jpeg");
      if (APPLY && !VERIFY_ONLY) {
        const newUrl = r2Url(destinationKey);
        for (const [file, oldUrl] of references) {
          const filePath = path.resolve(file);
          const original = fs.readFileSync(filePath, "utf8");
          if (!original.includes(oldUrl)) continue;
          fs.writeFileSync(filePath, original.split(oldUrl).join(newUrl));
          report.rollback.push({ file, oldUrl, newUrl });
        }
      }
    } catch (error) {
      report.failed.push({ localFile: source, error: error.message });
    }
  }
}

async function main() {
  if (MIGRATE_PROOFS) {
    await migrateBucket("payment-proofs");
    await migrateBucket("booking_proofs");
    await migrateDatabaseProofUrls("web_orders");
    await migrateDatabaseProofUrls("function_room_bookings");
  }
  if (MIGRATE_APKS) await migrateApks();
  if (MIGRATE_MEDIA) await migratePublicMedia();

  report.finishedAt = new Date().toISOString();
  const reportDir = path.resolve("tmp/storage-migration");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `${report.startedAt.replace(/[:.]/g, "-")}-${report.mode}.json`
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  console.log(
    `Planned ${report.planned.length}; copied ${report.copied.length}; existing ${report.existing.length}; verified ${report.verified.length}; DB updates ${report.databaseUpdates.length}; failures ${report.failed.length}.`
  );
  if (report.failed.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
