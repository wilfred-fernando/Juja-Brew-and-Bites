const timestamp = row => Date.parse(row.paid_at || row.created_at || row.completed_at || 0) || 0;
export function mergeReceiptCache(previous = {}, incoming = {}, now = Date.now()) {
  const cutoff = now - 15 * 86400000;
  const byNumber = new Map();
  const staleNumbers = new Set();
  for (const row of [...(previous.rows || []), ...(incoming.rows || [])]) {
    if (!row.receipt_number) continue;
    const key = String(row.receipt_number);
    const existing = byNumber.get(key);
    const revision = value => Date.parse(value?.updated_at || '') || timestamp(value || {});
    if (existing && revision(existing) > revision(row)) { staleNumbers.add(key); continue; }
    byNumber.set(key, row);
  }
  const rows = Array.from(byNumber.values())
    .filter(row => timestamp(row) >= cutoff).sort((a, b) => timestamp(b) - timestamp(a));
  const numbers = new Set(rows.map(row => String(row.receipt_number)));
  const incomingItems = (incoming.itemRows || []).filter(row => !staleNumbers.has(String(row.receipt_number)));
  const replacedItems = new Set(incomingItems.map(row => String(row.receipt_number)));
  const itemRows = Array.from(new Map([...(previous.itemRows || []).filter(row => !replacedItems.has(String(row.receipt_number))), ...incomingItems]
    .filter(row => numbers.has(String(row.receipt_number)))
    .map(row => [`${row.receipt_number}:${row.id}`, row])).values());
  return { rows, itemRows };
}

export function preferredReceiptNumber(rows, current) {
  const selected = rows.find(row => row.receipt_number === current);
  const day = row => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp(row)));
  return selected && rows[0] && day(selected) === day(rows[0]) ? current : rows[0]?.receipt_number || '';
}
