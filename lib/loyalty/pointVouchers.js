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

export function isUsablePointsVoucher(voucher, now = Date.now()) {
  if (!isPointsVoucher(voucher)) return false;
  const status = String(voucher?.status || "").toLowerCase();
  const expiryMs = voucher?.expires_at ? new Date(voucher.expires_at).getTime() : 0;

  if (status === "redeemed" || voucher?.redeemed_at) return false;
  if (status === "expired") return false;
  if (expiryMs && expiryMs <= now) return false;
  return true;
}

function voucherCodeSuffix() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1000000).toString(36)}`.slice(-8).toUpperCase();
}

export async function createMissingPointRewardVouchers(supabase, memberId) {
  if (!supabase || !memberId) return { created: 0 };

  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.id) return { created: 0, skipped: "not_found" };

  const resetResult = await resetMemberPointsIfExpired(supabase, member);
  const activeMember = resetResult.member || member;
  const availablePoints = Number(activeMember["Available points"] || 0);

  const { error: rpcError } = await supabase.rpc("ensure_vouchers_for_member", { p_member_id: memberId });
  if (!rpcError) {
    const { data: refreshedMember } = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    return { created: null, member: refreshedMember || activeMember };
  }

  const voucherCount = Math.floor(availablePoints / 100);
  if (voucherCount <= 0) return { created: 0, member: activeMember };

  const now = Date.now();
  const rows = Array.from({ length: voucherCount }, (_, idx) => {
    const voucherNumber = idx + 1;
    return {
      member_id: memberId,
      code: `PTS100-${voucherNumber}-${voucherCodeSuffix()}`,
      reward_text: "FREE 16oz Drink, Waffle, or Mini Donuts (100 Points Reward)",
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + 90 * 86400000).toISOString(),
      status: "active",
      reward_type: "points",
      points_consumed: 100,
      points_consumed_at: new Date(now).toISOString(),
    };
  });

  const { error: insertError } = await supabase.from("vouchers").insert(rows);
  if (insertError) throw insertError;

  const nextAvailable = Math.max(0, Number((availablePoints - rows.length * 100).toFixed(2)));
  const { data: updatedMember, error: updateError } = await supabase
    .from("loyalty_members")
    .update({ "Available points": nextAvailable })
    .eq("id", memberId)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;

  return { created: rows.length, member: updatedMember || activeMember };
}
