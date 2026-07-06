# End-to-end smoke test: health + HMAC parity + a live trigger round-trip.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$envf = Join-Path $root 'deploy\.env'
$api  = 'http://localhost:3010'

$envMap = @{}
foreach ($line in Get-Content $envf) {
  $t = $line.Trim(); if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
  $k,$v = $t.Split('=',2); $envMap[$k.Trim()] = $v.Trim()
}
$secret = $envMap['NOVU_API_KEY']

function Ok($m){Write-Host "  [OK]  $m" -ForegroundColor Green}
function Bad($m){Write-Host "  [ERR] $m" -ForegroundColor Red}

Write-Host "== Health ==" -ForegroundColor Cyan
try { $h = Invoke-RestMethod "$api/v1/health-check" -TimeoutSec 10; if ($h.data.status -eq 'ok') { Ok "API healthy (v$($h.data.info.apiVersion.version))" } else { Bad "API status: $($h.data.status)" } } catch { Bad "API unreachable: $($_.Exception.Message)" }

Write-Host "== HMAC parity (Python bridge vs PowerShell) ==" -ForegroundColor Cyan
$sub = "aaaa-tenant:11111111-1111-1111-1111-111111111111"
if ($secret) {
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  $hash = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($sub)) | ForEach-Object { $_.ToString('x2') }) -join ''
  Ok "subscriberHash($sub) = $($hash.Substring(0,24))..."
  Write-Host "        (bridge/novu_inbox.subscriber_hash must produce the identical value)" -ForegroundColor DarkGray
} else { Bad "NOVU_API_KEY missing (paste the dashboard Secret Key into deploy/.env)" }

Write-Host "== Trigger round-trip (hrms-generic) ==" -ForegroundColor Cyan
if ($secret) {
  $body = @{
    name = 'hrms-generic'
    to   = @{ subscriberId = $sub; email = 'smoke@acme.example.com'; firstName = 'Smoke' }
    payload = @{ title='Smoke test'; message='Hello from smoke-test.ps1'; category='system'; action_url='/'; tenant_subdomain='acme' }
  } | ConvertTo-Json -Depth 20
  try {
    $r = Invoke-RestMethod -Method POST -Uri "$api/v1/events/trigger" -Headers @{ Authorization="ApiKey $secret"; 'Content-Type'='application/json' } -Body $body
    if ($r.data.acknowledged -or $r.acknowledged) { Ok "trigger acknowledged (transactionId $($r.data.transactionId))" }
    else { Bad "unexpected trigger response: $($r | ConvertTo-Json -Compress)" }
  } catch { Bad "trigger failed (is the 'hrms-generic' workflow created & active? run bootstrap.ps1): $($_.Exception.Message)" }
}
Write-Host "`nCheck delivery in the Dashboard Activity Feed (http://localhost:4000) and Mailpit (http://localhost:8025)." -ForegroundColor Cyan
