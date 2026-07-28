const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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

function isBirthdayVoucher(voucher) {
  const code = String(voucher?.code || "").toUpperCase();
  const rewardText = String(voucher?.reward_text || "").toLowerCase();
  return voucher?.reward_type === "birthday" || code.startsWith("BDAY") || rewardText.includes("birthday");
}

async function fetchAll(client) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("vouchers")
      .select("code,reward_text,reward_type,issued_at,expires_at,redeemed_at,status,member_id,loyalty_members(customer_name)")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");

  const client = createClient(url, serviceRole);
  const vouchers = (await fetchAll(client))
    .filter(isBirthdayVoucher)
    .filter((voucher) => ["active", "redeemed"].includes(String(voucher.status || "").toLowerCase()))
    .sort((a, b) => String(a.status).localeCompare(String(b.status)) || new Date(a.issued_at) - new Date(b.issued_at));

  const rows = vouchers.map((voucher) => ({
    customer: voucher.loyalty_members?.customer_name || "-",
    code: voucher.code,
    reward: voucher.reward_text,
    valid_from: formatManila(voucher.issued_at),
    valid_until: formatManila(voucher.expires_at),
    redeemed_at: formatManila(voucher.redeemed_at),
    status: voucher.status,
  }));

  const summary = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ summary, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
