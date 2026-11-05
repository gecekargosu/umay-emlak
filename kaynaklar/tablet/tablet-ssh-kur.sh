#!/data/data/com.termux/files/usr/bin/bash
# UMAY EMLAK - tablette SSH sunucusu
# Amac: laptop (UMAY EMLAK projesi) tabletin icine baglanip onu isci olarak kullanabilsin.
# Tablette Termux'ta tek satir:
#   curl -sL http://192.168.1.33:8080/tablet-ssh-kur.sh | bash
set -u

PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINBmco2+3Y96Cb4MyQY1jXzowO5bITkDkvztWH75OyHC umay-tablet'

echo "== 1/4 openssh + termux-api"
pkg install -y openssh >/dev/null 2>&1 || echo "  uyari: openssh kurulamadi"
pkg install -y termux-api >/dev/null 2>&1 || true

echo "== 2/4 laptopun anahtari yetkilendiriliyor"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
grep -qF 'umay-tablet' "$HOME/.ssh/authorized_keys" || echo "$PUBKEY" >> "$HOME/.ssh/authorized_keys"
echo "  anahtar eklendi"

echo "== 3/4 sshd baslatiliyor (port 8022)"
pkill sshd >/dev/null 2>&1
sleep 1
sshd
termux-wake-lock >/dev/null 2>&1 || true

echo "== 4/4 acilista otomatik baslama (Termux:Boot)"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/sshd.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock >/dev/null 2>&1
pkill sshd >/dev/null 2>&1
sshd
BOOT
chmod +x "$HOME/.termux/boot/sshd.sh"

IP=$(ifconfig 2>/dev/null | grep -o 'inet 192\.168\.[0-9]\{1,3\}\.[0-9]\{1,3\}' | head -1 | awk '{print $2}')
[ -z "${IP:-}" ] && IP="192.168.1.36"

echo
echo "HAZIR. Tablet artik laptopun iscisi:"
echo "  ssh -p 8022 $(whoami)@${IP}"
echo "  (laptop tarafindan anahtarla, sifre sorulmadan)"
