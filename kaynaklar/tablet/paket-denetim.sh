#!/data/data/com.termux/files/usr/bin/bash
# UMAY EMLAK - tablet uygulama denetimi
# Ne var, nereden kurulmus, hangisi magaza disi (riskli) - tek rapor.
# Tablette: curl -sL http://192.168.1.33:8080/paket-denetim.sh | bash
set -u
RAPOR="$HOME/umay-denetim.txt"

{
  echo "=== TABLET DENETIM RAPORU $(date '+%d.%m.%Y %H:%M')"
  echo "model : $(getprop ro.product.model 2>/dev/null)"
  echo "marka : $(getprop ro.product.brand 2>/dev/null)"
  echo "android: $(getprop ro.build.version.release 2>/dev/null) (SDK $(getprop ro.build.version.sdk 2>/dev/null))"
  echo "depolama: $(df -h /data 2>/dev/null | tail -1 | awk '{print "bos="$4" dolu="$3}')"
  echo
  echo "=== MAGAZA DISI (kendin kurdugun / supheli olabilir)"
  echo "-- kaynak 'com.android.vending' veya 'com.google.android.packageinstaller' DEGILSE asagida listelenir"
  cmd package list packages -3 -i 2>/dev/null | sed 's/^package://' | while IFS= read -r satir; do
    paket=${satir%% *}
    kaynak=${satir##*installer=}
    case "$kaynak" in
      com.android.vending|com.google.android.packageinstaller|"") ;;
      *) echo "  $paket  <- $kaynak" ;;
    esac
  done
  echo
  echo "=== TUM KULLANICI UYGULAMALARI ($(cmd package list packages -3 2>/dev/null | wc -l) adet)"
  cmd package list packages -3 2>/dev/null | sed 's/^package://' | sort | tr '\n' ' '
  echo
  echo
  echo "=== BILINEN ISTEMEYEN TUR (temizleyici / hizlandirici / bedava vpn / tarayici eklentisi)"
  cmd package list packages -3 2>/dev/null | sed 's/^package://' | grep -Ei 'clean|boost|speed|antivirus|security|vpn|turbo|master|saver|optimizer|battery' || echo "  (eslesme yok)"
  echo
  echo "=== YUKLU SISTEM SURUMU NOTU"
  echo "Play Store: $(cmd package list packages com.android.vending 2>/dev/null | grep -c vending)"
  echo "F-Droid  : $(cmd package list packages org.fdroid.fdroid 2>/dev/null | grep -c fdroid)"
  echo "Termux   : $(cmd package list packages com.termux 2>/dev/null | grep -c termux)"
  echo "Freebuff : $(cmd package list packages com.freebuff.app 2>/dev/null | grep -c freebuff)"
} > "$RAPOR" 2>&1

cat "$RAPOR"
echo
echo "rapor dosyasi: $RAPOR"
