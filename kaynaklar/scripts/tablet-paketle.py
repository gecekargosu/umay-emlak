#!/usr/bin/env python3
"""UMAY EMLAK - tablete tasinacak paketleri uretir.

Kullanim:  python kaynaklar/scripts/tablet-paketle.py
Cikti   :  kaynaklar/tablet/paylas/*.zip
Amac    :  tablette calisirken gereken dosyalari tek tek degil, tek zip olarak tasimak.
"""
from __future__ import annotations

import os
import sys
import time
import zipfile

EV = r"C:\Users\isitm\Desktop"
PROJE = r"C:\Users\isitm\Desktop\UMAY EMLAK"
CIKTI = os.path.join(PROJE, "kaynaklar", "tablet", "paylas")

# Bu klasorler tasinmaz: cok buyuk, tekrar uretilebilir, gereksiz.
ATLA_KLASOR = {
    "node_modules", ".git", ".gradle", "build", "dist", ".next", ".dart_tool",
    "Pods", "__pycache__", ".venv", "venv", ".idea", ".vs", "obj", "bin",
    "Debug", "Release", ".cache", "coverage", ".expo",
}
ATLA_UZANTI = {".zip", ".rar", ".7z", ".iso", ".mp4", ".mkv", ".apk", ".exe", ".msi"}


def paketle(ad: str, kaynak: str, ek_atla: set[str] | None = None) -> None:
    os.makedirs(CIKTI, exist_ok=True)
    hedef = os.path.join(CIKTI, ad)
    atla = set(ATLA_KLASOR) | (ek_atla or set())
    t0 = time.time()
    sayi = 0
    atlanan = 0
    print(f"\n== {ad}\n   kaynak: {kaynak}", flush=True)
    if not os.path.isdir(kaynak):
        print("   ! klasor yok, atlandi", flush=True)
        return
    with zipfile.ZipFile(hedef, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for kok, klasorler, dosyalar in os.walk(kaynak):
            klasorler[:] = [k for k in klasorler if k not in atla]
            for d in dosyalar:
                yol = os.path.join(kok, d)
                try:
                    if os.path.getsize(yol) == 0:
                        continue
                    if os.path.splitext(d)[1].lower() in ATLA_UZANTI:
                        atlanan += 1
                        continue
                    z.write(yol, os.path.relpath(yol, kaynak))
                    sayi += 1
                except OSError:
                    continue
                if sayi % 200 == 0:
                    print(f"   ... {sayi} dosya ({time.time()-t0:.0f}s)", flush=True)
    boyut = os.path.getsize(hedef) / (1024 * 1024)
    print(f"   BITTI: {sayi} dosya, {atlanan} atlandi, {boyut:.1f} MB, {time.time()-t0:.0f}s", flush=True)


def main() -> int:
    paketle("3-DONEM.zip", os.path.join(EV, "3.DÖNEM"))
    paketle(
        "MOBIL-APLIKASYONLAR.zip",
        os.path.join(EV, "Geliştirmeye çalıştığım mobile aplikasyonlar"),
    )
    paketle("UMAY-EMLAK-KAYNAK.zip", PROJE, {"loglar", "release", "paylas"})
    print("\n== OZET", flush=True)
    for ad in sorted(os.listdir(CIKTI)):
        p = os.path.join(CIKTI, ad)
        print(f"   {ad}: {os.path.getsize(p)/(1024*1024):.1f} MB", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
