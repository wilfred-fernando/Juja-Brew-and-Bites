import { spawn } from "node:child_process";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const values = {
  FINANCE_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  FINANCE_SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
if (Object.values(values).some((value) => !value)) throw new Error("Missing local Supabase configuration.");

// Pipe secrets directly to Wrangler; never write them to disk or command arguments.
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", [
  "--yes", "wrangler", "secret", "bulk", "--config", "cloudflare/d1-archive/wrangler.toml",
], { shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { output += data; });
child.stdin.end(JSON.stringify(values));
child.on("error", () => { console.error("Unable to start Wrangler."); process.exitCode = 1; });
child.on("close", (code) => {
  // Defensive redaction even if a future CLI version echoes its input.
  for (const value of Object.values(values)) output = output.split(value).join("[REDACTED]");
  console.log(output);
  process.exitCode = code || 0;
});
