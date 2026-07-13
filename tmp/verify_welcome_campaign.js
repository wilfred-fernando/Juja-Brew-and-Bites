/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role config is missing");
  const supabase = createClient(url, key);

  const { data: campaign, error: campaignError } = await supabase
    .from("voucher_campaigns")
    .select("*")
    .eq("code", "WELCOME-VOUCHER")
    .maybeSingle();
  if (campaignError) throw campaignError;

  const { count: memberCount, error: memberError } = await supabase
    .from("loyalty_members")
    .select("id", { count: "exact", head: true });
  if (memberError) throw memberError;

  const { count: welcomeCount, error: welcomeError } = await supabase
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .or("reward_type.eq.welcome,code.ilike.WELCOME%,reward_text.ilike.%welcome voucher%");
  if (welcomeError) throw welcomeError;

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_welcome_voucher_if_needed", {
    p_member_id: null,
  });

  console.log(JSON.stringify({
    campaign,
    memberCount,
    welcomeCount,
    rpcNullInput: rpcError ? rpcError.message : rpcData,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
