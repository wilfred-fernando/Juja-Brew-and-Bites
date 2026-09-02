export const EXTENSION_AFTER_2AM_SURCHARGE = 250;

export const EXTENSION_RATE_BY_PACKAGE = Object.freeze({
  1: 250,
  2: 750,
  3: 1500,
  4: 1000,
  5: 1500,
  6: 2500,
});

function peso(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH")}`;
}

export function packageExtensionRate(packageId) {
  return EXTENSION_RATE_BY_PACKAGE[Number(packageId)] || 0;
}

export function packageExtensionSummary(packageId) {
  const rate = packageExtensionRate(packageId);
  if (!rate) return "Extensions are subject to availability and admin approval.";
  return `Extension: ${peso(rate)} per hour, subject to availability and admin approval. Time beyond 2:00 AM adds ${peso(EXTENSION_AFTER_2AM_SURCHARGE)} per hour.`;
}

export function packageExtensionPolicyText(packageId) {
  const rate = packageExtensionRate(packageId);
  const rateText = rate ? `${peso(rate)} per hour` : "the applicable package rate";
  return `Extension rate: ${rateText}, subject to availability and admin approval. Approved time beyond 2:00 AM costs an additional ${peso(EXTENSION_AFTER_2AM_SURCHARGE)} per hour, on top of the package extension rate.`;
}
