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

  // The compatibility path must obey the same campaign window as the RPC.
  // Never create a welcome voucher merely because an older database lacks the RPC.
  const { data: campaign, error: campaignError } = await supabase
    .from("voucher_campaigns")
    .select("id,code,reward_text,reward_type,validity_days,starts_at,ends_at,is_active")
    .eq("code", "WELCOME-VOUCHER")
    .maybeSingle();

  if (campaignError) throw campaignError;

  const campaignNow = Date.now();
  const campaignStartsAt = campaign?.starts_at ? new Date(campaign.starts_at).getTime() : 0;
  const campaignEndsAt = campaign?.ends_at ? new Date(campaign.ends_at).getTime() : 0;
  if (
    !campaign?.id ||
    !campaign.is_active ||
    (campaignStartsAt && campaignStartsAt > campaignNow) ||
    (campaignEndsAt && campaignEndsAt < campaignNow)
  ) {
    return { created: 0, skipped: "campaign_inactive" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("vouchers")
    .select("id, code, reward_text, reward_type, reward_index, status, expires_at, redeemed_at")
    .eq("member_id", memberId);

  if (existingError) throw existingError;
  if ((existing || []).some((voucher) => isWelcomeVoucher(voucher))) {
    return { created: 0, skipped: "exists" };
  }

  const now = Date.now();
  const validityDays = Math.max(1, Number(campaign.validity_days) || 15);
  const nextRewardIndex = Math.max(
    0,
    ...(existing || []).map((voucher) => Number(voucher?.reward_index) || 0)
  ) + 1;

  const code = `WELCOME-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: created, error: insertError } = await supabase
    .from("vouchers")
    .insert({
      member_id: memberId,
      reward_index: nextRewardIndex,
      code,
      reward_text: campaign.reward_text || WELCOME_VOUCHER_REWARD_TEXT,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + validityDays * 86400000).toISOString(),
      status: "active",
      reward_type: campaign.reward_type || "welcome",
      campaign_id: campaign.id,
      campaign_code: campaign.code,
    })
    .select("id, code")
    .maybeSingle();

  if (insertError) throw insertError;
  return { created: 1, voucherId: created?.id || null, code: created?.code || code };
}
