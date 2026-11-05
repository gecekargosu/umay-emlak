#!/data/data/com.termux/files/usr/bin/bash
# UMAY EMLAK - Termux tek komut kurulumu
# Tablette Termux'u actiktan sonra tek satir:
#   curl -sL http://192.168.1.33:8080/termux-kur.sh | bash
set -u

echo "== 1/4 paket listesi guncelleniyor"
pkg update -y >/dev/null 2>&1 || echo "  uyari: pkg update tam bitmedi"

echo "== 2/4 gerekli araclar kuruluyor (openssh, curl, python, git)"
pkg install -y openssh curl python git >/dev/null 2>&1 || echo "  uyari: kurulumda eksik olabilir"

echo "== 3/4 depolama izni + ekran uyanik"
termux-setup-storage >/dev/null 2>&1 || true
termux-wake-lock >/dev/null 2>&1 || true

echo "== 4/4 UMAY EMLAK sunuculari kontrol ediliyor"
for hedef in "3100/health" "8080/" "5175/"; do
  kod=$(curl -s -o /dev/null -m 6 -w "%{http_code}" "http://192.168.1.33:${hedef}" 2>/dev/null)
  echo "   http://192.168.1.33:${hedef} -> ${kod}"
done

echo
echo "Bitti. Faydali komutlar:"
echo "  termux-wake-lock           # ekran uyumasin"
echo "  curl http://192.168.1.33:3100/health"
echo "  pkg install -y termux-api   # pil/bildirim araclari"
