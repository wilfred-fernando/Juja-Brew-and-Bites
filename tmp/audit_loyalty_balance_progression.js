const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));

const n = (value) => Number(Number(value || 0).toFixed(2));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const eventsResult = await client.query(`
        select e.*, m.customer_name, m.customer_code,
               timezone('Asia/Manila', e.awarded_at) as awarded_at_manila
        from public.loyalty_point_award_events e
        join public.loyalty_members m on m.id = e.member_id
        where e.awarded_at >= timestamptz '2026-06-29 00:00:00+08'
        order by e.member_id, e.awarded_at, e.id
      `);
    const repairsResult = await client.query(`
        select r.*, timezone('Asia/Manila', r.created_at) as created_at_manila
        from public.loyalty_point_balance_repairs r
        where r.created_at >= timestamptz '2026-06-29 00:00:00+08'
        order by r.member_id, r.created_at, r.id
      `);
    const membersResult = await client.query(`
        select id, customer_name, customer_code, "Points balance" as points_balance,
               "Available points" as available_points, "Total visits" as total_visits,
               "Total spent" as total_spent, "Last visit" as last_visit
        from public.loyalty_members
      `);
    const vouchersResult = await client.query(`
        select id, member_id, code, reward_type, status, points_consumed, points_consumed_at,
               issued_at, redeemed_at
        from public.vouchers
        where coalesce(points_consumed_at, issued_at, created_at) >= timestamptz '2026-06-29 00:00:00+08'
      `);
    const functionsResult = await client.query(`
        select p.proname, pg_get_functiondef(p.oid) as definition
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('award_loyalty_points_for_order','award_loyalty_points_for_web_order')
      `);

    const members = new Map(membersResult.rows.map((row) => [row.id, row]));
    const repairsByMember = new Map();
    for (const row of repairsResult.rows) {
      if (!repairsByMember.has(row.member_id)) repairsByMember.set(row.member_id, []);
      repairsByMember.get(row.member_id).push(row);
    }

    const eventsByMember = new Map();
    for (const row of eventsResult.rows) {
      if (!eventsByMember.has(row.member_id)) eventsByMember.set(row.member_id, []);
      eventsByMember.get(row.member_id).push(row);
    }

    const progressionIssues = [];
    const memberSummaries = [];
    for (const [memberId, events] of eventsByMember) {
      const member = members.get(memberId);
      const repairs = repairsByMember.get(memberId) || [];
      for (let index = 1; index < events.length; index += 1) {
        const previous = events[index - 1];
        const current = events[index];
        const between = repairs.filter((repair) => new Date(repair.created_at) > new Date(previous.awarded_at) && new Date(repair.created_at) <= new Date(current.awarded_at));
        const repairDelta = n(between.reduce((sum, repair) => sum + Number(repair.points_balance_delta || 0), 0));
        const expectedAfter = n(Number(previous.points_balance_after || 0) + Number(current.points_awarded || 0) + repairDelta);
        const actualAfter = n(current.points_balance_after);
        if (Math.abs(expectedAfter - actualAfter) > 0.009) {
          progressionIssues.push({
            member_id: memberId,
            customer_name: member?.customer_name,
            customer_code: member?.customer_code,
            receipt_number: current.receipt_number,
            awarded_at_manila: current.awarded_at_manila,
            points_awarded: n(current.points_awarded),
            previous_balance_after: n(previous.points_balance_after),
            repair_delta_between: repairDelta,
            expected_balance_after: expectedAfter,
            recorded_balance_after: actualAfter,
            discrepancy: n(expectedAfter - actualAfter),
          });
        }
      }

      const last = events[events.length - 1];
      const laterRepairs = repairs.filter((repair) => new Date(repair.created_at) > new Date(last.awarded_at));
      const laterDelta = n(laterRepairs.reduce((sum, repair) => sum + Number(repair.points_balance_delta || 0), 0));
      const expectedCurrent = n(Number(last.points_balance_after || 0) + laterDelta);
      const actualCurrent = n(member?.points_balance);
      memberSummaries.push({
        member_id: memberId,
        customer_name: member?.customer_name,
        customer_code: member?.customer_code,
        event_count_since_aug_1: events.length,
        last_event_receipt: last.receipt_number,
        last_event_at_manila: last.awarded_at_manila,
        last_event_balance_after: n(last.points_balance_after),
        later_repair_delta: laterDelta,
        expected_current_points_balance: expectedCurrent,
        actual_current_points_balance: actualCurrent,
        current_discrepancy: n(expectedCurrent - actualCurrent),
        current_available_points: n(member?.available_points),
      });
    }

    const named = memberSummaries.filter((row) => /camille|james rudolf|rossenie/i.test(row.customer_name || ""));
    const output = {
      generated_at: new Date().toISOString(),
      event_count: eventsResult.rows.length,
      member_count: eventsByMember.size,
      progression_issue_count: progressionIssues.length,
      current_balance_issue_count: memberSummaries.filter((row) => Math.abs(row.current_discrepancy) > 0.009).length,
      progression_issues: progressionIssues,
      current_balance_issues: memberSummaries.filter((row) => Math.abs(row.current_discrepancy) > 0.009),
      named_members: named,
      recent_vouchers: vouchersResult.rows,
      live_function_definitions: functionsResult.rows,
    };
    const outputPath = path.join(process.cwd(), "tmp", "loyalty_balance_progression_audit.json");
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify({
      outputPath,
      eventCount: output.event_count,
      memberCount: output.member_count,
      progressionIssueCount: output.progression_issue_count,
      currentBalanceIssueCount: output.current_balance_issue_count,
      named,
      progressionIssues: progressionIssues.slice(0, 30),
      currentBalanceIssues: output.current_balance_issues.slice(0, 30),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
