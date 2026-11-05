# UMAY EMLAK - tablet (spacedesk) ekran ayari
# Amac: ikinci ekran 2560x1600 yerine 1600x1000 calissin; kablosuz yayinda
# gecikme cozunurlukle dogru orantili dustugu icin tablet akici olur.
# Kullanim: powershell -ExecutionPolicy Bypass -File ekran-ayar.ps1 [-Genislik 1600] [-Yukseklik 1000]
param(
  [int]$Genislik = 1600,
  [int]$Yukseklik = 1000
)

$ErrorActionPreference = 'Stop'

$code = @'
using System;
using System.Runtime.InteropServices;

public class Ekran {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion;
    public short dmDriverVersion;
    public short dmSize;
    public short dmDriverExtra;
    public int dmFields;
    public int dmPositionX;
    public int dmPositionY;
    public int dmDisplayOrientation;
    public int dmDisplayFixedOutput;
    public short dmColor;
    public short dmDuplex;
    public short dmYResolution;
    public short dmTTOption;
    public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
    public int dmICMMethod;
    public int dmICMIntent;
    public int dmMediaType;
    public int dmDitherType;
    public int dmReserved1;
    public int dmReserved2;
    public int dmPanningWidth;
    public int dmPanningHeight;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern bool EnumDisplaySettings(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode);

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);
}
'@

Add-Type -TypeDefinition $code

$bulundu = $false
for ($i = 0; $i -lt 10; $i++) {
  $dd = New-Object Ekran+DISPLAY_DEVICE
  $dd.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd)
  if (-not [Ekran]::EnumDisplayDevices($null, $i, [ref]$dd, 0)) { break }

  # Bazı sürücülerde DeviceString boş geliyor; bu yüzden adaptör adına değil
  # o an 2560x1600 çalışan ekrana bakılır (laptop paneli 2880x1800).
  $probe = New-Object Ekran+DEVMODE
  $probe.dmSize = [short][System.Runtime.InteropServices.Marshal]::SizeOf($probe)
  $ok = [Ekran]::EnumDisplaySettings($dd.DeviceName, -1, [ref]$probe)
  $hedef = $ok -and (
    ($probe.dmPelsWidth -eq 2560 -and $probe.dmPelsHeight -eq 1600) -or
    ($dd.DeviceString -match 'spacedesk') -or
    ($dd.DeviceID -match 'spacedesk')
  )
  Write-Output ("aday {0}: '{1}' id='{2}' {3}x{4}" -f $dd.DeviceName, $dd.DeviceString, $dd.DeviceID, $probe.dmPelsWidth, $probe.dmPelsHeight)
  if (-not $hedef) { continue }

  $bulundu = $true
  $dm = New-Object Ekran+DEVMODE
  $dm.dmSize = [short][System.Runtime.InteropServices.Marshal]::SizeOf($dm)
  if (-not [Ekran]::EnumDisplaySettings($dd.DeviceName, -1, [ref]$dm)) {
    Write-Output ("{0}: mevcut ayar okunamadi" -f $dd.DeviceName)
    continue
  }

  Write-Output ("{0} ({1}) once: {2}x{3} @{4}Hz" -f $dd.DeviceName, $dd.DeviceString, $dm.dmPelsWidth, $dm.dmPelsHeight, $dm.dmDisplayFrequency)

  $dm.dmPelsWidth = $Genislik
  $dm.dmPelsHeight = $Yukseklik
  $dm.dmDisplayFrequency = 60
  $dm.dmFields = 0x00080000 -bor 0x00100000 -bor 0x00400000  # PELSWIDTH | PELSHEIGHT | DISPLAYFREQUENCY

  $sonuc = [Ekran]::ChangeDisplaySettingsEx($dd.DeviceName, [ref]$dm, [IntPtr]::Zero, 0x00000001, [IntPtr]::Zero)
  Write-Output ("degistirme sonucu: {0} (0 = basarili)" -f $sonuc)

  $dm2 = New-Object Ekran+DEVMODE
  $dm2.dmSize = [short][System.Runtime.InteropServices.Marshal]::SizeOf($dm2)
  if ([Ekran]::EnumDisplaySettings($dd.DeviceName, -1, [ref]$dm2)) {
    Write-Output ("{0} sonra: {1}x{2} @{3}Hz" -f $dd.DeviceName, $dm2.dmPelsWidth, $dm2.dmPelsHeight, $dm2.dmDisplayFrequency)
  }
}

if (-not $bulundu) { Write-Output 'spacedesk ekrani bulunamadi (tablet bagli mi?)' }
