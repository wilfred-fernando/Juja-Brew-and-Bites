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
  const previousLine = editIndex === null ? null : cart[editIndex];
  // Split rows share the original kitchen identity so KDS compares their combined quantity.
  const kitchenSourceId = previousLine?.kdsSourceCartItemId || addedLine.kdsSourceCartItemId ||
    previousLine?.cartItemId || addedLine.cartItemId;
  if (previousLine?.kdsSourceCartItemId) {
    addedLine = { ...addedLine, kdsSourceCartItemId: kitchenSourceId };
  }
  const quantity = Number(addedLine.quantity);
  const hasItemDiscount = Boolean(addedLine.discountRuleId || addedLine.discount_rule_id ||
    addedLine.requiresDiscountBeneficiary || Number(addedLine.discountAmount || addedLine.discount_amount || 0) > 0);
  if (hasItemDiscount && quantity > 1) {
    const discountedLine = { ...addedLine, quantity: 1, kdsSourceCartItemId: kitchenSourceId };
    const regularLine = { ...addedLine, quantity: quantity - 1,
      kdsSourceCartItemId: kitchenSourceId,
      cartItemId: `${addedLine.cartItemId}-regular-${globalThis.crypto.randomUUID()}` };
    for (const key of Object.keys(regularLine)) {
      if (/^discount/i.test(key) || key === "requiresDiscountBeneficiary" ||
        key === "appliedVoucher" || key === "applied_voucher") delete regularLine[key];
    }
    regularLine.discountAmount = 0;
    // Keep both rows adjacent, including when editing a saved ticket.
    if (editIndex !== null) {
      return cart.flatMap((line, index) => index === editIndex ? [discountedLine, regularLine] : [line]);
    }
    return [...cart, discountedLine, regularLine];
  }
  if (editIndex !== null) {
    return cart.map((line, index) => index === editIndex ? addedLine : line);
  }

  const mergeIndex = hasLineDiscount(addedLine) ? -1 : cart.findIndex((line) =>
    !hasLineDiscount(line) &&
    // Preserve split provenance when later adding the same regular-price item.
    ((!line.kdsSourceCartItemId && !addedLine.kdsSourceCartItemId) ||
      (line.kdsSourceCartItemId || line.cartItemId) === addedLine.kdsSourceCartItemId) &&
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
