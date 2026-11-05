# UMAY EMLAK - tek dosya kopyalama (MTP), hiz olcumlu
# Kullanim:
#   powershell -NoProfile -ExecutionPolicy Bypass -File kaynaklar\scripts\tablet-mtp-tek.ps1 -Dosya "yol\dosya.zip"
param(
  [Parameter(Mandatory = $true)][string]$Dosya,
  [string]$HedefKlasor = 'Umay-tablet'
)

$ErrorActionPreference = 'Continue'
if (-not (Test-Path $Dosya)) { Write-Output ("dosya yok: " + $Dosya); exit 1 }
$kaynak = Get-Item $Dosya
$shell = New-Object -ComObject Shell.Application
$tablet = $shell.NameSpace(17).Items() | Where-Object { $_.Name -match 'Redmi|Pad' } | Select-Object -First 1
if (-not $tablet) { Write-Output 'tablet bulunamadi (USB + kilit acik olmali)'; exit 1 }
$store = $tablet.GetFolder.Items() | Where-Object { $_.Name -match 'Dahili' } | Select-Object -First 1
if (-not $store) { Write-Output 'depolama acilmadi (tablet kilidini ac)'; exit 1 }
$kok = $store.GetFolder
$hedef = $kok.Items() | Where-Object { $_.Name -eq $HedefKlasor } | Select-Object -First 1
if (-not $hedef) { $kok.NewFolder($HedefKlasor) | Out-Null; Start-Sleep -Seconds 2; $hedef = $kok.Items() | Where-Object { $_.Name -eq $HedefKlasor } | Select-Object -First 1 }
if (-not $hedef) { Write-Output 'hedef klasor olusturulamadi'; exit 1 }
$hf = $hedef.GetFolder

$var = $hf.ParseName($kaynak.Name)
if ($var) {
  $b = $hf.GetDetailsOf($var, 2) -replace '[^0-9]', ''
  if ($b -and [int64]$b -ge $kaynak.Length) { Write-Output ($kaynak.Name + ': zaten tam, atlandi'); exit 0 }
}

$mb = [math]::Round($kaynak.Length / 1MB, 1)
Write-Output ("kopyalaniyor: " + $kaynak.Name + " (" + $mb + " MB)")
$t0 = Get-Date
$hf.CopyHere($kaynak.FullName, 16)

$son = 0
$veri = 0.0
while (((Get-Date) - $t0).TotalSeconds -lt 3600) {
  Start-Sleep -Seconds 5
  $v = $hf.ParseName($kaynak.Name)
  $simdi = 0
  if ($v) {
    $s = $hf.GetDetailsOf($v, 2) -replace '[^0-9]', ''
    if ($s) { $simdi = [int64]$s }
  }
  if ($simdi -gt 0) {
    $sn = ((Get-Date) - $t0).TotalSeconds
    $veri = ($simdi - $son) / 1MB
    $hiz = if ($veri -gt 0) { [math]::Round($veri / 5, 2) } else { 0 }
    Write-Output ("  " + [math]::Round($simdi / 1MB, 1) + " / " + $mb + " MB  (" + $sn.ToString('0') + " sn, ~" + $hiz + " MB/sn)")
    $son = $simdi
  }
  if ($simdi -ge $kaynak.Length) { break }
}

$v = $hf.ParseName($kaynak.Name)
$sonuc = if ($v) { $hf.GetDetailsOf($v, 2) } else { 'yok' }
$sure = [math]::Round(((Get-Date) - $t0).TotalSeconds, 0)
Write-Output ("BITTI: " + $kaynak.Name + " -> " + $sonuc + "  (" + $sure + " sn)")
