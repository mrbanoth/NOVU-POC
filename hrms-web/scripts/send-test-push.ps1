<#
  Send a Web Push to a subscriber FROM THE SERVER (no browser needed to trigger it),
  then check whether the service worker received it - proving push works with the app
  tab (or the whole browser) closed.

  Usage:
    powershell -File scripts/send-test-push.ps1 acme:admin
    powershell -File scripts/send-test-push.ps1            # defaults to acme:admin

  How to test browser-closed push:
    1. In Chrome: open http://localhost:3005, sign in, click "Enable alerts" (Allow the prompt).
    2. CLOSE the HRMS tab (or minimize/close Chrome - keep Chrome's background process on,
       see chrome://settings/system  ->  "Continue running background apps ...").
    3. Run this script. Watch the bottom-right of your screen for the Windows banner,
       and read the "service worker received" line below for programmatic proof.
#>
param([string]$Subscriber = "acme:admin", [string]$Base = "http://localhost:3005")

Write-Host "== Sending a Web Push to '$Subscriber' from the server ==" -ForegroundColor Cyan
try {
  $send = Invoke-RestMethod -Method POST "$Base/api/push/self-test" -Headers @{ 'Content-Type' = 'application/json' } -Body (@{ subscriberId = $Subscriber } | ConvertTo-Json)
} catch { Write-Host "  ERROR: is the app running on $Base? ($($_.Exception.Message))" -ForegroundColor Red; exit 1 }

if ($send.devices -eq 0) {
  Write-Host "  No subscribed devices for '$Subscriber'. Open the app, sign in as that user, and click 'Enable alerts' first." -ForegroundColor Yellow
  exit 0
}
Write-Host "  push service accepted: $($send.sent)/$($send.devices) device(s) (201=ok, 410=expired-and-pruned)" -ForegroundColor Green

Write-Host "== Waiting for the service worker to handle it (works with no tab open) ==" -ForegroundColor Cyan
$got = $null
for ($i = 0; $i -lt 8; $i++) {
  Start-Sleep -Seconds 2
  $rec = (Invoke-RestMethod "$Base/api/push/received").received
  if ($rec.Count -gt 0) { $got = $rec[0]; break }
}
if ($got) {
  Write-Host "  PROOF: the service worker received the push." -ForegroundColor Green
  Write-Host "     title='$($got.title)'  openTabs=$($got.openTabs)  ->  openTabs=0 means the app was CLOSED and push still worked." -ForegroundColor Green
} else {
  Write-Host "  No service-worker beacon yet. Usually means: this device isn't subscribed (click 'Enable alerts')," -ForegroundColor Yellow
  Write-Host "  or Chrome is fully quit WITHOUT background apps enabled, or FCM is just slow (try again)." -ForegroundColor Yellow
}
Write-Host "`nAlso watch the bottom-right of your screen for the Windows notification banner." -ForegroundColor Cyan
