# Idempotent Novu provisioning for the HRMS POC.
#   - reads deploy/.env for NOVU_SECRET_KEY / NOVU_API_URL
#   - fetches the environment Application Identifier and writes it into deploy/.env
#   - creates the HRMS workflows (in-app / email / push steps) via the public API
#   - prints a short manual checklist for the few integration steps that live in the dashboard
#
# Safe to re-run: existing workflows are skipped. Nothing is destructive.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/seed.ps1

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$envf   = Join-Path $root 'deploy\.env'

if (-not (Test-Path $envf)) { throw "deploy/.env not found — run scripts/gen-secrets.ps1 first." }

# --- load .env ---
$envMap = @{}
foreach ($line in Get-Content $envf) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
  $k,$v = $t.Split('=',2); $envMap[$k.Trim()] = $v.Trim()
}
$secret = $envMap['NOVU_SECRET_KEY']
$api    = 'http://localhost:3010'   # host-facing API port
if (-not $secret) { throw "NOVU_SECRET_KEY missing in deploy/.env — create org in the dashboard, copy the Secret Key." }
$headers = @{ Authorization = "ApiKey $secret"; 'Content-Type' = 'application/json' }

function Try-Api($method, $path, $body) {
  try {
    $json = if ($body) { $body | ConvertTo-Json -Depth 20 } else { $null }
    return Invoke-RestMethod -Method $method -Uri "$api$path" -Headers $headers -Body $json
  } catch {
    Write-Host "  ! $method $path -> $($_.Exception.Message)" -ForegroundColor Yellow
    return $null
  }
}

Write-Host "== 1. Verifying key + fetching Application Identifier ==" -ForegroundColor Cyan
$envme = Try-Api 'GET' '/v1/environments/me' $null
if (-not $envme) { $envme = Try-Api 'GET' '/v1/environments' $null }
$appId = $null
if ($envme) { $appId = $envme.identifier; if (-not $appId -and $envme.data) { $appId = $envme.data.identifier } }
if ($appId) {
  Write-Host "  Application Identifier: $appId" -ForegroundColor Green
  if ($envMap.ContainsKey('NOVU_APPLICATION_IDENTIFIER')) {
    (Get-Content $envf) -replace '^NOVU_APPLICATION_IDENTIFIER=.*$', "NOVU_APPLICATION_IDENTIFIER=$appId" | Set-Content $envf -Encoding utf8
  } else {
    Add-Content $envf "NOVU_APPLICATION_IDENTIFIER=$appId"
  }
  Write-Host "  -> written to deploy/.env" -ForegroundColor Green
} else {
  Write-Host "  Could not read the identifier via API — copy it from Dashboard > Settings > API Keys into deploy/.env (NOVU_APPLICATION_IDENTIFIER)." -ForegroundColor Yellow
}

Write-Host "== 2. Creating workflows ==" -ForegroundColor Cyan
$inApp = @{ name='In-App'; type='in_app'; controlValues=@{ subject='{{payload.title}}'; body='{{payload.message}}' } }
$email = @{ name='Email';  type='email';  controlValues=@{ subject='{{payload.title}}'; body='<p>{{payload.message}}</p><p><a href="https://{{payload.tenant_subdomain}}.rainertek.cloud{{payload.action_url}}">Open in HRMS</a></p>' } }
$push  = @{ name='Push';   type='push';   controlValues=@{ subject='{{payload.title}}'; body='{{payload.message}}' } }

$workflows = @(
  @{ workflowId='hrms-generic';   name='HRMS Generic';   steps=@($inApp,$email) },
  @{ workflowId='hrms-timesheet'; name='HRMS Timesheet'; steps=@($inApp,$email) },
  @{ workflowId='hrms-task';      name='HRMS Task';      steps=@($inApp,$push) },
  @{ workflowId='hrms-approval';  name='HRMS Approval';  steps=@($inApp,$email) }
)

$existing = Try-Api 'GET' '/v2/workflows?limit=100' $null
$have = @()
if ($existing -and $existing.workflows) { $have = $existing.workflows | ForEach-Object { $_.workflowId } }

foreach ($wf in $workflows) {
  if ($have -contains $wf.workflowId) { Write-Host "  = $($wf.workflowId) already exists" -ForegroundColor DarkGray; continue }
  $body = @{ name=$wf.name; workflowId=$wf.workflowId; __source='dashboard'; steps=$wf.steps; active=$true }
  $res = Try-Api 'POST' '/v2/workflows' $body
  if ($res) { Write-Host "  + created $($wf.workflowId)" -ForegroundColor Green }
}

Write-Host ""
Write-Host "== 3. Manual dashboard steps (http://localhost:4000) ==" -ForegroundColor Cyan
Write-Host @"
  a) Integrations Store -> Email -> add 'SMTP' (Nodemailer):
         host = novu-mailpit   port = 1025   (leave user/pass empty)   from = hrms@localhost
  b) Integrations Store -> Push -> add 'Push Webhook':
         Webhook URL = http://host.docker.internal:4200/api/demo/push-webhook
  c) Integrations Store -> In-App (Novu Inbox) -> enable 'Security' / HMAC  (REQUIRED for isolation)
  d) (per-tenant SMTP demo) add a second SMTP integration named 'smtp-globex' to show
     overrides.email.integrationIdentifier routing.
"@ -ForegroundColor Gray
Write-Host "Done. Re-run scripts/smoke-test.ps1 to validate an end-to-end trigger." -ForegroundColor Cyan
