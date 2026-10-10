export function orderSlipLineKey(line) {
  return String(line.kdsSourceCartItemId || line.cartItemId || JSON.stringify([
    line.menuItemId || line.menu_item_id || line.id, line.name,
    line.variantDetails || line.variant_details || '', line.instructions || '',
  ]));
}

export function withCustomerOrderSlip(jobs, items) {
  if (!items.length) return jobs;
  return [...jobs, {
    key: 'customer-copy',
    groupName: 'Customer Copy',
    slipTitle: 'CUSTOMER COPY ORDER SLIP',
    items,
  }];
}

// Persist acknowledgement only after the printer write completes. A failed
// group remains unprinted while other groups can still finish successfully.
export async function deliverOrderSlips({ jobs, load, persist, print }) {
  const printed = { ...(await load() || {}) };
  let count = 0;
  const errors = [];
  for (const job of jobs) {
    const quantities = new Map();
    const items = job.items.map(line => {
      const key = `${job.key}:${orderSlipLineKey(line)}`;
      const nextQuantity = (quantities.get(key) || 0) + Number(line.quantity || line.qty || 1);
      const previousQuantity = quantities.get(key) || 0;
      quantities.set(key, nextQuantity);
      const quantity = Math.max(0, nextQuantity - Math.max(previousQuantity, Number(printed[key] || 0)));
      return { ...line, quantity, qty: quantity };
    }).filter(line => line.quantity > 0);
    if (!items.length) continue;
    try {
      await print({ ...job, items });
      quantities.forEach((quantity, key) => { printed[key] = Math.max(Number(printed[key] || 0), quantity); });
      await persist(printed);
      count++;
    } catch (error) { errors.push(`${job.groupName}: ${error.message || error}`); }
  }
  if (errors.length) throw new Error(`Unprinted order slips will be retried on the next save or charge. ${errors.join('; ')}`);
  return count;
}
