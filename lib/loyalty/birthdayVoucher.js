const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const BIRTHDAY_VOUCHER_REWARD_TEXT = "FREE 16oz Drink or Waffle (Birthday Reward)";
export const BIRTHDAY_VOUCHER_WINDOW_DAYS = 2;

function manilaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: String(map.year || ""),
    month: String(map.month || ""),
    day: String(map.day || ""),
  };
}

function normalizeBirthdayMonthDay(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}-${iso[3]}`;

  const legacy = text.match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})$/);
  if (legacy) {
    const monthIndex = MONTH_NAMES.findIndex((month) => month.toLowerCase() === legacy[2].toLowerCase());
    if (monthIndex >= 0) return `${String(monthIndex + 1).padStart(2, "0")}-${legacy[3].padStart(2, "0")}`;
  }

  const readable = new Date(text);
  if (!Number.isNaN(readable.getTime())) {
    const month = String(readable.getMonth() + 1).padStart(2, "0");
    const day = String(readable.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  }

  return "";
}

function manilaDateUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second, millisecond));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

export function isBirthdayVoucher(voucher) {
  const code = String(voucher?.code || "").toUpperCase();
  const rewardText = String(voucher?.reward_text || "").toLowerCase();
  return voucher?.reward_type === "birthday" || code.startsWith("BDAY") || rewardText.includes("birthday");
}

export function getBirthdayVoucherWindow(birthday, now = new Date()) {
  const monthDay = normalizeBirthdayMonthDay(birthday);
  if (!monthDay) return null;

  const [monthText, dayText] = monthDay.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  if (!month || !day) return null;

  const currentYear = Number(manilaDateParts(now).year);
  const candidates = [currentYear - 1, currentYear, currentYear + 1];

  for (const year of candidates) {
    const birthdayStart = manilaDateUtc(year, month, day);
    const windowStart = addDays(birthdayStart, -BIRTHDAY_VOUCHER_WINDOW_DAYS);
    const windowEnd = addDays(manilaDateUtc(year, month, day, 23, 59, 59, 999), BIRTHDAY_VOUCHER_WINDOW_DAYS);
    if (now >= windowStart && now <= windowEnd) {
      return { year, month, day, windowStart, windowEnd, birthdayStart, active: true };
    }
  }

  const birthdayThisYear = manilaDateUtc(currentYear, month, day);
  const windowStart = addDays(birthdayThisYear, -BIRTHDAY_VOUCHER_WINDOW_DAYS);
  const windowEnd = addDays(manilaDateUtc(currentYear, month, day, 23, 59, 59, 999), BIRTHDAY_VOUCHER_WINDOW_DAYS);
  return { year: currentYear, month, day, windowStart, windowEnd, birthdayStart: birthdayThisYear, active: false };
}

export function isBirthdayVoucherWindowActive(birthday, now = new Date()) {
  return getBirthdayVoucherWindow(birthday, now)?.active === true;
}

export async function createBirthdayVoucherIfNeeded(supabase, memberId, now = new Date(), options = {}) {
  if (!supabase || !memberId) return { created: 0, skipped: "missing_input" };

  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select('id,user_id,"Note"')
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.id) return { created: 0, skipped: "member_not_found" };
  const birthdayWindow = getBirthdayVoucherWindow(member.Note, now);
  if (!birthdayWindow) return { created: 0, skipped: "invalid_birthday" };
  const allowExpiredBackfill = options.allowExpiredBackfill === true;
  if (!birthdayWindow.active && !allowExpiredBackfill) return { created: 0, skipped: "not_birthday_window" };

  const { data: existing, error: existingError } = await supabase
    .from("vouchers")
    .select("id, code, reward_text, reward_type, reward_index, issued_at")
    .eq("member_id", memberId);

  if (existingError) throw existingError;

  const alreadyHasBirthdayThisYear = (existing || []).some((voucher) => {
    if (!isBirthdayVoucher(voucher)) return false;
    const code = String(voucher?.code || "").toUpperCase();
    if (code.startsWith(`BDAY${birthdayWindow.year}`)) return true;
    if (!voucher?.issued_at) return false;
    return manilaDateParts(new Date(voucher.issued_at)).year === String(birthdayWindow.year);
  });

  if (alreadyHasBirthdayThisYear) return { created: 0, skipped: "exists" };

  const nextRewardIndex = Math.max(
    0,
    ...(existing || []).map((voucher) => Number(voucher?.reward_index) || 0)
  ) + 1;

  const issueDate = birthdayWindow.active ? now : birthdayWindow.windowStart;
  const status = birthdayWindow.active ? "active" : "expired";
  const code = `BDAY${birthdayWindow.year}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: created, error: insertError } = await supabase
    .from("vouchers")
    .insert({
      member_id: memberId,
      reward_index: nextRewardIndex,
      code,
      reward_text: BIRTHDAY_VOUCHER_REWARD_TEXT,
      issued_at: issueDate.toISOString(),
      expires_at: birthdayWindow.windowEnd.toISOString(),
      status,
      reward_type: "birthday",
    })
    .select("id, code")
    .maybeSingle();

  if (insertError) throw insertError;
  return { created: 1, voucherId: created?.id || null, code: created?.code || code, status };
}
