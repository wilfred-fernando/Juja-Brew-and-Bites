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
  try {
    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema='public' and table_name ilike '%web%item%'
      order by table_name
    `);
    const zeroOrders = await client.query(`
      select o.id, o.receipt_number, o.status, o.paid_at, o.created_at,
             o.loyalty_member_id, o.customer_id, o.customer_name,
             o.total, o.net_amount, o.discount_amount, o.refund_amount,
             o.loyalty_points_awarded, o.loyalty_points_awarded_at,
             o.items as order_items_json, o.source_metadata,
             lm.customer_code,
             jsonb_agg(jsonb_build_object(
               'id', oi.id, 'name', coalesce(oi.item_name, oi.name),
               'category', oi.category_name, 'quantity', oi.quantity,
               'unit_price', oi.unit_price, 'line_total', oi.line_total,
               'gross_amount', oi.gross_amount, 'discount_amount', oi.discount_amount,
               'net_amount', oi.net_amount, 'voucher', oi.applied_voucher_code,
               'status', oi.status, 'refund_amount', oi.refund_amount,
               'metadata', oi.source_metadata
             ) order by oi.created_at, oi.id) filter (where oi.id is not null) as items
      from public.orders o
      join public.loyalty_members lm on lm.id = coalesce(
        o.loyalty_member_id,
        case when o.customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then o.customer_id::uuid end
      )
      left join public.order_items oi on oi.order_id=o.id
      where coalesce(o.paid_at,o.created_at) >= timestamptz '2026-08-01 00:00:00+08'
        and lower(coalesce(o.status,'')) in ('paid','closed','completed','complete','delivered','ready')
        and coalesce(o.loyalty_points_awarded,0)=0
      group by o.id, lm.customer_code
      order by coalesce(o.paid_at,o.created_at) desc
    `);
    const balanceChanges = await client.query(`
      select lm.id, lm.customer_name, lm.customer_code,
             lm."Points balance" as points_balance, lm."Available points" as available_points,
             coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
                       from public.loyalty_point_balance_repairs r
                       where r.member_id=lm.id and r.created_at >= timestamptz '2026-08-01 00:00:00+08'), '[]'::jsonb) as repairs,
             coalesce((select jsonb_agg(jsonb_build_object('code',v.code,'type',v.reward_type,'status',v.status,
                       'points_consumed',v.points_consumed,'points_consumed_at',v.points_consumed_at,'issued_at',v.issued_at,'redeemed_at',v.redeemed_at)
                       order by coalesce(v.points_consumed_at,v.issued_at,v.created_at))
                       from public.vouchers v
                       where v.member_id=lm.id and coalesce(v.points_consumed_at,v.issued_at,v.created_at) >= timestamptz '2026-08-01 00:00:00+08'), '[]'::jsonb) as vouchers
      from public.loyalty_members lm
      where lm.id in (
        '0b7c4a5b-4790-48bc-96e9-ee725c37ef5f',
        'd63b164f-df5d-466c-8a6a-db8070e5542f',
        'e036c3b8-c483-4a05-b11a-ac5338b4719e',
        'e96130d8-ce98-4228-ac5c-16cccc9feb24'
      )
      order by lm.customer_name
    `);
    const output = { webItemTables: tables.rows, zeroOrders: zeroOrders.rows, balanceChanges: balanceChanges.rows };
    const outputPath = path.join(process.cwd(), 'tmp', 'recent_zero_loyalty_awards_detail.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify({ outputPath, webItemTables: tables.rows, zeroOrderCount: zeroOrders.rows.length,
      zeroOrders: zeroOrders.rows.map((o) => ({ receipt: o.receipt_number, name: o.customer_name, code: o.customer_code,
        total: o.total, net: o.net_amount, discount: o.discount_amount, refund: o.refund_amount, items: o.items })),
      balanceChanges: balanceChanges.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
