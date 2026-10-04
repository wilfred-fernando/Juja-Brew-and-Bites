export function normalizeLoyaltySearch(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchesLoyaltySearch(customer, query) {
  const normalized = normalizeLoyaltySearch(query);
  if (!normalized) return false;
  const name = normalizeLoyaltySearch(customer?.customer_name || customer?.name || customer?.full_name);
  const code = normalizeLoyaltySearch(customer?.customer_code || customer?.code);
  return normalized.split(' ').every(word => name.includes(word)) || code.includes(normalized);
}

export function loyaltySearchFilter(query) {
  // Strip PostgREST filter syntax and LIKE wildcards from customer input.
  const escaped = normalizeLoyaltySearch(query).replace(/[,%()_"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!escaped) return null;
  const nameFilters = escaped.split(' ').map(word => `customer_name.ilike.%${word}%`);
  const nameFilter = nameFilters.length > 1 ? `and(${nameFilters.join(',')})` : nameFilters[0];
  return `${nameFilter},customer_code.ilike.%${escaped}%`;
}
