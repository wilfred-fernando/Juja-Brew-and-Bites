import { sendCustomerVoucherPush, serviceSupabase } from "@/lib/push/customerPush";
import {
  createBirthdayVoucherIfNeeded,
  isBirthdayVoucherWindowActive,
} from "@/lib/loyalty/birthdayVoucher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || process.env.VOUCHER_PUSH_SECRET;
  if (!secret) return false;
  const auth = String(req.headers.get("authorization") || "").trim();
  const headerSecret = String(req.headers.get("x-cron-secret") || "").trim();
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

function manilaDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function daySerial(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function manilaDaysUntil(dateValue, now = new Date()) {
  return daySerial(manilaDateKey(dateValue)) - daySerial(manilaDateKey(now));
}

async function notifyVoucher(admin, voucherId, eventType) {
  try {
    return await sendCustomerVoucherPush({ voucherId, eventType, adminClient: admin });
  } catch (error) {
    return { sent: 0, failed: 1, error: error?.message || "Voucher push failed." };
  }
}

async function ensureBirthdayVouchers(admin, now) {
  const pageSize = 1000;
  const members = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("loyalty_members")
      .select('id,"Note"')
      .not("Note", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    members.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  const candidates = members.filter((member) => isBirthdayVoucherWindowActive(member.Note, now));
  const created = [];
  const failures = [];

  for (const member of candidates) {
    try {
      const result = await createBirthdayVoucherIfNeeded(admin, member.id, now);
      if (result.created && result.voucherId) {
        const push = await notifyVoucher(admin, result.voucherId, "earned");
        created.push({ memberId: member.id, ...result, push });
      }
    } catch (error) {
      failures.push({ memberId: member.id, error: error?.message || "Birthday voucher creation failed." });
    }
  }

  return { checked: candidates.length, created, failures };
}

async function runVoucherNotifications(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Voucher notification cron is not authorized." }, { status: 401 });
  }

  const admin = serviceSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const birthdayVouchers = await ensureBirthdayVouchers(admin, now);
  const upperIso = new Date(now.getTime() + 4 * 86400000).toISOString();
  const lowerIso = new Date(now.getTime() - 7 * 86400000).toISOString();

  const { data: expiringVouchers, error: expiringError } = await admin
    .from("vouchers")
    .select("id,expires_at,status")
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", upperIso);

  if (expiringError) throw expiringError;

  const expiredCandidates = (expiringVouchers || []).filter((voucher) => new Date(voucher.expires_at).getTime() <= now.getTime());
  const expiredCandidateIds = expiredCandidates.map((voucher) => voucher.id).filter(Boolean);
  if (expiredCandidateIds.length) {
    const { error: updateExpiredError } = await admin
      .from("vouchers")
      .update({ status: "expired" })
      .in("id", expiredCandidateIds)
      .eq("status", "active");
    if (updateExpiredError) throw updateExpiredError;
  }

  const jobs = [];
  for (const voucher of expiringVouchers || []) {
    const daysUntil = manilaDaysUntil(voucher.expires_at, now);
    if (daysUntil === 3) jobs.push({ voucherId: voucher.id, eventType: "expiring_3_days" });
    if (daysUntil === 1) jobs.push({ voucherId: voucher.id, eventType: "expiring_1_day" });
    if (daysUntil === 0) jobs.push({ voucherId: voucher.id, eventType: "expiring_today" });
    if (daysUntil < 0 || new Date(voucher.expires_at).getTime() <= now.getTime()) {
      jobs.push({ voucherId: voucher.id, eventType: "expired" });
    }
  }

  const { data: recentlyExpired, error: recentlyExpiredError } = await admin
    .from("vouchers")
    .select("id")
    .eq("status", "expired")
    .not("expires_at", "is", null)
    .gte("expires_at", lowerIso)
    .lte("expires_at", nowIso);

  if (recentlyExpiredError) throw recentlyExpiredError;
  for (const voucher of recentlyExpired || []) {
    jobs.push({ voucherId: voucher.id, eventType: "expired" });
  }

  const uniqueJobs = Array.from(
    new Map(jobs.map((job) => [`${job.voucherId}:${job.eventType}`, job])).values()
  );
  const results = [];
  for (const job of uniqueJobs) {
    results.push({ ...job, ...(await notifyVoucher(admin, job.voucherId, job.eventType)) });
  }

  return Response.json({
    success: true,
    checkedAt: nowIso,
    birthdayVouchers: {
      checked: birthdayVouchers.checked,
      created: birthdayVouchers.created.length,
      failed: birthdayVouchers.failures.length,
      results: birthdayVouchers.created,
      failures: birthdayVouchers.failures,
    },
    jobs: uniqueJobs.length,
    sent: results.reduce((sum, result) => sum + Number(result.sent || 0), 0),
    failed: results.reduce((sum, result) => sum + Number(result.failed || 0), 0),
    results,
  });
}

export async function GET(req) {
  try {
    return await runVoucherNotifications(req);
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to process voucher notifications." }, { status: 500 });
  }
}

export async function POST(req) {
  return GET(req);
}
