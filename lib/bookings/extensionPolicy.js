export const EXTENSION_RATE_BY_PACKAGE = Object.freeze({
  1: 250,
  2: 500,
  3: 1500,
  4: 1000,
  5: 1500,
  6: 2500,
});

export const EXTENSION_AFTER_2AM_RATE_BY_PACKAGE = Object.freeze({
  1: 500,
  2: 750,
  3: 2000,
  4: 1500,
  5: 2000,
  6: 3000,
});

function peso(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH")}`;
}

export function packageExtensionRate(packageId) {
  return EXTENSION_RATE_BY_PACKAGE[Number(packageId)] || 0;
}

export function packageExtensionAfter2AmRate(packageId) {
  return EXTENSION_AFTER_2AM_RATE_BY_PACKAGE[Number(packageId)] || 0;
}

export function packageExtensionSummary(packageId) {
  const rate = packageExtensionRate(packageId);
  const after2AmRate = packageExtensionAfter2AmRate(packageId);
  if (!rate) return "Extensions are subject to availability and admin approval.";
  return `Extension: ${peso(rate)} per hour, subject to availability and admin approval. Time beyond 2:00 AM ${peso(after2AmRate)} per hour.`;
}

export function packageExtensionPolicyText(packageId) {
  const rate = packageExtensionRate(packageId);
  const after2AmRate = packageExtensionAfter2AmRate(packageId);
  const rateText = rate ? `${peso(rate)} per hour` : "the applicable package rate";
  const after2AmText = after2AmRate ? `${peso(after2AmRate)} per hour` : "the applicable late-night rate";
  return `Extension: ${rateText}, subject to availability and admin approval. Time beyond 2:00 AM ${after2AmText}.`;
}
