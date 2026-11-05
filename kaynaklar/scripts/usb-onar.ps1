# UMAY EMLAK - USB onarim betigi
# Klavye/fare USB hub uzerinden dusunce: Kod 21 (kaldiriliyor) kalintilarini temizler,
# xHCI denetleyicilerini yeniden baslatir, USB secmeli askiya alma ve hub guc yonetimini kapatir.
$ErrorActionPreference = 'Continue'

Write-Output '=== 1) DONANIM TARAMASI'
pnputil /scan-devices
Start-Sleep -Seconds 2

Write-Output '=== 2) KOD 21 / HATALI USB AYGITLARI'
$hatali = Get-PnpDevice -Class USB -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Error' }
if (-not $hatali) { Write-Output 'hata durumunda aygit yok' }
foreach ($d in $hatali) {
  Write-Output ('siliniyor: ' + $d.InstanceId + ' (' + $d.ProblemDescription + ')')
  pnputil /remove-device $d.InstanceId
}
Start-Sleep -Seconds 2

Write-Output '=== 3) xHCI DENETLEYICILERI YENIDEN BASLAT'
$xhci = Get-PnpDevice -Class USB -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'eXtensible Host Controller' -and $_.Status -eq 'OK' }
foreach ($c in $xhci) {
  Write-Output ('yeniden baslatiliyor: ' + $c.FriendlyName)
  pnputil /restart-device /instanceid $c.InstanceId
  Start-Sleep -Seconds 3
}
pnputil /scan-devices
Start-Sleep -Seconds 3

Write-Output '=== 4) USB SECMELI ASKIYA ALMA KAPAT (priz + batarya)'
$sub = '2a737441-1930-4402-8d77-b2bebba308a3'
$set = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
powercfg /setacvalueindex SCHEME_CURRENT $sub $set 0
powercfg /setdcvalueindex SCHEME_CURRENT $sub $set 0
powercfg /setactive SCHEME_CURRENT
powercfg /q SCHEME_CURRENT $sub $set | Select-String -Pattern 'Gecerli|Current|AC|DC'

Write-Output '=== 5) USB HUB GUC YONETIMI KAPAT'
$guc = Get-CimInstance -Namespace root\wmi -ClassName MSPower_DeviceEnable -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceName -match 'USB' }
foreach ($g in $guc) {
  try {
    Set-CimInstance -InputObject $g -Property @{ Enable = $false } -ErrorAction Stop
    Write-Output ('kapandi: ' + $g.InstanceName)
  } catch {
    Write-Output ('atlandi: ' + $g.InstanceName)
  }
}

Write-Output '=== 6) SON DURUM (klavye/fare)'
Get-PnpDevice -Class Keyboard, Mouse, HIDClass -ErrorAction SilentlyContinue |
  Select-Object Status, Class, FriendlyName |
  Format-Table -AutoSize | Out-String -Width 160

Write-Output '=== BITTI'
