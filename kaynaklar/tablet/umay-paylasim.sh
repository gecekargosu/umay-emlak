#!/data/data/com.termux/files/usr/bin/bash
# UMAY EMLAK - laptop ile tablet arasinda paylasilan klasor
# Laptop tarafi: C:\Umay-tablet  (MTP ile tablete kopyalanir)
# Tablet tarafi : /sdcard/Umay-tablet  ->  ~/umay (symlink)
set -u

HEDEF="$HOME/storage/shared/Umay-tablet"
[ -d "$HEDEF" ] || HEDEF="/sdcard/Umay-tablet"

echo "== paylasim klasoru: $HEDEF"
if [ ! -d "$HEDEF" ]; then
  echo "  ! tablette /sdcard/Umay-tablet yok."
  echo "  laptopta UMAY-tablet.ps1 calistirilinca olusur."
  exit 1
fi

ln -sfn "$HEDEF" "$HOME/umay"
echo "  ~/umay -> $HEDEF"
echo
echo "== icerik"
ls -1 "$HEDEF" | head -20
echo
echo "kullanim: cd ~/umay"
