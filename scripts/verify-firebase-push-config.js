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

function mask(value) {
  if (!value) return "missing";
  if (value.length <= 8) return "set";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function check(condition, label, details = "") {
  const mark = condition ? "OK" : "MISSING";
  console.log(`${mark} ${label}${details ? ` - ${details}` : ""}`);
  return Boolean(condition);
}

loadEnv();

let ok = true;
const googleServicesPath = path.join(process.cwd(), "android", "app", "google-services.json");
const hasGoogleServices = fs.existsSync(googleServicesPath);
ok = check(hasGoogleServices, "android/app/google-services.json") && ok;

if (hasGoogleServices) {
  try {
    const config = JSON.parse(fs.readFileSync(googleServicesPath, "utf8"));
    const packageNames = (config.client || [])
      .map((client) => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    ok = check(
      packageNames.includes("com.jujabrewandbites.customer"),
      "Firebase Android package",
      packageNames.join(", ") || "no package names found"
    ) && ok;
  } catch (error) {
    ok = check(false, "google-services.json parse", error.message) && ok;
  }
}

const hasJson = Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON);
const hasSplit = Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
ok = check(hasJson || hasSplit, "FCM server credentials", hasJson ? "FCM_SERVICE_ACCOUNT_JSON set" : "split vars") && ok;

if (hasJson) {
  try {
    const parsed = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
    ok = check(Boolean(parsed.project_id), "FCM project_id", mask(parsed.project_id)) && ok;
    ok = check(Boolean(parsed.client_email), "FCM client_email", mask(parsed.client_email)) && ok;
    ok = check(Boolean(parsed.private_key), "FCM private_key", "set") && ok;
  } catch (error) {
    ok = check(false, "FCM_SERVICE_ACCOUNT_JSON parse", error.message) && ok;
  }
} else {
  ok = check(Boolean(process.env.FCM_PROJECT_ID), "FCM_PROJECT_ID", mask(process.env.FCM_PROJECT_ID)) && ok;
  ok = check(Boolean(process.env.FCM_CLIENT_EMAIL), "FCM_CLIENT_EMAIL", mask(process.env.FCM_CLIENT_EMAIL)) && ok;
  ok = check(Boolean(process.env.FCM_PRIVATE_KEY), "FCM_PRIVATE_KEY", process.env.FCM_PRIVATE_KEY ? "set" : "") && ok;
}

ok = check(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), "SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "") && ok;
ok = check(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), "NEXT_PUBLIC_SUPABASE_URL", mask(process.env.NEXT_PUBLIC_SUPABASE_URL)) && ok;
ok = check(Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), "NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : "") && ok;

if (!ok) {
  console.error("\nPush notification setup is incomplete.");
  process.exit(1);
}

console.log("\nPush notification setup looks ready.");
