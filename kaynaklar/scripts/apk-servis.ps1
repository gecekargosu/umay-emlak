# UMAY EMLAK - tablet APK servisi (port 8080)
# Tablet ayni Wi-Fi'deyken http://<laptop-ip>:8080 adresinden APK'lari indirir.
# Yeniden baslatmak icin bu betigi calistir; eski surec varsa kapatir.
$ErrorActionPreference = 'Continue'

$port = 8080
$dizin = Join-Path $PSScriptRoot '..\tablet'
$dizin = (Resolve-Path $dizin).Path

$eski = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
# Not: $pid PowerShell'de salt-okunur otomatik degisken; farkli ad kullanilir.
foreach ($surec in $eski) {
  try {
    Stop-Process -Id $surec -Force -ErrorAction Stop
    Write-Output ("eski servis kapatildi: PID " + $surec)
  } catch {
    Write-Output ("kapatilamadi: PID " + $surec)
  }
}
Start-Sleep -Seconds 1

Start-Process -FilePath 'python' -ArgumentList @('-m', 'http.server', $port, '--bind', '0.0.0.0', '--directory', $dizin) -WindowStyle Hidden
Start-Sleep -Seconds 3

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like '192.168.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
Write-Output ("klasor: " + $dizin)
Write-Output ("adres : http://" + $ip + ":" + $port)
Get-ChildItem $dizin -File | ForEach-Object { Write-Output ("  " + $_.Name + " (" + [math]::Round($_.Length / 1MB, 1) + " MB)") }

try {
  $r = Invoke-WebRequest -Uri ("http://localhost:" + $port + "/") -UseBasicParsing -TimeoutSec 8
  Write-Output ("servis: HTTP " + [int]$r.StatusCode)
} catch {
  Write-Output ("servis yanit vermedi: " + $_.Exception.Message)
}
