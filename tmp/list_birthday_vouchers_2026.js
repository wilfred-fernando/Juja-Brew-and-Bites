const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const CREATED_CODES = [
  "BDAY2026-2345",
  "BDAY2026-2871",
  "BDAY2026-6814",
  "BDAY2026-7290",
  "BDAY2026-8726",
  "BDAY2026-5103",
  "BDAY2026-6899",
];

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function formatManila(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");

  const client = createClient(url, serviceRole);
  const { data: vouchers, error } = await client
    .from("vouchers")
    .select("code,reward_text,reward_type,issued_at,expires_at,status,member_id,loyalty_members(customer_name)")
    .in("code", CREATED_CODES)
    .order("issued_at", { ascending: true });

  if (error) throw error;

  const rows = (vouchers || []).map((voucher) => ({
    customer: voucher.loyalty_members?.customer_name || "-",
    code: voucher.code,
    reward: voucher.reward_text,
    valid_from: formatManila(voucher.issued_at),
    valid_until: formatManila(voucher.expires_at),
    status: voucher.status,
  }));

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
