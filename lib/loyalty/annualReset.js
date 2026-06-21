const AVAILABLE_POINT_FIELDS = ["Available points", "available_points"];

function manilaYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "year")?.value || date.getUTCFullYear());
}

export function currentLoyaltyResetBoundary(date = new Date()) {
  const year = manilaYear(date);
  return new Date(Date.UTC(year - 1, 11, 31, 16, 0, 0, 0));
}

function numericPointValue(member) {
  return AVAILABLE_POINT_FIELDS.reduce((max, field) => Math.max(max, Number(member?.[field] || 0)), 0);
}

export function memberNeedsAnnualPointReset(member, date = new Date()) {
  if (!member?.id) return false;
  if (numericPointValue(member) <= 0) return false;

  const boundary = currentLoyaltyResetBoundary(date);
  const lastReset = member.points_reset_at ? new Date(member.points_reset_at) : null;
  if (lastReset && !Number.isNaN(lastReset.getTime()) && lastReset >= boundary) return false;

  const lastTouched = new Date(member.updated_at || member.created_at || 0);
  return Number.isNaN(lastTouched.getTime()) || lastTouched < boundary;
}

export function applyAnnualPointResetToMember(member, date = new Date()) {
  if (!memberNeedsAnnualPointReset(member, date)) return member;

  const resetAt = currentLoyaltyResetBoundary(date).toISOString();
  const next = { ...member };
  AVAILABLE_POINT_FIELDS.forEach((field) => {
    if (field in next) next[field] = 0;
  });
  if ("points_reset_at" in next) next.points_reset_at = resetAt;
  return next;
}

export async function resetMemberPointsIfExpired(supabase, member, date = new Date()) {
  if (!supabase || !memberNeedsAnnualPointReset(member, date)) {
    return { member, reset: false };
  }

  const resetAt = currentLoyaltyResetBoundary(date).toISOString();
  const updatePayload = {};
  AVAILABLE_POINT_FIELDS.forEach((field) => {
    if (field in member) updatePayload[field] = 0;
  });
  if ("points_reset_at" in member) updatePayload.points_reset_at = resetAt;
  if ("updated_at" in member) updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("loyalty_members")
    .update(updatePayload)
    .eq("id", member.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return { member: data || applyAnnualPointResetToMember(member, date), reset: true };
}
