const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

for (const file of [".env.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await client
    .from("pos_discounts")
    .select("id,name,type,scope,value,is_variable,requires_discount_beneficiary,is_active")
    .ilike("name", "%qcid%");
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
