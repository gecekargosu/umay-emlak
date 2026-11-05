# UMAY EMLAK - tablet ADB kurulum
# 1) USB hata ayiklamayi actiktan sonra cihazi yeniden tarar.
# 2) Cihaz "device" olarak gorunuyorsa Termux ve F-Droid APK'larini kurar.
# 3) "unauthorized" ise tablette cikan izin uyarisina dokunulmasi gerektigini yazar.
$ErrorActionPreference = 'Continue'

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$dizin = 'C:\Users\isitm\Desktop\UMAY EMLAK\kaynaklar\tablet'
$termux = Join-Path $dizin 'termux-arm64.apk'
$fdroid = Join-Path $dizin 'fdroid.apk'

Write-Output '=== 1) DONANIM TARAMASI'
pnputil /scan-devices
Start-Sleep -Seconds 3

Write-Output '=== 2) XIAOMI AYGITLARI'
Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'VID_2717' } |
  Select-Object Status, Class, FriendlyName, InstanceId |
  Format-Table -AutoSize | Out-String -Width 200

Write-Output '=== 3) ADB'
if (-not (Test-Path $adb)) { Write-Output ('adb yok: ' + $adb); exit 1 }
& $adb kill-server | Out-Null
& $adb start-server | Out-Null
Start-Sleep -Seconds 2
& $adb devices -l

$liste = & $adb devices
$hazir = ($liste | Where-Object { $_ -match "\sdevice$" }) -ne $null
$yetkisiz = ($liste | Where-Object { $_ -match 'unauthorized' }) -ne $null

if ($hazir) {
  Write-Output '=== 4) KURULUM'
  & $adb install -r $termux
  Write-Output ('termux sonuc: ' + $LASTEXITCODE)
  & $adb install -r $fdroid
  Write-Output ('fdroid sonuc: ' + $LASTEXITCODE)

  # Kiosk/pano icin: USB takiliyken ekran uyumasin, donme kilidi acik kalsin.
  & $adb shell svc power stayon usb
  & $adb shell settings put system screen_off_timeout 1800000
  Write-Output '=== 5) KURULU PAKETLER'
  & $adb shell pm list packages | Select-String -Pattern 'termux|fdroid'
} elseif ($yetkisiz) {
  Write-Output '=== 4) YETKI BEKLENIYOR'
  Write-Output 'Tablette cikan "USB hata ayiklamaya izin ver" uyarisina IZIN VER, sonra bu betigi tekrar calistir.'
} else {
  Write-Output '=== 4) CIHAZ YOK'
  Write-Output 'Tablette: Ayarlar > Gelistirici secenekleri > USB hata ayiklama ACIK olmali;'
  Write-Output 'kabloyu cikar-tak ve USB bildiriminden "Dosya aktarimi" sec.'
}
