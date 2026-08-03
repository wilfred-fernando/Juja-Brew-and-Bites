export function normalizePublicHttpUrl(value) {
  const raw = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  const match = raw.match(/https?:\/\/[^\s'"]+/i);
  return match ? match[0].replace(/\/+$/, "") : "";
}
