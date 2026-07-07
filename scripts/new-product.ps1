<#
  NotiFly onboarding: provision a NEW, fully-isolated product on the shared Novu engine.
  Creates its own Organization (= product), Dev/Prod environments, keys, In-App HMAC, and a
  default workflow set, then prints the keys that product's backend + NotiFly Console will use.

  Usage:
    powershell -File scripts/new-product.ps1 -Product "CRM" -AdminEmail "admin@crm.local"
    powershell -File scripts/new-product.ps1 -Product "CRM" -AdminEmail "admin@crm.local" -Api https://api.novu.co
#>
param(
  [Parameter(Mandatory=$true)][string]$Product,
  [Parameter(Mandatory=$true)][string]$AdminEmail,
  [string]$AdminPassword = "",
  [string]$Api = "http://localhost:3010"
)
$ErrorActionPreference = 'Stop'
function J($o){ $o | ConvertTo-Json -Depth 20 }
function Field($o,$p){ if ($o.PSObject.Properties.Name -contains 'data'){ return $o.data.$p } else { return $o.$p } }
if (-not $AdminPassword) {
  $b = New-Object 'System.Byte[]' 9; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $AdminPassword = "Np!" + ((($b | ForEach-Object { $_.ToString('x2') }) -join ''))
}

Write-Host "== Provisioning NotiFly product '$Product' ==" -ForegroundColor Cyan
$hc = Invoke-RestMethod "$Api/v1/health-check" -TimeoutSec 10
if ($hc.data.status -ne 'ok') { throw "Novu engine not healthy at $Api" }

# 1. new org (= the product) + admin
$token = $null
try {
  $reg = Invoke-RestMethod -Method POST "$Api/v1/auth/register" -Headers @{'Content-Type'='application/json'} `
        -Body (J @{ email=$AdminEmail; password=$AdminPassword; firstName=$Product; lastName='Admin'; organizationName=$Product })
  $token = Field $reg 'token'; Write-Host "  created org + admin" -ForegroundColor Green
} catch {
  $login = Invoke-RestMethod -Method POST "$Api/v1/auth/login" -Headers @{'Content-Type'='application/json'} -Body (J @{ email=$AdminEmail; password=$AdminPassword })
  $token = Field $login 'token'; Write-Host "  admin exists - logged in" -ForegroundColor DarkGray
}
$authH = @{ Authorization="Bearer $token"; 'Content-Type'='application/json' }

# 2. Development env keys
$envs = Invoke-RestMethod "$Api/v1/environments" -Headers $authH
$list = if ($envs.PSObject.Properties.Name -contains 'data') { $envs.data } else { $envs }
$env = $list | Where-Object { $_.name -eq 'Development' } | Select-Object -First 1
$envId = $env._id; $appId = $env.identifier; $apiKey = $env.apiKeys[0].key
$bh = @{ Authorization="Bearer $token"; 'Content-Type'='application/json'; 'Novu-Environment-Id'=$envId }

# 3. In-App HMAC on
$ints = Invoke-RestMethod "$Api/v1/integrations" -Headers $bh
$il = if ($ints.data){$ints.data}else{$ints}
$inApp = $il | Where-Object { $_._environmentId -eq $envId -and $_.channel -eq 'in_app' } | Select-Object -First 1
if ($inApp -and $inApp.credentials.hmac -ne $true) {
  Invoke-RestMethod -Method PUT "$Api/v1/integrations/$($inApp._id)" -Headers $bh -Body (J @{ credentials=@{ hmac=$true } }) | Out-Null
  Write-Host "  In-App HMAC enabled" -ForegroundColor Green
}

# 4. default workflows (products add their own categories on top)
$inAppStep = @{ name='In-App'; type='in_app'; controlValues=@{ subject='{{payload.title}}'; body='{{payload.message}}' } }
$emailStep = @{ name='Email';  type='email';  controlValues=@{ subject='{{payload.title}}'; body='<p>{{payload.message}}</p>' } }
$defaults = @(
  @{ id='notifly-generic';      name="$Product Generic";      steps=@($inAppStep,$emailStep) },
  @{ id='notifly-announcement'; name="$Product Announcement"; steps=@($inAppStep,$emailStep) }
)
$have = @()
try { $wf = Invoke-RestMethod "$Api/v2/workflows?limit=100" -Headers $bh; $have = @($wf.data.workflows | ForEach-Object { $_.workflowId }) } catch {}
foreach ($w in $defaults) {
  if ($have -contains $w.id) { continue }
  Invoke-RestMethod -Method POST "$Api/v2/workflows" -Headers $bh -Body (J @{ name=$w.name; workflowId=$w.id; __source='dashboard'; active=$true; steps=$w.steps }) | Out-Null
  Write-Host "  + workflow $($w.id)" -ForegroundColor Green
}

Write-Host ""
Write-Host "DONE. Product '$Product' is provisioned and ISOLATED (its own Novu org)." -ForegroundColor Cyan
Write-Host "  Admin login : $AdminEmail / $AdminPassword"
Write-Host "  --- give these to $Product's backend + notifly-console/.env.local ---" -ForegroundColor Yellow
Write-Host "  NOVU_API_KEY=$apiKey"
Write-Host "  NOVU_APPLICATION_IDENTIFIER=$appId"
