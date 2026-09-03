function hasLineDiscount(line) {
  return Boolean(
    line.requiresDiscountBeneficiary ||
    line.discountBeneficiaryId ||
    line.discountBeneficiary?.id ||
    line.discountRuleId ||
    line.discount_rule_id ||
    Number(line.discountAmount || line.discount_amount || 0) > 0 ||
    line.appliedVoucher ||
    line.applied_voucher
  );
}

// Discount amounts and beneficiary entitlements belong to individual entries.
// Merging their quantities would discard the incoming entry's discount or ID.
export function addPosCartLine(cart, addedLine, editIndex = null) {
  if (editIndex !== null) {
    return cart.map((line, index) => index === editIndex ? addedLine : line);
  }

  const mergeIndex = hasLineDiscount(addedLine) ? -1 : cart.findIndex((line) =>
    !hasLineDiscount(line) &&
    !line.voided && !line.isVoided && String(line.status || "").toLowerCase() !== "voided" &&
    line.id === addedLine.id &&
    line.unitPrice === addedLine.unitPrice &&
    line.variantDetails === addedLine.variantDetails &&
    line.instructions === addedLine.instructions
  );

  if (mergeIndex < 0) return [...cart, addedLine];
  return cart.map((line, index) => index === mergeIndex
    ? { ...line, quantity: Number(line.quantity) + Number(addedLine.quantity) }
    : line);
}
