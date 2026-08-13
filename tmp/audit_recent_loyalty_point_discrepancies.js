/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const START_AT = "2026-06-29 00:00:00+08";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const columns = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'orders', 'web_orders', 'order_items', 'loyalty_members',
        'loyalty_point_award_events', 'loyalty_point_balance_repairs', 'vouchers'
      )
    order by table_name, ordinal_position
  `);

  const columnMap = {};
  for (const row of columns.rows) {
    (columnMap[row.table_name] ||= []).push(row.column_name);
  }

  const result = await client.query(`
    with recent_orders as (
      select
        'order'::text as source_type,
        o.id as source_id,
        o.receipt_number,
        o.paid_at as completed_at,
        lower(coalesce(o.status, '')) as status,
        o.source_web_order_id,
        coalesce(
          o.loyalty_member_id,
          case
            when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then o.customer_id::uuid
            else null
          end
        ) as member_id,
        round(greatest(coalesce(o.loyalty_points_awarded, 0), 0)::numeric, 2) as stored_points,
        o.loyalty_points_awarded_at,
        round(greatest(coalesce(
          nullif(regexp_replace(coalesce(o.net_amount::text, ''), '[^0-9.-]', '', 'g'), '')::numeric,
          nullif(regexp_replace(coalesce(o.total::text, ''), '[^0-9.-]', '', 'g'), '')::numeric,
          0
        ), 0)::numeric, 2) as sale_total
      from public.orders o
      where coalesce(o.paid_at, o.created_at) >= timestamptz '${START_AT}'
        and lower(coalesce(o.status, '')) in ('paid', 'closed', 'completed', 'complete', 'delivered', 'ready')
    ),
    recent_web_orders as (
      select
        'web_order'::text as source_type,
        w.id as source_id,
        w.receipt_number,
        coalesce(w.completed_at, w.created_at) as completed_at,
        lower(coalesce(w.status, w.order_status, '')) as status,
        null::uuid as source_web_order_id,
        w.loyalty_member_id as member_id,
        round(greatest(coalesce(w.loyalty_points_awarded, 0), 0)::numeric, 2) as stored_points,
        w.loyalty_points_awarded_at,
        round(greatest(coalesce(
          nullif(regexp_replace(coalesce(w.loyalty_sale_total::text, ''), '[^0-9.-]', '', 'g'), '')::numeric,
          nullif(regexp_replace(coalesce(w.total::text, ''), '[^0-9.-]', '', 'g'), '')::numeric,
          nullif(regexp_replace(coalesce(w.subtotal::text, ''), '[^0-9.-]', '', 'g'), '')::numeric,
          0
        ), 0)::numeric, 2) as sale_total
      from public.web_orders w
      where coalesce(w.completed_at, w.created_at) >= timestamptz '${START_AT}'
        and lower(coalesce(w.status, w.order_status, '')) in ('paid', 'closed', 'completed', 'complete', 'delivered', 'ready')
        and not exists (
          select 1
          from public.orders o
          where o.source_web_order_id = w.id
             or (nullif(trim(o.receipt_number), '') is not null
                 and lower(trim(o.receipt_number)) = lower(trim(w.receipt_number)))
        )
    ),
    sales as (
      select * from recent_orders
      union all
      select * from recent_web_orders
    ),
    linked_sales as (
      select s.*, lm.customer_name, lm.customer_code,
             round(coalesce(lm."Points balance", 0)::numeric, 2) as member_points,
             round(coalesce(lm."Available points", 0)::numeric, 2) as member_available
      from sales s
      join public.loyalty_members lm on lm.id = s.member_id
    ),
    event_totals as (
      select source_type, source_id,
             count(*) as event_count,
             round(sum(coalesce(points_awarded, 0))::numeric, 2) as event_points,
             min(awarded_at) as first_awarded_at,
             max(awarded_at) as last_awarded_at
      from public.loyalty_point_award_events
      group by source_type, source_id
    ),
    repair_totals as (
      select
        case
          when repair_key like 'july30-31-missing-available:%'
            then substring(repair_key from 'july30-31-missing-available:(.*)')
          else null
        end as source_id_text,
        round(sum(coalesce(available_points_delta, 0))::numeric, 2) as available_repair
      from public.loyalty_point_balance_repairs
      group by 1
    )
    select
      ls.*,
      coalesce(et.event_count, 0) as event_count,
      round(coalesce(et.event_points, 0)::numeric, 2) as event_points,
      et.first_awarded_at,
      et.last_awarded_at,
      round(coalesce(rt.available_repair, 0)::numeric, 2) as available_repair,
      case
        when ls.stored_points <= 0 then 'sale_has_no_award'
        when coalesce(et.event_count, 0) = 0 then 'missing_award_event'
        when coalesce(et.event_count, 0) > 1 then 'duplicate_award_events'
        when abs(ls.stored_points - coalesce(et.event_points, 0)) >= 0.01 then 'award_event_amount_mismatch'
        else 'ok'
      end as audit_status
    from linked_sales ls
    left join event_totals et
      on et.source_type = ls.source_type and et.source_id = ls.source_id
    left join repair_totals rt on rt.source_id_text = ls.source_id::text
    order by ls.completed_at desc, ls.customer_name
  `);

  const camille = result.rows.filter((row) =>
    String(row.customer_name || "").toLowerCase().includes("camille")
    || String(row.customer_code || "").toUpperCase() === "JUJA2026000859"
  );
  const discrepancies = result.rows.filter((row) => row.audit_status !== "ok");
  const report = {
    generatedAt: new Date().toISOString(),
    startAt: START_AT,
    columns: columnMap,
    linkedSaleCount: result.rows.length,
    discrepancyCount: discrepancies.length,
    camille,
    discrepancies,
  };
  const output = path.join(process.cwd(), "tmp", "recent_loyalty_point_discrepancies.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    output,
    linkedSaleCount: report.linkedSaleCount,
    discrepancyCount: report.discrepancyCount,
    camille,
    discrepancies,
  }, null, 2));

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
