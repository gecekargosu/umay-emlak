#!/usr/bin/env python3
"""UMAY EMLAK - tablete tasinacak paketleri uretir.

Kullanim:
    python kaynaklar/scripts/tablet-paketle.py 3-DONEM MOBIL KAYNAK
    (arguman verilmezse hepsi)

Cikti: kaynaklar/tablet/paylas/*.zip
"""
from __future__ import annotations

import os
import sys
import time
import zipfile

EV = r"C:\Users\isitm\Desktop"
PROJE = r"C:\Users\isitm\Desktop\UMAY EMLAK"
CIKTI = os.path.join(PROJE, "kaynaklar", "tablet", "paylas")

ATLA_KLASOR = {
    "node_modules", ".git", ".gradle", "build", "dist", ".next", ".dart_tool",
    "Pods", "__pycache__", ".venv", "venv", ".idea", ".vs", "obj", "bin",
    "Debug", "Release", ".cache", "coverage", ".expo", ".kotlin",
}
ATLA_UZANTI = {".zip", ".rar", ".7z", ".iso", ".mp4", ".mkv", ".apk", ".exe", ".msi",
               ".psd", ".tif", ".tiff", ".blend", ".unitypackage"}

# Program klasorunde medya/arsiv dosyalari cok yer tutuyor; kaynak odakli tasiyoruz.
ATLA_MEDYA = ATLA_UZANTI | {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic",
    ".mp3", ".wav", ".m4a", ".ogg", ".mov", ".avi", ".webm",
    ".pdf", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt",
    ".ttf", ".otf", ".woff", ".woff2", ".jar", ".aar", ".so", ".dll", ".exe",
}

PAKETLER = {
    "3-DONEM": ("3-DONEM.zip", os.path.join(EV, "3.DÖNEM"), set()),
    "MOBIL": ("MOBIL-APLIKASYONLAR.zip",
              os.path.join(EV, "Geliştirmeye çalıştığım mobile aplikasyonlar"), set()),
    "MOBIL-KAYNAK": ("MOBIL-KAYNAK.zip",
                     os.path.join(EV, "Geliştirmeye çalıştığım mobile aplikasyonlar"),
                     {"__medya_atla__"}),
    "KAYNAK": ("UMAY-EMLAK-KAYNAK.zip", PROJE, {"loglar", "release", "paylas", ".freebuff"}),
}


def paketle(ad: str, kaynak: str, ek_atla: set[str] | None = None) -> None:
    os.makedirs(CIKTI, exist_ok=True)
    hedef = os.path.join(CIKTI, ad)
    medya_atla = "__medya_atla__" in (ek_atla or set())
    atla = set(ATLA_KLASOR) | {e for e in (ek_atla or set()) if not e.startswith("__")}
    uzanti_atla = ATLA_MEDYA if medya_atla else ATLA_UZANTI
    t0 = time.time()
    sayi = 0
    atlanan = 0
    print(f"\n== {ad}\n   kaynak: {kaynak}", flush=True)
    if not os.path.isdir(kaynak):
        print("   ! klasor yok, atlandi", flush=True)
        return
    with zipfile.ZipFile(hedef, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as z:
        for kok, klasorler, dosyalar in os.walk(kaynak):
            klasorler[:] = [k for k in klasorler if k not in atla]
            for d in dosyalar:
                yol = os.path.join(kok, d)
                try:
                    if os.path.getsize(yol) == 0:
                        atlanan += 1
                        continue
                    if os.path.splitext(d)[1].lower() in uzanti_atla:
                        atlanan += 1
                        continue
                    z.write(yol, os.path.relpath(yol, kaynak))
                    sayi += 1
                except OSError:
                    continue
                if sayi % 500 == 0:
                    print(f"   ... {sayi} dosya ({time.time()-t0:.0f}s)", flush=True)
    boyut = os.path.getsize(hedef) / (1024 * 1024)
    print(f"   BITTI: {sayi} dosya, {atlanan} atlandi, {boyut:.1f} MB, {time.time()-t0:.0f}s", flush=True)


def main(argv: list[str]) -> int:
    secili = [a.upper() for a in argv if a.upper() in PAKETLER] or list(PAKETLER)
    for anahtar in secili:
        ad, kaynak, ek = PAKETLER[anahtar]
        paketle(ad, kaynak, ek)
    print("\n== OZET", flush=True)
    for f in sorted(os.listdir(CIKTI)):
        p = os.path.join(CIKTI, f)
        print(f"   {f}: {os.path.getsize(p)/(1024*1024):.1f} MB", flush=True)
    print("TAMAM", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
