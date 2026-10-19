import { orderSlipLineKey } from './orderSlipDelivery.js';

export function shouldAutoPrintCupLabels(dining) {
  const label = String(dining || '').trim().toLowerCase();
  const compact = label.replace(/[^a-z0-9]+/g, '');
  return ['grabfood', 'shopeefood', 'foodpanda', 'takeout', 'takeaway'].some(name => compact.includes(name))
    || /^(grab|shopee)(?:\b|\d)/.test(label);
}

export function cupLabelJobs(cart, buildLabels) {
  const units = new Map();
  return cart.flatMap(line => {
    const key = orderSlipLineKey(line);
    return buildLabels([line]).map(text => {
      const unit = (units.get(key) || 0) + 1;
      units.set(key, unit);
      return {
        key: `cup:${key}:${unit}`, groupName: 'Cup Label', text,
        items: [{ cartItemId: 'label', quantity: 1 }],
      };
    });
  });
}
