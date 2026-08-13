const fs = require('fs');

const audit = JSON.parse(fs.readFileSync('tmp/recent_loyalty_point_discrepancies.json', 'utf8'));
const rows = audit.discrepancies || [];
const byStatus = Object.groupBy ? Object.groupBy(rows, (row) => row.audit_status) : rows.reduce((acc, row) => {
  (acc[row.audit_status] ||= []).push(row);
  return acc;
}, {});

const summary = Object.fromEntries(Object.entries(byStatus).map(([key, values]) => [key, values.length]));
const positiveNoEvent = rows.filter((row) => Number(row.stored_points) > 0 && Number(row.event_count) === 0);
const zeroPositiveSale = rows.filter((row) => Number(row.stored_points) === 0 && Number(row.sale_total) > 0);

console.log(JSON.stringify({
  startAt: audit.startAt,
  linkedSaleCount: audit.linkedSaleCount,
  discrepancyCount: audit.discrepancyCount,
  summary,
  positiveNoEvent: positiveNoEvent.map(({customer_name, customer_code, receipt_number, completed_at, sale_total, stored_points, member_points, member_available}) => ({customer_name, customer_code, receipt_number, completed_at, sale_total, stored_points, member_points, member_available})),
  zeroPositiveSale: zeroPositiveSale.map(({source_id, customer_name, customer_code, receipt_number, completed_at, sale_total, member_points, member_available}) => ({source_id, customer_name, customer_code, receipt_number, completed_at, sale_total, member_points, member_available})),
}, null, 2));
