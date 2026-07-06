# Generates a fresh deploy/.env from deploy/.env.example with cryptographic secrets.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/gen-secrets.ps1
# Existing deploy/.env is backed up to deploy/.env.bak before overwriting.

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $PSScriptRoot
$example   = Join-Path $root 'deploy\.env.example'
$target    = Join-Path $root 'deploy\.env'

function Rand-Hex([int]$bytes) {
    $b = New-Object 'System.Byte[]' $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString('x2') })
}

$jwt       = Rand-Hex 32
$novuKey   = Rand-Hex 32
$storeKey  = Rand-Hex 16   # 32 hex chars — required length
$mongoPass = Rand-Hex 12

if (Test-Path $target) { Copy-Item $target "$target.bak" -Force; Write-Host "Backed up existing .env -> .env.bak" }

$content = Get-Content $example -Raw
$content = $content -replace '(?m)^JWT_SECRET=.*$',                 "JWT_SECRET=$jwt"
$content = $content -replace '(?m)^NOVU_SECRET_KEY=.*$',           "NOVU_SECRET_KEY=$novuKey"
$content = $content -replace '(?m)^STORE_ENCRYPTION_KEY=.*$',      "STORE_ENCRYPTION_KEY=$storeKey"
$content = $content -replace '(?m)^MONGO_INITDB_ROOT_PASSWORD=.*$', "MONGO_INITDB_ROOT_PASSWORD=$mongoPass"

Set-Content -Path $target -Value $content -Encoding utf8 -NoNewline
Write-Host "Wrote $target with fresh secrets."
