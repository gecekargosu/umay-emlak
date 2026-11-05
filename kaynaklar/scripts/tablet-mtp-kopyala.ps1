# UMAY EMLAK - laptop -> tablet dosya kopyalama (MTP)
# Kullanim: tablet USB ile bagli ve kilidi acikken calistir.
#   powershell -NoProfile -ExecutionPolicy Bypass -File kaynaklar\scripts\tablet-mtp-kopyala.ps1
# Hedef: tablette /sdcard/Umay-tablet  (Termux'ta: ~/umay)

$ErrorActionPreference = 'Continue'
$proje = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$paylas = Join-Path $proje 'kaynaklar\tablet\paylas'
$hedefAd = 'Umay-tablet'

$shell = New-Object -ComObject Shell.Application
$tablet = $shell.NameSpace(17).Items() | Where-Object { $_.Name -match 'Redmi|Pad' } | Select-Object -First 1
if (-not $tablet) { Write-Output 'tablet bulunamadi (USB + kilit acik olmali)'; exit 1 }

$store = $tablet.GetFolder.Items() | Where-Object { $_.Name -match 'Dahili' } | Select-Object -First 1
if (-not $store) { Write-Output 'depolama acilmadi (tablet kilidini ac)'; exit 1 }
$kok = $store.GetFolder

$hedef = $kok.Items() | Where-Object { $_.Name -eq $hedefAd } | Select-Object -First 1
if (-not $hedef) {
  $kok.NewFolder($hedefAd) | Out-Null
  Start-Sleep -Seconds 2
  $hedef = $kok.Items() | Where-Object { $_.Name -eq $hedefAd } | Select-Object -First 1
}
if (-not $hedef) { Write-Output 'hedef klasor olusturulamadi'; exit 1 }
$hf = $hedef.GetFolder
Write-Output ("hedef: /sdcard/" + $hedefAd)

if (-not (Test-Path $paylas)) { Write-Output ("paylas klasoru yok: " + $paylas); exit 1 }

foreach ($dosya in Get-ChildItem $paylas -File) {
  $var = $hf.ParseName($dosya.Name)
  $mevcutBoyut = 0
  if ($var) {
    $b = $hf.GetDetailsOf($var, 2) -replace '[^0-9]', ''
    if ($b) { $mevcutBoyut = [int64]$b }
  }
  if ($mevcutBoyut -ge $dosya.Length) { Write-Output ($dosya.Name + ': zaten var, atlandi'); continue }
  Write-Output ("kopyalaniyor: " + $dosya.Name + " (" + [math]::Round($dosya.Length/1MB,1) + " MB)")
  $hf.CopyHere($dosya.FullName, 16)
  $bekle = 0
  while ($bekle -lt 900) {
    Start-Sleep -Seconds 2
    $v = $hf.ParseName($dosya.Name)
    if ($v) {
      $s = $hf.GetDetailsOf($v, 2) -replace '[^0-9]', ''
      if ($s -and [int64]$s -ge $dosya.Length) { break }
    }
    $bekle += 2
  }
  Write-Output ("  bitti (" + $bekle + " sn)")
}

Write-Output 'TUM DOSYALAR TAMAM'
Get-ChildItem $paylas -File | ForEach-Object { "  " + $_.Name + "  " + [math]::Round($_.Length/1MB,1) + " MB" }
