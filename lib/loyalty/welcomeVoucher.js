export const WELCOME_VOUCHER_REWARD_TEXT = "B1T1 16oz Cheesecake Milk Tea (Welcome Voucher)";

export function isWelcomeVoucher(voucher) {
  const code = String(voucher?.code || "").toUpperCase();
  const rewardText = String(voucher?.reward_text || "").toLowerCase();
  return voucher?.reward_type === "welcome" || code.startsWith("WELCOME") || rewardText.includes("welcome voucher");
}

export function isUsableWelcomeVoucher(voucher, now = Date.now()) {
  if (!isWelcomeVoucher(voucher)) return false;
  const status = String(voucher?.status || "").toLowerCase();
  const expiryMs = voucher?.expires_at ? new Date(voucher.expires_at).getTime() : 0;

  if (status === "redeemed" || voucher?.redeemed_at) return false;
  if (status === "expired") return false;
  if (expiryMs && expiryMs <= now) return false;
  return true;
}

export async function createWelcomeVoucherIfNeeded(supabase, memberId) {
  if (!supabase || !memberId) return { created: 0 };

  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select("id,user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.id) return { created: 0, skipped: "member_not_found" };
  if (!member.user_id) return { created: 0, skipped: "not_linked" };

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_welcome_voucher_if_needed", {
    p_member_id: memberId,
  });

  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return {
      created: Number(row?.created || 0),
      voucherId: row?.voucher_id || null,
      code: row?.code || null,
      skipped: row?.skipped || "",
    };
  }

  if (!/create_welcome_voucher_if_needed/i.test(rpcError.message || "")) {
    throw rpcError;
  }

  // Fail closed until the database eligibility migration is installed.
  return { created: 0, skipped: "eligibility_migration_required" };
}
