import { resetMemberPointsIfExpired } from "@/lib/loyalty/annualReset";

export function isPointsVoucher(voucher) {
  const code = String(voucher?.code || "").toUpperCase();
  const rewardText = String(voucher?.reward_text || "").toLowerCase();
  return (
    voucher?.reward_type === "points" ||
    code.startsWith("PTS") ||
    rewardText.includes("100 points")
  );
}

export async function createMissingPointRewardVouchers(supabase, memberId) {
  if (!supabase || !memberId) return { created: 0 };

  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.id || !member?.user_id) return { created: 0, skipped: "not_linked" };

  const resetResult = await resetMemberPointsIfExpired(supabase, member);
  const activeMember = resetResult.member || member;
  const lifetimePoints = Number(activeMember["Points balance"] || activeMember["Available points"] || 0);
  const earnedVoucherCount = Math.floor(lifetimePoints / 100);
  if (earnedVoucherCount <= 0) return { created: 0 };

  const { data: existing, error: existingError } = await supabase
    .from("vouchers")
    .select("id, code, reward_text, reward_type")
    .eq("member_id", memberId);

  if (existingError) throw existingError;

  const existingPointsVouchers = (existing || []).filter(isPointsVoucher).length;
  const missingCount = earnedVoucherCount - existingPointsVouchers;
  if (missingCount <= 0) return { created: 0 };

  const now = Date.now();
  const rows = Array.from({ length: missingCount }, (_, idx) => {
    const voucherNumber = existingPointsVouchers + idx + 1;
    return {
      member_id: memberId,
      code: `PTS100-${voucherNumber}-${Math.floor(1000 + Math.random() * 9000)}`,
      reward_text: "FREE 16oz Drink, Waffle, or Mini Donuts (100 Points Reward)",
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + 90 * 86400000).toISOString(),
      status: "active",
      reward_type: "points",
    };
  });

  const { error: insertError } = await supabase.from("vouchers").insert(rows);
  if (insertError) throw insertError;

  return { created: rows.length };
}
