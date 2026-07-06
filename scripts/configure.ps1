<#
  Provision an EXISTING Novu org/environment using only its Secret Key (ApiKey).

  Use this when you already have a Novu instance + environment (e.g. you created the org in the
  dashboard). It needs NOVU_API_KEY + NOVU_APPLICATION_IDENTIFIER already set in deploy/.env
  (copy them from Dashboard > Developer > API Keys). No registration, no dashboard clicks.

  It (idempotently):
    - enables HMAC on the In-App integration          (tenant isolation)
    - creates an SMTP integration -> Mailpit            (email)
    - creates a Push Webhook integration -> demo sink   (push, local)
    - creates the HRMS workflows (in-app / email / push)

  This is the reusable provisioner for any project. bootstrap.ps1 is the from-scratch variant
  that also registers a brand-new org.

  Usage:  powershell -ExecutionPolicy Bypass -File scripts/configure.ps1
#>

$ErrorActionPreference = 'Stop'

# -- CONFIG (edit to reuse elsewhere) ----------------------------------------
$MailpitHost    = 'novu-mailpit'; $MailpitPort = '1025'
$PushWebhookUrl = 'http://host.docker.internal:4200/api/demo/push-webhook'
# workflowId -> which channel steps it contains
$Workflows = @(
  @{ id='hrms-generic';      name='HRMS Generic';      steps=@('in_app','email') },
  @{ id='hrms-timesheet';    name='HRMS Timesheet';    steps=@('in_app','email','push') },
  @{ id='hrms-task';         name='HRMS Task';         steps=@('in_app','push') },
  @{ id='hrms-approval';     name='HRMS Approval';     steps=@('in_app','email') },
  @{ id='hrms-announcement'; name='HRMS Announcement'; steps=@('in_app','email','push') }
)
# ----------------------------------------------------------------------------

$root = Split-Path -Parent $PSScriptRoot
$envf = Join-Path $root 'deploy\.env'
$envMap = @{}
foreach ($line in Get-Content $envf) { $t=$line.Trim(); if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }; $k,$v=$t.Split('=',2); $envMap[$k.Trim()]=$v.Trim() }
$key = $envMap['NOVU_API_KEY']
$api = 'http://localhost:3010'
if (-not $key) { throw "NOVU_API_KEY missing in deploy/.env. Copy the Secret Key from Dashboard > Developer > API Keys." }
$h = @{ Authorization="ApiKey $key"; 'Content-Type'='application/json' }
function J($o){ $o | ConvertTo-Json -Depth 20 }

Write-Host "== Health ==" -ForegroundColor Cyan
$hc = Invoke-RestMethod "$api/v1/health-check" -TimeoutSec 10
if ($hc.data.status -ne 'ok') { throw "Novu API not healthy." }
Write-Host "  Novu $($hc.data.info.apiVersion.version) healthy; app=$($envMap['NOVU_APPLICATION_IDENTIFIER'])" -ForegroundColor Green

Write-Host "== Integrations ==" -ForegroundColor Cyan
$ints = Invoke-RestMethod "$api/v1/integrations" -Headers $h
$il = if ($ints.data){$ints.data}else{$ints}

$inApp = $il | Where-Object { $_.channel -eq 'in_app' } | Select-Object -First 1
if ($inApp -and $inApp.credentials.hmac -ne $true) {
  Invoke-RestMethod -Method PUT "$api/v1/integrations/$($inApp._id)" -Headers $h -Body (J @{ credentials=@{ hmac=$true } }) | Out-Null
  Write-Host "  In-App HMAC enabled" -ForegroundColor Green
} else { Write-Host "  In-App HMAC already on" -ForegroundColor DarkGray }

if (-not ($il | Where-Object { $_.channel -eq 'email' })) {
  Invoke-RestMethod -Method POST "$api/v1/integrations" -Headers $h -Body (J @{ providerId='nodemailer'; channel='email'; name='HRMS SMTP (Mailpit)'; active=$true; check=$false; credentials=@{ host=$MailpitHost; port=$MailpitPort; from='hrms@localhost'; senderName='HRMS'; secure=$false } }) | Out-Null
  Write-Host "  SMTP (Mailpit) created" -ForegroundColor Green
} else { Write-Host "  SMTP already present" -ForegroundColor DarkGray }

# Push channel: real Chrome/mobile push uses FCM (Google) - see docs/PUSH-FCM.md.
# (The local 'push-webhook' provider is intentionally NOT used: the pinned 3.17.0 image's
#  SSRF guard blocks callbacks to host.docker.internal and has no allow-list escape hatch.)
if ($il | Where-Object { $_.channel -eq 'push' }) {
  Write-Host "  Push integration present" -ForegroundColor DarkGray
} else {
  Write-Host "  Push: none yet - add FCM per docs/PUSH-FCM.md for real Chrome notifications" -ForegroundColor Yellow
}

Write-Host "== Workflows ==" -ForegroundColor Cyan
$existing = @()
try { $wfs = Invoke-RestMethod "$api/v2/workflows?limit=100" -Headers $h; $wl = $wfs.data.workflows; if (-not $wl){ $wl=$wfs.workflows }; $existing = @($wl | ForEach-Object { $_.workflowId }) } catch {}
function Step($t){
  switch ($t) {
    'in_app' { @{ name='In-App'; type='in_app'; controlValues=@{ subject='{{payload.title}}'; body='{{payload.message}}' } } }
    'email'  { @{ name='Email';  type='email';  controlValues=@{ subject='{{payload.title}}'; body='<p>{{payload.message}}</p><p><a href="https://{{payload.tenant_subdomain}}.rainertek.cloud{{payload.action_url}}">Open in HRMS</a></p>' } } }
    'push'   { @{ name='Push';   type='push';   controlValues=@{ subject='{{payload.title}}'; body='{{payload.message}}' } } }
  }
}
foreach ($wf in $Workflows) {
  if ($existing -contains $wf.id) { Write-Host "  = $($wf.id) exists" -ForegroundColor DarkGray; continue }
  $steps = @($wf.steps | ForEach-Object { Step $_ })
  Invoke-RestMethod -Method POST "$api/v2/workflows" -Headers $h -Body (J @{ name=$wf.name; workflowId=$wf.id; __source='dashboard'; active=$true; steps=$steps }) | Out-Null
  Write-Host "  + $($wf.id) created" -ForegroundColor Green
}

Write-Host ""
Write-Host "DONE. Your org is fully provisioned." -ForegroundColor Cyan
Write-Host "  Restart the demo backend so it reloads deploy/.env, then open http://localhost:4200"
