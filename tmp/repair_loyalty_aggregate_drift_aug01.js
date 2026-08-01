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

const MEMBER_ID = "35143813-5fb4-4c2b-9a42-fc2c346476b4";
const EXPECTED_BEFORE = { points: 127.64, available: 27.64, spent: 691, visits: 4 };
const DELTA = { points: 15.52, available: 15.52, spent: 2888, visits: 3 };
const round2 = (value) => Number(Number(value || 0).toFixed(2));

async function main() {
  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select('*')
    .eq("id", MEMBER_ID)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member?.id) throw new Error("Affected loyalty member was not found.");

  const actual = {
    points: round2(member["Points balance"]),
    available: round2(member["Available points"]),
    spent: round2(member["Total spent"]),
    visits: Number(member["Total visits"] || 0),
  };
  const alreadyRepaired =
    actual.points === round2(EXPECTED_BEFORE.points + DELTA.points) &&
    actual.spent === round2(EXPECTED_BEFORE.spent + DELTA.spent) &&
    actual.visits === EXPECTED_BEFORE.visits + DELTA.visits;
  if (alreadyRepaired) {
    console.log(JSON.stringify({ skipped: "already_repaired", member: actual }, null, 2));
    return;
  }
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_BEFORE)) {
    throw new Error(`Member changed since audit; refusing unsafe repair. Current: ${JSON.stringify(actual)}`);
  }

  const update = {
    "Points balance": round2(actual.points + DELTA.points),
    "Available points": round2(actual.available + DELTA.available),
    "Total spent": round2(actual.spent + DELTA.spent),
    "Total visits": actual.visits + DELTA.visits,
  };
  const { data: repaired, error: updateError } = await supabase
    .from("loyalty_members")
    .update(update)
    .eq("id", MEMBER_ID)
    .eq("Points balance", EXPECTED_BEFORE.points)
    .eq("Available points", EXPECTED_BEFORE.available)
    .eq("Total spent", EXPECTED_BEFORE.spent)
    .eq("Total visits", EXPECTED_BEFORE.visits)
    .select('*')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!repaired?.id) throw new Error("Repair did not update the member; the row changed concurrently.");

  const { error: voucherError } = await supabase.rpc("ensure_vouchers_for_member", { p_member_id: MEMBER_ID });
  if (voucherError) throw voucherError;

  const [{ data: finalMember, error: finalError }, { data: vouchers, error: vouchersError }] = await Promise.all([
    supabase.from("loyalty_members").select('*').eq("id", MEMBER_ID).maybeSingle(),
    supabase.from("vouchers").select("id,code,reward_type,status,issued_at,expires_at,redeemed_at").eq("member_id", MEMBER_ID).order("issued_at"),
  ]);
  if (finalError) throw finalError;
  if (vouchersError) throw vouchersError;
  console.log(JSON.stringify({ repaired: true, member: finalMember, vouchers: vouchers || [] }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
