const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const REWARD_TEXT = "FREE 16oz Drink or Waffle (Birthday Reward)";
const WINDOW_DAYS = 2;

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function manilaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function manilaDateUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second, millisecond));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function normalizeBirthdayMonthDay(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { month: Number(iso[2]), day: Number(iso[3]) };

  const legacy = text.match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})$/);
  if (legacy) {
    const monthIndex = MONTH_NAMES.findIndex((month) => month.toLowerCase() === legacy[2].toLowerCase());
    if (monthIndex >= 0) return { month: monthIndex + 1, day: Number(legacy[3]) };
  }

  const readable = new Date(text);
  if (!Number.isNaN(readable.getTime())) return { month: readable.getMonth() + 1, day: readable.getDate() };

  return null;
}

function birthdayWindowForYear(birthday, year) {
  const parsed = normalizeBirthdayMonthDay(birthday);
  if (!parsed?.month || !parsed?.day) return null;
  const birthdayStart = manilaDateUtc(year, parsed.month, parsed.day);
  return {
    year,
    birthdayStart,
    windowStart: addDays(birthdayStart, -WINDOW_DAYS),
    windowEnd: addDays(manilaDateUtc(year, parsed.month, parsed.day, 23, 59, 59, 999), WINDOW_DAYS),
  };
}

function isBirthdayVoucher(voucher) {
  const code = String(voucher?.code || "").toUpperCase();
  const rewardText = String(voucher?.reward_text || "").toLowerCase();
  return voucher?.reward_type === "birthday" || code.startsWith("BDAY") || rewardText.includes("birthday");
}

async function fetchAll(client, table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select(select).range(from, from + pageSize - 1);
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
  const now = new Date();
  const currentYear = manilaDateParts(now).year;
  const members = await fetchAll(client, "loyalty_members", 'id,customer_name,"Note"');
  const vouchers = await fetchAll(client, "vouchers", "id,member_id,code,reward_text,reward_type,reward_index,issued_at,status");
  const vouchersByMember = new Map();
  for (const voucher of vouchers) {
    if (!vouchersByMember.has(voucher.member_id)) vouchersByMember.set(voucher.member_id, []);
    vouchersByMember.get(voucher.member_id).push(voucher);
  }

  const summary = {
    checkedMembers: 0,
    invalidBirthday: 0,
    existing: 0,
    createdActive: 0,
    createdExpired: 0,
    futureSkipped: 0,
    insertErrors: [],
    created: [],
  };

  for (const member of members) {
    if (!member?.id || !member.Note) continue;
    summary.checkedMembers += 1;
    const window = birthdayWindowForYear(member.Note, currentYear);
    if (!window) {
      summary.invalidBirthday += 1;
      continue;
    }
    if (window.windowStart > now) {
      summary.futureSkipped += 1;
      continue;
    }

    const existing = vouchersByMember.get(member.id) || [];
    const hasBirthdayThisYear = existing.some((voucher) => {
      if (!isBirthdayVoucher(voucher)) return false;
      const code = String(voucher.code || "").toUpperCase();
      if (code.startsWith(`BDAY${currentYear}`)) return true;
      if (!voucher.issued_at) return false;
      return manilaDateParts(new Date(voucher.issued_at)).year === currentYear;
    });
    if (hasBirthdayThisYear) {
      summary.existing += 1;
      continue;
    }

    const isActive = now <= window.windowEnd;
    const nextRewardIndex = Math.max(0, ...existing.map((voucher) => Number(voucher.reward_index) || 0)) + 1;
    const row = {
      member_id: member.id,
      reward_index: nextRewardIndex,
      code: `BDAY${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`,
      reward_text: REWARD_TEXT,
      issued_at: (isActive ? now : window.windowStart).toISOString(),
      expires_at: window.windowEnd.toISOString(),
      status: isActive ? "active" : "expired",
      reward_type: "birthday",
    };

    const { error } = await client.from("vouchers").insert(row);
    if (error) {
      summary.insertErrors.push({ member_id: member.id, customer_name: member.customer_name, error: error.message });
      continue;
    }

    if (isActive) summary.createdActive += 1;
    else summary.createdExpired += 1;
    summary.created.push({
      member_id: member.id,
      customer_name: member.customer_name,
      code: row.code,
      status: row.status,
      expires_at: row.expires_at,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.insertErrors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
