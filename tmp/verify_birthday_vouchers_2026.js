const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

function normalizeBirthday(value) {
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
  if (!Number.isNaN(readable.getTime())) {
    return { month: readable.getMonth() + 1, day: readable.getDate() };
  }

  return null;
}

function birthdayWindowForYear(birthday, year) {
  const parsed = normalizeBirthday(birthday);
  if (!parsed?.month || !parsed?.day) return null;
  const birthdayStart = manilaDateUtc(year, parsed.month, parsed.day);
  return {
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
  const vouchers = await fetchAll(client, "vouchers", "id,member_id,code,reward_text,reward_type,issued_at,status,expires_at");
  const vouchersByMember = new Map();
  for (const voucher of vouchers) {
    if (!vouchersByMember.has(voucher.member_id)) vouchersByMember.set(voucher.member_id, []);
    vouchersByMember.get(voucher.member_id).push(voucher);
  }

  const missing = [];
  const activeWindowMissing = [];
  const summary = {
    currentYear,
    checkedWithBirthday: 0,
    invalidBirthday: 0,
    futureBirthdayWindows: 0,
    eligiblePastOrActive: 0,
    birthdayVouchersThisYear: 0,
    activeBirthdayVouchers: 0,
    expiredBirthdayVouchers: 0,
    missingEligible: 0,
    activeWindowMissing: 0,
  };

  for (const member of members) {
    if (!member?.id || !member.Note) continue;
    summary.checkedWithBirthday += 1;
    const window = birthdayWindowForYear(member.Note, currentYear);
    if (!window) {
      summary.invalidBirthday += 1;
      continue;
    }

    if (window.windowStart > now) {
      summary.futureBirthdayWindows += 1;
      continue;
    }

    summary.eligiblePastOrActive += 1;
    const birthdayVouchers = (vouchersByMember.get(member.id) || []).filter((voucher) => {
      if (!isBirthdayVoucher(voucher)) return false;
      const code = String(voucher.code || "").toUpperCase();
      if (code.startsWith(`BDAY${currentYear}`)) return true;
      if (!voucher.issued_at) return false;
      return manilaDateParts(new Date(voucher.issued_at)).year === currentYear;
    });

    if (birthdayVouchers.length) {
      summary.birthdayVouchersThisYear += 1;
      if (birthdayVouchers.some((voucher) => voucher.status === "active")) summary.activeBirthdayVouchers += 1;
      if (birthdayVouchers.some((voucher) => voucher.status === "expired")) summary.expiredBirthdayVouchers += 1;
      continue;
    }

    const sample = {
      member_id: member.id,
      customer_name: member.customer_name,
      birthday: member.Note,
      birthday_window_start: window.windowStart.toISOString(),
      birthday_window_end: window.windowEnd.toISOString(),
    };
    missing.push(sample);
    if (now <= window.windowEnd) activeWindowMissing.push(sample);
  }

  summary.missingEligible = missing.length;
  summary.activeWindowMissing = activeWindowMissing.length;
  console.log(JSON.stringify({ summary, missingSample: missing.slice(0, 20), activeWindowMissingSample: activeWindowMissing.slice(0, 20) }, null, 2));
  if (missing.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
