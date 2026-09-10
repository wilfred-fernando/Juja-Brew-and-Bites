function isPublicVariantGroup(group) {
  return group
    && !group.posOnly
    && !group.hidePublic
    && !group.hide_public
    && group.isAvailable !== false
    && group.is_available !== false
    && Array.isArray(group.options)
    && group.options.length > 0;
}

export function menuCardPrice(item) {
  const basePrice = Number(item?.price);
  if (Number.isFinite(basePrice) && basePrice > 0) return basePrice;

  const firstVariant = (item?.variants || []).find(isPublicVariantGroup);
  const optionPrices = (firstVariant?.options || [])
    .filter((option) => option?.isAvailable !== false && option?.is_available !== false)
    .map((option) => Number(option?.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  return optionPrices.length > 0
    ? Math.min(...optionPrices)
    : (Number.isFinite(basePrice) ? basePrice : 0);
}
