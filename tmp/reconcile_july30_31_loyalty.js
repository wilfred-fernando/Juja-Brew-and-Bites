/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const result = await client.query(`
    with period_orders as (
      select
        o.loyalty_member_id as member_id,
        count(*) as order_count,
        round(sum(coalesce(o.loyalty_points_awarded, 0))::numeric, 2) as period_points,
        min(o.created_at) as first_order_at,
        max(o.created_at) as last_order_at,
        array_agg(o.receipt_number order by o.created_at) as receipts
      from public.orders o
      where o.loyalty_member_id is not null
        and o.created_at >= timestamptz '2026-07-30 00:00:00+08'
        and o.created_at <  timestamptz '2026-08-01 00:00:00+08'
        and coalesce(o.loyalty_points_awarded, 0) > 0
        and lower(coalesce(o.status, '')) not in ('refunded', 'voided', 'cancelled', 'canceled')
      group by o.loyalty_member_id
    ),
    point_vouchers as (
      select
        v.member_id,
        round(sum(coalesce(v.points_consumed, 0))::numeric, 2) as consumed_points,
        count(*) filter (where coalesce(v.points_consumed, 0) > 0) as voucher_count
      from public.vouchers v
      where coalesce(v.points_consumed, 0) > 0
      group by v.member_id
    ),
    post_reset_vouchers as (
      select
        v.member_id,
        round(sum(coalesce(v.points_consumed, 0))::numeric, 2) as consumed_points
      from public.vouchers v
      join public.loyalty_members lm on lm.id = v.member_id
      where coalesce(v.points_consumed, 0) > 0
        and coalesce(v.points_consumed_at, v.issued_at, v.created_at) >= coalesce(lm.points_reset_at, '-infinity'::timestamptz)
      group by v.member_id
    ),
    repairs as (
      select
        r.member_id,
        round(sum(coalesce(r.available_points_delta, 0))::numeric, 2) as repair_points
      from public.loyalty_point_balance_repairs r
      group by r.member_id
    ),
    all_tracked_orders as (
      select
        o.loyalty_member_id as member_id,
        round(sum(coalesce(o.loyalty_points_awarded, 0))::numeric, 2) as tracked_order_points,
        count(*) as tracked_order_count
      from public.orders o
      where o.loyalty_member_id is not null
        and coalesce(o.loyalty_points_awarded, 0) > 0
        and lower(coalesce(o.status, '')) not in ('refunded', 'voided', 'cancelled', 'canceled')
      group by o.loyalty_member_id
    ),
    post_reset_orders as (
      select
        o.loyalty_member_id as member_id,
        round(sum(coalesce(o.loyalty_points_awarded, 0))::numeric, 2) as tracked_points
      from public.orders o
      join public.loyalty_members lm on lm.id = o.loyalty_member_id
      where o.loyalty_member_id is not null
        and coalesce(o.loyalty_points_awarded, 0) > 0
        and o.created_at >= coalesce(lm.points_reset_at, '-infinity'::timestamptz)
        and lower(coalesce(o.status, '')) not in ('refunded', 'voided', 'cancelled', 'canceled')
      group by o.loyalty_member_id
    )
    select
      lm.id,
      lm.customer_name,
      lm.customer_code,
      round(coalesce(lm."Points balance", 0)::numeric, 2) as lifetime_points,
      round(coalesce(lm."Available points", 0)::numeric, 2) as available_points,
      lm.points_reset_at,
      po.order_count,
      po.period_points,
      po.first_order_at,
      po.last_order_at,
      po.receipts,
      coalesce(pv.consumed_points, 0) as consumed_points,
      coalesce(prv.consumed_points, 0) as post_reset_consumed_points,
      coalesce(pv.voucher_count, 0) as point_voucher_count,
      coalesce(r.repair_points, 0) as repair_points,
      coalesce(ato.tracked_order_points, 0) as tracked_order_points,
      coalesce(ato.tracked_order_count, 0) as tracked_order_count,
      coalesce(pro.tracked_points, 0) as post_reset_order_points,
      round((coalesce(lm."Points balance", 0) - coalesce(pv.consumed_points, 0))::numeric, 2) as expected_available_no_reset,
      round((coalesce(lm."Points balance", 0) - coalesce(pv.consumed_points, 0) - coalesce(lm."Available points", 0))::numeric, 2) as available_gap_no_reset
    from period_orders po
    join public.loyalty_members lm on lm.id = po.member_id
    left join point_vouchers pv on pv.member_id = lm.id
    left join post_reset_vouchers prv on prv.member_id = lm.id
    left join repairs r on r.member_id = lm.id
    left join all_tracked_orders ato on ato.member_id = lm.id
    left join post_reset_orders pro on pro.member_id = lm.id
    order by lm.customer_name
  `);

  const report = result.rows;
  fs.writeFileSync(path.join(process.cwd(), "tmp", "july30_31_loyalty_reconciliation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    count: report.length,
    rows: report.map((row) => ({
      name: row.customer_name,
      lifetime: row.lifetime_points,
      available: row.available_points,
      consumed: row.consumed_points,
      consumedSinceReset: row.post_reset_consumed_points,
      orderPointsSinceReset: row.post_reset_order_points,
      expectedSinceReset: Number(row.post_reset_order_points || 0) - Number(row.post_reset_consumed_points || 0),
      gapSinceReset: Number(row.post_reset_order_points || 0) - Number(row.post_reset_consumed_points || 0) - Number(row.available_points || 0),
      expectedAvailable: row.expected_available_no_reset,
      gap: row.available_gap_no_reset,
      periodPoints: row.period_points,
      orders: row.order_count,
      resetAt: row.points_reset_at,
    })),
  }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
