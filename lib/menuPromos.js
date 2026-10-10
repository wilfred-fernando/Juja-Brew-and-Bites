import { isWelcomeVoucher } from "./loyalty/welcomeVoucher.js";

export function normalizePromoText(value) {
  return String(value || "").trim().toLowerCase();
}

export function isPromoCategoryName(categoryName) {
  const normalized = normalizePromoText(categoryName);
  return normalized === "promo" || normalized === "promos" || normalized === "promotion" || normalized === "promotions";
}

export function isPromoMenuItem(item) {
  return isPromoCategoryName(item?.category || item?.category_name || item?.categoryName);
}

export function isVoucherAvailable(voucher, now = Date.now()) {
  const status = normalizePromoText(voucher?.status || "active");
  const expiresAt = voucher?.expires_at ? new Date(voucher.expires_at).getTime() : 0;
  return ["active", "available"].includes(status) && !voucher?.redeemed_at && (!expiresAt || expiresAt > now);
}

export function voucherMatchesMenuItem(voucher, item) {
  if (!voucher || !item) return false;
  const haystack = normalizePromoText([
    voucher.code,
    voucher.reward_text,
    voucher.reward_type,
    voucher.description,
    voucher.title,
  ].filter(Boolean).join(" "));
  const itemName = normalizePromoText(item.name);
  if (!haystack || !itemName) return false;
  if (haystack.includes(itemName)) return true;

  const tokens = itemName
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["milk", "tea", "with", "free", "buy", "get"].includes(token));
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function findVoucherForMenuItem(vouchers = [], item) {
  if (!isPromoMenuItem(item)) return null;
  return (vouchers || []).find((voucher) => isVoucherAvailable(voucher) && voucherMatchesMenuItem(voucher, item)) || null;
}

export function isLoyaltyPointEligibleLine(line) {
  return !isPromoMenuItem(line) && !isQcidPromoLine(line);
}

export function isQcidPromoLine(line) {
  const details = line?.source_metadata?.pos_line_details || line?.pos_line_details || {};
  const type = String(line?.discountBeneficiaryType || line?.discountBeneficiary?.beneficiary_type ||
    line?.discount_beneficiary_type || details.discountBeneficiaryType || "").trim().toLowerCase();
  const name = [line?.discountName, line?.discount_name, details.discountName, details.discount_name]
    .filter(Boolean).join(" ");
  return type === "qcid" || /\bqcid\b|\bqc\s+id\b/i.test(name);
}

export function loyaltyEligibleLineTotal(line, netAmount) {
  if (!isLoyaltyPointEligibleLine(line)) return 0;
  if (isWelcomeVoucher(line?.appliedVoucher || line?.applied_voucher)) return 0;
  return Number(netAmount || 0);
}
