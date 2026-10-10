import { isWelcomeVoucher } from "./loyalty/welcomeVoucher.js";

export function isWelcomeDrink(line) {
  if (!line || line.voided || line.isVoided || String(line.status || "").toLowerCase() === "voided") return false;
  const name = String(line.name || line.item || "").trim().toLowerCase();
  if (name !== "cheesecake milk tea") return false;
  const variants = [line.variantDetails, line.variant_details,
    ...(line.selectedOptions || line.selected_options || []).map(option => option.name || option.option_name || "")]
    .filter(Boolean).join(", ").toLowerCase();
  return !/\b(large|22\s*oz)\b/.test(variants) && /\b(regular|16\s*oz)\b/.test(variants);
}

export function welcomeVoucherDiscount(line) {
  return Number((Math.max(0, Number(line.unitPrice ?? line.price ?? 0))).toFixed(2));
}

export function welcomeVoucherSelectionError(cart, targetId) {
  const target = cart.find(line => line.cartItemId === targetId);
  if (!isWelcomeDrink(target)) return "Select a regular (16oz) Cheesecake Milk Tea for the Welcome Voucher.";
  if (target.discountRuleId || target.discount_rule_id || target.requiresDiscountBeneficiary ||
    Number(target._origDiscountAmount ?? (target.appliedVoucher || target.applied_voucher ? 0 : target.discountAmount ?? target.discount_amount) ?? 0) > 0) {
    return "Remove the item's other discount before applying the Welcome Voucher.";
  }
  const quantity = Number(target.quantity ?? target.qty ?? 0);
  const paidDrinks = cart.reduce((count,line) => {
    if (line.cartItemId === targetId || !isWelcomeDrink(line) || line.appliedVoucher || line.applied_voucher ||
      Number(line.discountAmount || line.discount_amount || 0) > 0) return count;
    return count + Number(line.quantity ?? line.qty ?? 0);
  }, 0);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity + paidDrinks < 2) {
    return "Add two regular Cheesecake Milk Teas, then apply the voucher to make one free.";
  }
  if (welcomeVoucherDiscount(target) <= 0) return "The selected drink must have a price before applying the voucher.";
  return "";
}

export function welcomeVoucherSettlementError(cart) {
  for (const line of cart) {
    if (!isWelcomeVoucher(line.appliedVoucher || line.applied_voucher)) continue;
    const error = welcomeVoucherSelectionError(cart, line.cartItemId);
    if (error) return error;
    if (Math.abs(Number(line.discountAmount ?? line.discount_amount ?? 0) - welcomeVoucherDiscount(line)) > 0.005) {
      return "Reapply the Welcome Voucher: only one regular Cheesecake Milk Tea should be free.";
    }
  }
  return "";
}

// A voucher on a single free-drink row also excludes its paid companion.
// Keep this derived from the current cart so removing the voucher restores earning.
export function welcomeVoucherPaidPartnerExclusions(cart) {
  const exclusions = new Map();
  for (const target of cart) {
    if (!isWelcomeVoucher(target.appliedVoucher || target.applied_voucher) || !isWelcomeDrink(target)) continue;
    if (Number(target.quantity ?? target.qty ?? 0) >= 2) continue;
    const partner = cart.find(line => {
      if (line.cartItemId === target.cartItemId || !isWelcomeDrink(line) ||
        line.appliedVoucher || line.applied_voucher || Number(line.discountAmount || line.discount_amount || 0) > 0) return false;
      return Number(line.quantity ?? line.qty ?? 0) > (exclusions.get(line.cartItemId)?.quantity || 0);
    });
    if (partner) {
      const previous = exclusions.get(partner.cartItemId) || { quantity: 0, amount: 0 };
      exclusions.set(partner.cartItemId, {
        quantity: previous.quantity + 1,
        amount: previous.amount + welcomeVoucherDiscount(partner),
      });
    }
  }
  return exclusions;
}
