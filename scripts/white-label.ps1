<#
  NotiFly white-label enforcement (self-hosted).
  Sets removeNovuBranding=true on every organization so the "Powered by Novu" watermark is
  dropped from emails, the in-app inbox, and dashboard previews. Idempotent — safe to re-run.
  Run once after onboarding new products (scripts/new-product.ps1).

  Usage:  powershell -File scripts/white-label.ps1
#>
param(
  [string]$MongoContainer = "novu-mongodb",
  [string]$Db = "novu-db",
  [string]$EnvFile = "$PSScriptRoot\..\deploy\.env"
)
$ErrorActionPreference = 'Stop'

# read mongo root creds from deploy/.env
function Get-EnvVal($name) {
  $line = Select-String -Path $EnvFile -Pattern "^$name=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) { return ($line.Line -replace "^$name=", '').Trim() }
  return $null
}
$user = Get-EnvVal 'MONGO_INITDB_ROOT_USERNAME'
$pass = Get-EnvVal 'MONGO_INITDB_ROOT_PASSWORD'
if (-not $user -or -not $pass) { throw "Could not read Mongo creds from $EnvFile" }

Write-Host "== NotiFly: removing 'Powered by Novu' from all organizations ==" -ForegroundColor Cyan
$js = @"
const d = db.getSiblingDB('$Db');
const r = d.organizations.updateMany({}, { `$set: { removeNovuBranding: true } });
print('orgs matched=' + r.matchedCount + ' modified=' + r.modifiedCount);
d.organizations.find({}, { name: 1, removeNovuBranding: 1 }).forEach(o => print('  ' + o.name + '  removeNovuBranding=' + o.removeNovuBranding));
"@
docker exec $MongoContainer mongosh -u $user -p $pass --authenticationDatabase admin --quiet --eval $js
Write-Host "Done. Reload the dashboard (hard-refresh) to see previews update." -ForegroundColor Green
