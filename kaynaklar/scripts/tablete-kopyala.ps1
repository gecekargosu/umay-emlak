# UMAY EMLAK - tablete dosya kopyalama (MTP / USB kablo)
# Tablet "Redmi Pad 2" olarak MTP ile bagli; surucu harfi olmadigi icin
# Explorer COM nesnesi uzerinden kopyalanir (Download klasoru).
$ErrorActionPreference = 'Continue'

$kaynak = @(
  'C:\Users\isitm\Desktop\UMAY EMLAK\kaynaklar\tablet\termux-arm64.apk',
  'C:\Users\isitm\Desktop\UMAY EMLAK\kaynaklar\tablet\fdroid.apk',
  'C:\Users\isitm\Desktop\UMAY EMLAK\kaynaklar\tablet\OKU-BENI-TABLET.md'
)

$shell = New-Object -ComObject Shell.Application
$pc = $shell.NameSpace(17)   # Bu Bilgisayar
if (-not $pc) { Write-Output 'Bu Bilgisayar acilamadi'; exit 1 }

$cihaz = $null
foreach ($item in $pc.Items()) {
  if ($item.Name -match 'Redmi|Pad|Tablet|MTP') { $cihaz = $item; break }
}
if (-not $cihaz) {
  Write-Output 'MTP cihazi bulunamadi. Tablette "Dosya aktarimi" modunu sec.'
  $pc.Items() | ForEach-Object { Write-Output ('  cihaz: ' + $_.Name) }
  exit 1
}
Write-Output ('cihaz: ' + $cihaz.Name)

$kok = $cihaz.GetFolder
if (-not $kok) { Write-Output 'cihaz klasoru acilamadi'; exit 1 }

# MTP'de depo ogesi IsFolder=false donebiliyor; o yuzden GetFolder denenir.
$depo = $null
foreach ($alt in $kok.Items()) {
  Write-Output ('  depo adayi: ' + $alt.Name)
  $deneme = $alt.GetFolder
  if ($deneme) { $depo = $alt; break }
}
if (-not $depo) {
  foreach ($alt in $kok.Items()) { Write-Output ('  icerik: ' + $alt.Name) }
  Write-Output 'dahili depolama bulunamadi'
  exit 1
}

$depoKlasoru = $depo.GetFolder
$hedef = $null
foreach ($alt in $depoKlasoru.Items()) {
  if ($alt.IsFolder -and $alt.Name -match 'Download|İndirilenler|Indirilenler') { $hedef = $alt; break }
}
if (-not $hedef) {
  Write-Output 'Download klasoru yok; kok dizine kopyalanacak'
  $hedef = $depo
}

Write-Output ('hedef: ' + $hedef.Name)
foreach ($dosya in $kaynak) {
  if (-not (Test-Path $dosya)) { Write-Output ('atlandi (yok): ' + $dosya); continue }
  $ad = Split-Path $dosya -Leaf
  try {
    $hedef.CopyHere($dosya, 16)
    Write-Output ('kopyalandi: ' + $ad)
  } catch {
    Write-Output ('kopyalanamadi: ' + $ad + ' -> ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 2
}

Start-Sleep -Seconds 3
Write-Output '--- tabletteki Download icerigi ---'
$hedef.GetFolder.Items() | Select-Object -First 15 | ForEach-Object { Write-Output ('  ' + $_.Name) }
Write-Output 'BITTI'
