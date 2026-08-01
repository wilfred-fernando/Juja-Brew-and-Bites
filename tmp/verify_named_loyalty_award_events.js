/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: members, error: memberError } = await supabase
    .from("loyalty_members")
    .select("id, customer_name, customer_code, points, available_points, total_spent, visits")
    .or("customer_name.ilike.%James%Javier%,customer_name.ilike.%Rossenie%Torre%");
  if (memberError) throw memberError;

  const report = [];
  for (const member of members || []) {
    const { data: events, error: eventError } = await supabase
      .from("loyalty_point_award_events")
      .select("source_type, source_id, receipt_number, points_awarded, sale_total, awarded_at")
      .eq("loyalty_member_id", member.id)
      .order("awarded_at", { ascending: false })
      .limit(5);
    if (eventError) throw eventError;
    report.push({ member, recentAwardEvents: events || [] });
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
