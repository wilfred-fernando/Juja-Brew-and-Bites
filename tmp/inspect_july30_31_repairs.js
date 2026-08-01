/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: repairs, error } = await supabase
    .from("loyalty_point_balance_repairs")
    .select("*")
    .like("repair_key", "july30-31-missing-available:%")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const memberIds = [...new Set((repairs || []).map((row) => row.member_id))];
  const [{ data: members, error: memberError }, { data: vouchers, error: voucherError }] = await Promise.all([
    supabase.from("loyalty_members").select("id,customer_name,customer_code,\"Points balance\",\"Available points\"").in("id", memberIds),
    supabase.from("vouchers").select("*").in("member_id", memberIds).order("created_at", { ascending: true }),
  ]);
  if (memberError) throw memberError;
  if (voucherError) throw voucherError;

  const memberById = new Map((members || []).map((row) => [row.id, row]));
  const result = (repairs || []).map((repair) => ({
    repairKey: repair.repair_key,
    member: memberById.get(repair.member_id),
    delta: Number(repair.available_points_delta || 0),
    before: Number(repair.available_points_before || 0),
    after: Number(repair.available_points_after || 0),
    createdAt: repair.created_at,
    vouchersNearRepair: (vouchers || []).filter((voucher) =>
      voucher.member_id === repair.member_id
      && Math.abs(new Date(voucher.created_at).getTime() - new Date(repair.created_at).getTime()) < 120000
    ).map((voucher) => ({ id: voucher.id, code: voucher.code || voucher.voucher_code, type: voucher.type || voucher.voucher_type, status: voucher.status, createdAt: voucher.created_at })),
  }));

  console.log(JSON.stringify({ count: result.length, repairs: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
