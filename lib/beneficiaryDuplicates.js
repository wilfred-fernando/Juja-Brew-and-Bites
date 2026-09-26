const words = (name) => String(name || "").normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
const normalizeId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function findBeneficiaryDuplicates(records, name, idNumber, type) {
  const tokens = words(name);
  const id = normalizeId(idNumber);
  return records.filter((record) => {
    const other = words(record.full_name);
    const sameProgram = record.beneficiary_type === type ||
      (["pwd", "senior_citizen"].includes(type) && ["pwd", "senior_citizen"].includes(record.beneficiary_type));
    const matchingName = tokens.length >= 2 && other.length >= 2 &&
      (tokens.every((word) => other.includes(word)) || other.every((word) => tokens.includes(word)));
    return sameProgram && ((id.length >= 3 && id === normalizeId(record.id_number)) || matchingName);
  });
}
