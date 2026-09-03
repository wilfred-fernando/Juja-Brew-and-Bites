export function formatBeneficiaryName(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-PH")
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase("en-PH")}`);
}
