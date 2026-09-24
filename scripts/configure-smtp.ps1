$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$smtpHost = Read-Host 'SMTP host (for Gmail: smtp.gmail.com)'
$smtpPort = Read-Host 'SMTP port (465 for SSL, 587 for STARTTLS)'
$smtpUser = Read-Host 'Sender email / SMTP username'
if ([string]::IsNullOrWhiteSpace($smtpHost) -or [string]::IsNullOrWhiteSpace($smtpUser) -or $smtpPort -notin @('465', '587')) {
  throw 'Enter a host, username, and port 465 or 587.'
}
$smtpSecret = Read-Host 'SMTP password (Gmail: app password, not your normal password)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpSecret)
Push-Location $projectRoot
try {
  $env:JUJA_SETUP_SMTP_HOST = $smtpHost
  $env:JUJA_SETUP_SMTP_PORT = $smtpPort
  $env:JUJA_SETUP_SMTP_USER = $smtpUser
  $env:JUJA_SETUP_SMTP_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  @'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const nodemailer = require('nodemailer');
(async () => {
  execFileSync('git', ['check-ignore', '-q', '.env.local']);
  const host = process.env.JUJA_SETUP_SMTP_HOST.trim();
  const user = process.env.JUJA_SETUP_SMTP_USER.trim();
  const port = Number(process.env.JUJA_SETUP_SMTP_PORT);
  const pass = host === 'smtp.gmail.com' ? process.env.JUJA_SETUP_SMTP_PASS.replace(/\s/g, '') : process.env.JUJA_SETUP_SMTP_PASS;
  if (!pass) throw new Error('Missing SMTP password');
  const transport = nodemailer.createTransport({ host, port, secure: port === 465,
    requireTLS: port === 587, auth: { user, pass }, connectionTimeout: 10000,
    greetingTimeout: 10000, socketTimeout: 10000 });
  try { await transport.verify(); } finally { transport.close(); }
  const values = { SMTP_HOST: host, SMTP_PORT: String(port), SMTP_SECURE: String(port === 465),
    SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: user };
  let content = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp('^(?:export\\s+)?' + key + '\\s*=.*(?:\\r?\\n|$)', 'gm');
    content = content.replace(pattern, '');
    content = content.trimEnd() + '\n' + key + '=' + JSON.stringify(value) + '\n';
  }
  fs.writeFileSync('.env.local', content, { mode: 0o600 });
  console.log('SMTP authentication verified and saved to ignored .env.local. No email sent.');
})().catch(error => { console.error('SMTP setup failed; configuration was not saved. Error code:', error.code || 'SETUP_ERROR'); process.exitCode = 1; });
'@ | node
  if ($LASTEXITCODE -ne 0) { throw 'SMTP verification failed.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  Remove-Item Env:JUJA_SETUP_SMTP_HOST, Env:JUJA_SETUP_SMTP_PORT, Env:JUJA_SETUP_SMTP_USER, Env:JUJA_SETUP_SMTP_PASS -ErrorAction SilentlyContinue
  Pop-Location
}
