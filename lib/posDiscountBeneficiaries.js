export function requiredBeneficiaryTypeForRule(rule) {
  const name = String(rule?.name || rule?.discount_name || "").toLowerCase();
  if (/\bqcid\b|\bqc\s+id\b/.test(name)) return "qcid";
  const senior = /\bsc\b|\bsenior\b/.test(name);
  const pwd = /\bpwd\b/.test(name);
  // A combined (or generically named) beneficiary discount accepts both types.
  if (senior === pwd) return null;
  return pwd ? "pwd" : "senior_citizen";
}

export function beneficiaryMatchesRule(type, requiredType) {
  if (requiredType === "qcid") return type === "qcid";
  return ["senior_citizen", "pwd"].includes(type) && (!requiredType || type === requiredType);
}

export function beneficiaryTypeLabel(type) {
  if (type === "pwd") return "PWD";
  if (type === "qcid") return "QCID";
  if (type === "senior_citizen") return "SC";
  return "Beneficiary";
}

export function beneficiaryResidencyLabel(status) {
  if (status === "resident") return "Resident";
  if (status === "non_resident") return "Non-resident";
  return "";
}

export function beneficiaryCategoryLabel(type, residencyStatus) {
  if (type === "senior_citizen") return "Senior Citizen";
  if (type === "pwd") return "PWD";
  if (type === "qcid" && residencyStatus === "resident") return "QCID Resident";
  if (type === "qcid" && residencyStatus === "non_resident") return "QCID Non-resident";
  return beneficiaryTypeLabel(type);
}
