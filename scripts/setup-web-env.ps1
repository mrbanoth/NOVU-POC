<#
  Creates hrms-web/.env.local for a fresh clone:
    - copies NOVU_API_KEY + NOVU_APPLICATION_IDENTIFIER from deploy/.env (set by bootstrap.ps1)
    - generates a fresh VAPID keypair (needs `npm install` done in hrms-web first)
  Run AFTER: scripts/bootstrap.ps1  and  (cd hrms-web; npm install)
  Usage:  powershell -File scripts/setup-web-env.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$deployEnv = Join-Path $root 'deploy\.env'
$webDir = Join-Path $root 'hrms-web'
$webEnv = Join-Path $webDir '.env.local'

$map = @{}
foreach ($l in Get-Content $deployEnv) { $t = $l.Trim(); if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }; $k, $v = $t.Split('=', 2); $map[$k.Trim()] = $v.Trim() }
$apiKey = $map['NOVU_API_KEY']; $appId = $map['NOVU_APPLICATION_IDENTIFIER']
if (-not $apiKey -or -not $appId) { throw "NOVU_API_KEY / NOVU_APPLICATION_IDENTIFIER not in deploy/.env - run scripts/bootstrap.ps1 first." }

Push-Location $webDir
try { $vapid = node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+'|'+k.privateKey)" }
catch { Pop-Location; throw "Could not generate VAPID keys - run 'npm install' in hrms-web first." }
Pop-Location
$pub, $priv = $vapid.Trim().Split('|')

$content = @"
NOVU_API_URL=http://localhost:3010
NOVU_WS_URL=http://localhost:3011
NOVU_API_KEY=$apiKey
NOVU_APPLICATION_IDENTIFIER=$appId
VAPID_PUBLIC_KEY=$pub
VAPID_PRIVATE_KEY=$priv
VAPID_SUBJECT=mailto:admin@hrms.local
"@
[System.IO.File]::WriteAllText($webEnv, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote hrms-web/.env.local (Novu keys copied from deploy/.env + fresh VAPID keys)." -ForegroundColor Green
Write-Host "Next: cd hrms-web; npm run dev  ->  http://localhost:3005" -ForegroundColor Cyan
