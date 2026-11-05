#!/data/data/com.termux/files/usr/bin/bash
# UMAY EMLAK - tablet acilis betigi (Termux:Boot)
# Kurulum (Termux icinde):
#   mkdir -p ~/.termux/boot
#   curl -sL http://192.168.1.33:8080/termux-boot-umay.sh -o ~/.termux/boot/umay.sh
#   chmod +x ~/.termux/boot/umay.sh
# Bundan sonra tablet her acildiginda: ekran uyanik kalir, sunucular kontrol edilir.

termux-wake-lock >/dev/null 2>&1 || true

LOG="$HOME/umay-acilis.log"
echo "--- $(date '+%d.%m.%Y %H:%M') acilis" >> "$LOG"
for hedef in "3100/health" "5175/" "8080/"; do
  kod=$(curl -s -o /dev/null -m 6 -w "%{http_code}" "http://192.168.1.33:${hedef}" 2>/dev/null)
  echo "  ${hedef} -> ${kod}" >> "$LOG"
done
