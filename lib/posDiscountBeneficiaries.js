export function requiredBeneficiaryTypeForRule(rule) {
  const name = String(rule?.name || rule?.discount_name || "").toLowerCase();
  const senior = /\bsc\b|\bsenior\b/.test(name);
  const pwd = /\bpwd\b/.test(name);
  // A combined (or generically named) beneficiary discount accepts both types.
  if (senior === pwd) return null;
  return pwd ? "pwd" : "senior_citizen";
}

export function beneficiaryMatchesRule(type, requiredType) {
  return ["senior_citizen", "pwd"].includes(type) && (!requiredType || type === requiredType);
}
