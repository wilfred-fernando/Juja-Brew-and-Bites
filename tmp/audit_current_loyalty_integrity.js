/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const START_AT = "2026-08-01 00:00:00+08";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(`
      with recent_events as (
        select
          e.*,
          lag(e.points_balance_after) over (partition by e.member_id order by e.awarded_at, e.id) as prior_points_after,
          lag(e.available_points_after) over (partition by e.member_id order by e.awarded_at, e.id) as prior_available_after,
          lag(e.awarded_at) over (partition by e.member_id order by e.awarded_at, e.id) as prior_awarded_at
        from public.loyalty_point_award_events e
        where e.awarded_at >= $1::timestamptz
      ),
      repairs_between as (
        select
          e.id as event_id,
          round(coalesce(sum(r.points_balance_delta), 0)::numeric, 2) as points_delta,
          round(coalesce(sum(r.available_points_delta), 0)::numeric, 2) as available_delta
        from recent_events e
        left join public.loyalty_point_balance_repairs r
          on r.member_id = e.member_id
         and r.created_at > coalesce(e.prior_awarded_at, $1::timestamptz)
         and r.created_at <= e.awarded_at
        group by e.id
      ),
      progression_issues as (
        select
          e.member_id,
          e.receipt_number,
          e.awarded_at,
          e.points_awarded,
          e.prior_points_after,
          e.points_balance_after,
          e.prior_available_after,
          e.available_points_after,
          rb.points_delta,
          rb.available_delta
        from recent_events e
        join repairs_between rb on rb.event_id = e.id
        where e.prior_points_after is not null
          and (
            abs(e.points_balance_after - (e.prior_points_after + e.points_awarded + rb.points_delta)) > 0.009
            or abs(e.available_points_after - (e.prior_available_after + e.points_awarded + rb.available_delta)) > 0.009
          )
      ),
      latest_events as (
        select distinct on (e.member_id)
          e.member_id, e.id, e.source_type, e.source_id, e.receipt_number,
          e.awarded_at, e.points_balance_after, e.available_points_after
        from recent_events e
        order by e.member_id, e.awarded_at desc, e.id desc
      ),
      later_repairs as (
        select
          le.member_id,
          round(coalesce(sum(r.points_balance_delta), 0)::numeric, 2) as points_delta,
          round(coalesce(sum(r.available_points_delta), 0)::numeric, 2) as available_delta
        from latest_events le
        left join public.loyalty_point_balance_repairs r
          on r.member_id = le.member_id and r.created_at > le.awarded_at
        group by le.member_id
      ),
      later_vouchers as (
        select
          le.member_id,
          round(coalesce(sum(v.points_consumed), 0)::numeric, 2) as available_consumed
        from latest_events le
        left join public.vouchers v
          on v.member_id = le.member_id
         and coalesce(v.points_consumed_at, v.issued_at, v.created_at) > le.awarded_at
         and coalesce(v.points_consumed, 0) > 0
        group by le.member_id
      ),
      current_drift as (
        select
          le.member_id,
          lm.customer_name,
          lm.customer_code,
          le.receipt_number as latest_receipt,
          le.awarded_at as latest_awarded_at,
          le.points_balance_after,
          le.available_points_after,
          round(coalesce(lm."Points balance", 0)::numeric, 2) as current_points_balance,
          round(coalesce(lm."Available points", 0)::numeric, 2) as current_available_points,
          lr.points_delta as later_points_repairs,
          lr.available_delta as later_available_repairs,
          lv.available_consumed as later_voucher_consumption,
          round((coalesce(lm."Points balance", 0) - (le.points_balance_after + lr.points_delta))::numeric, 2) as unexplained_points_delta,
          round((coalesce(lm."Available points", 0) - (le.available_points_after + lr.available_delta - lv.available_consumed))::numeric, 2) as unexplained_available_delta
        from latest_events le
        join public.loyalty_members lm on lm.id = le.member_id
        join later_repairs lr on lr.member_id = le.member_id
        join later_vouchers lv on lv.member_id = le.member_id
      ),
      recent_sources as (
        select 'order'::text as source_type, o.id as source_id, o.receipt_number,
               o.loyalty_member_id as member_id, o.created_at, o.paid_at,
               o.status, round(coalesce(o.loyalty_points_awarded, 0)::numeric, 2) as stored_points
        from public.orders o
        where o.loyalty_member_id is not null
          and coalesce(o.paid_at, o.created_at) >= $1::timestamptz
        union all
        select 'web_order'::text, w.id, w.receipt_number,
               w.loyalty_member_id, w.created_at, null::timestamptz,
               w.status, round(coalesce(w.loyalty_points_awarded, 0)::numeric, 2)
        from public.web_orders w
        where w.loyalty_member_id is not null and w.created_at >= $1::timestamptz
          and not exists (select 1 from public.orders o where o.source_web_order_id = w.id)
      ),
      missing_events as (
        select rs.*, lm.customer_name, lm.customer_code
        from recent_sources rs
        join public.loyalty_members lm on lm.id = rs.member_id
        left join public.loyalty_point_award_events e
          on e.source_type = rs.source_type and e.source_id = rs.source_id
        where rs.stored_points > 0 and e.id is null
      )
      select jsonb_build_object(
        'period', jsonb_build_object('start', $1::text, 'end', now()),
        'counts', jsonb_build_object(
          'award_events', (select count(*) from recent_events),
          'members_with_awards', (select count(distinct member_id) from recent_events),
          'progression_issues', (select count(*) from progression_issues),
          'missing_event_sources', (select count(*) from missing_events),
          'current_drift_rows', (select count(*) from current_drift where abs(unexplained_points_delta) > 0.009 or abs(unexplained_available_delta) > 0.009)
        ),
        'progression_issues', coalesce((select jsonb_agg(to_jsonb(x) order by x.awarded_at) from progression_issues x), '[]'::jsonb),
        'missing_event_sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from missing_events x), '[]'::jsonb),
        'current_drift', coalesce((select jsonb_agg(to_jsonb(x) order by x.customer_name) from current_drift x where abs(x.unexplained_points_delta) > 0.009 or abs(x.unexplained_available_delta) > 0.009), '[]'::jsonb)
      ) as report
    `, [START_AT]);

    const report = result.rows[0].report;
    const output = path.join(process.cwd(), "tmp", "current_loyalty_integrity_audit.json");
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
