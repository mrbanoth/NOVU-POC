<#
  One-command, idempotent bootstrap for the HRMS x Novu POC.

  Turns a freshly-started Novu stack into a fully-configured, ready-to-demo instance with
  NO manual dashboard clicks. Safe to re-run. Reusable in any project - change the CONFIG block.

  What it does (all via Novu's public API):
    1. Registers an admin + organization (or logs in if it already exists)  -> JWT
    2. Reads the target environment's Application Identifier + Secret Key
    3. Writes NOVU_API_KEY / NOVU_APPLICATION_IDENTIFIER / NOTIFY_ENGINE into deploy/.env
    4. Enables HMAC on the In-App integration        (tenant isolation)
    5. Creates an SMTP integration -> Mailpit         (email channel)
    6. Creates a Push Webhook integration -> demo sink (push channel, local)
    7. Creates the HRMS workflows (in-app / email / push steps)

  Usage:   powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
#>

$ErrorActionPreference = 'Stop'

# -- CONFIG (change these to reuse in another project) ------------------------
$Api            = 'http://localhost:3010'
$AdminEmail     = 'admin@hrms-poc.local'
$AdminPassword  = 'HrmsPoc!2026x'
$OrgName        = 'HRMS POC'
$EnvironmentName= 'Development'                      # which Novu environment to wire up
$MailpitHost    = 'novu-mailpit'; $MailpitPort = '1025'
$PushWebhookUrl = 'http://host.docker.internal:4200/api/demo/push-webhook'
$Workflows = @(
  @{ id='hrms-generic';   name='HRMS Generic';   steps=@('in_app','email') },
  @{ id='hrms-timesheet'; name='HRMS Timesheet'; steps=@('in_app','email') },
  @{ id='hrms-task';      name='HRMS Task';      steps=@('in_app','push')  },
  @{ id='hrms-approval';  name='HRMS Approval';  steps=@('in_app','email') }
)
# ----------------------------------------------------------------------------

$root = Split-Path -Parent $PSScriptRoot
$envf = Join-Path $root 'deploy\.env'
function J($o){ $o | ConvertTo-Json -Depth 20 }
function Field($o,$p){ if ($o.PSObject.Properties.Name -contains 'data'){ return $o.data.$p } else { return $o.$p } }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Set-EnvVar($key,$val){
  if (Test-Path $envf) { $c = @(Get-Content $envf) } else { $c = @() }
  if ($c -match "^$key=") { $c = $c -replace "^$key=.*$", "$key=$val" }
  else { $c += "$key=$val" }
  [System.IO.File]::WriteAllLines($envf, $c, $Utf8NoBom)
}

Write-Host "== 0. Health ==" -ForegroundColor Cyan
$h = Invoke-RestMethod "$Api/v1/health-check" -TimeoutSec 10
if ($h.data.status -ne 'ok') { throw "Novu API not healthy. Is the stack up? (docker compose up -d)" }
Write-Host "  Novu $($h.data.info.apiVersion.version) healthy" -ForegroundColor Green

Write-Host "== 1. Admin + organization ==" -ForegroundColor Cyan
$token = $null
try {
  $reg = Invoke-RestMethod -Method POST -Uri "$Api/v1/auth/register" -Headers @{'Content-Type'='application/json'} `
        -Body (J @{ email=$AdminEmail; password=$AdminPassword; firstName='HRMS'; lastName='Admin'; organizationName=$OrgName })
  $token = Field $reg 'token'; Write-Host "  registered new org" -ForegroundColor Green
} catch {
  $login = Invoke-RestMethod -Method POST -Uri "$Api/v1/auth/login" -Headers @{'Content-Type'='application/json'} `
          -Body (J @{ email=$AdminEmail; password=$AdminPassword })
  $token = Field $login 'token'; Write-Host "  org exists - logged in" -ForegroundColor DarkGray
}
if (-not $token) { throw "Could not obtain an auth token." }

Write-Host "== 2. Environment keys ==" -ForegroundColor Cyan
$authH = @{ Authorization="Bearer $token"; 'Content-Type'='application/json' }
$envs = Invoke-RestMethod "$Api/v1/environments" -Headers $authH
$list = if ($envs.PSObject.Properties.Name -contains 'data') { $envs.data } else { $envs }
$env = $list | Where-Object { $_.name -eq $EnvironmentName } | Select-Object -First 1
if (-not $env) { throw "Environment '$EnvironmentName' not found." }
$envId = $env._id; $appId = $env.identifier; $apiKey = $env.apiKeys[0].key
$bh = @{ Authorization="Bearer $token"; 'Content-Type'='application/json'; 'Novu-Environment-Id'=$envId }
Write-Host "  env=$EnvironmentName appId=$appId apiKeyLen=$($apiKey.Length)" -ForegroundColor Green

Write-Host "== 3. Writing deploy/.env ==" -ForegroundColor Cyan
Set-EnvVar 'NOVU_API_KEY' $apiKey
Set-EnvVar 'NOVU_APPLICATION_IDENTIFIER' $appId
Set-EnvVar 'NOTIFY_ENGINE' 'dual'
Write-Host "  NOVU_API_KEY, NOVU_APPLICATION_IDENTIFIER, NOTIFY_ENGINE written" -ForegroundColor Green

Write-Host "== 4-6. Integrations ==" -ForegroundColor Cyan
$ints = Invoke-RestMethod "$Api/v1/integrations" -Headers $bh
$ilist = if ($ints.PSObject.Properties.Name -contains 'data') { $ints.data } else { $ints }
$envInts = $ilist | Where-Object { $_._environmentId -eq $envId }

# 4. HMAC on in-app
$inApp = $envInts | Where-Object { $_.channel -eq 'in_app' } | Select-Object -First 1
if ($inApp -and $inApp.credentials.hmac -ne $true) {
  Invoke-RestMethod -Method PUT -Uri "$Api/v1/integrations/$($inApp._id)" -Headers $bh -Body (J @{ credentials=@{ hmac=$true } }) | Out-Null
  Write-Host "  In-App HMAC enabled" -ForegroundColor Green
} else { Write-Host "  In-App HMAC already on" -ForegroundColor DarkGray }

# 5. SMTP -> Mailpit
if (-not ($envInts | Where-Object { $_.channel -eq 'email' })) {
  Invoke-RestMethod -Method POST -Uri "$Api/v1/integrations" -Headers $bh -Body (J @{ providerId='nodemailer'; channel='email'; name='HRMS SMTP (Mailpit)'; active=$true; check=$false; credentials=@{ host=$MailpitHost; port=$MailpitPort; from='hrms@localhost'; senderName='HRMS'; secure=$false } }) | Out-Null
  Write-Host "  SMTP (Mailpit) created" -ForegroundColor Green
} else { Write-Host "  SMTP already present" -ForegroundColor DarkGray }

# 6. Push Webhook
if (-not ($envInts | Where-Object { $_.channel -eq 'push' })) {
  Invoke-RestMethod -Method POST -Uri "$Api/v1/integrations" -Headers $bh -Body (J @{ providerId='push-webhook'; channel='push'; name='HRMS Push Webhook (local)'; active=$true; check=$false; credentials=@{ webhookUrl=$PushWebhookUrl } }) | Out-Null
  Write-Host "  Push Webhook created" -ForegroundColor Green
} else { Write-Host "  Push already present" -ForegroundColor DarkGray }

Write-Host "== 7. Workflows ==" -ForegroundColor Cyan
$existing = @()
try {
  $wfs = Invoke-RestMethod "$Api/v2/workflows?limit=100" -Headers $bh
  $wl = $wfs.data.workflows                     # list shape: { data: { workflows: [...] } }
  if (-not $wl) { $wl = $wfs.workflows }
  $existing = @($wl | ForEach-Object { $_.workflowId })
} catch {}
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
  Invoke-RestMethod -Method POST -Uri "$Api/v2/workflows" -Headers $bh -Body (J @{ name=$wf.name; workflowId=$wf.id; __source='dashboard'; active=$true; steps=$steps }) | Out-Null
  Write-Host "  + $($wf.id) created" -ForegroundColor Green
}

Write-Host ""
Write-Host "DONE. Novu is fully configured." -ForegroundColor Cyan
Write-Host "  Dashboard : http://localhost:4000  (login $AdminEmail / $AdminPassword)"
Write-Host "  Next      : run the demo backend, then scripts/smoke-test.ps1"
Write-Host "              cd demo/backend; pip install -r requirements.txt; uvicorn app:app --port 4200"
