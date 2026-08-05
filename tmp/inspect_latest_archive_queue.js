const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

for (const file of [".env.local", ".env.d1-archive"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [{ data: shifts, error: shiftError }, { data: batches, error: batchError }] = await Promise.all([
    client.from("cashier_pos").select("id,mode,store_id,cashier_id,cashier_name,cash_total,sales_summary,created_at").order("created_at", { ascending: false }).limit(12),
    client.from("sales_archive_batches").select("shift_id,store_id,cashier_id,opened_at,closed_at,business_date,status,attempts,last_error,expected_counts,d1_counts,expected_totals,d1_totals,expected_checksum,d1_checksum,created_at,verified_at,purge_after,purged_at").order("created_at", { ascending: false }).limit(12),
  ]);
  if (shiftError) throw shiftError;
  if (batchError) throw batchError;
  console.log(JSON.stringify({ shifts, batches }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
