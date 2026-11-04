# PROJECT-STATUS

Son güncelleme: 2026-11-04 22:10 · Aktif tur: TUR:37 bitti, TUR:38 bekliyor

## Şu an çalışan (doğrulandı)
- Giriş/oturum, boşta kilit, şifre değiştirme; ofis/personel/onay yetkisi.
- Mal sahipleri alfabetik raflar + kişi dosyası; mülk + ilan ayrımı; raf ve liste görünümü.
- Belge arşivi (sha256 tek kopya, ada göre eşleştirme), fiyat geçmişi, teklif/kapora/komisyon.
- Sözleşme + kiracılık + teslim tutanağı + depozito; kira tahakkuku/tahsilat/gecikme.
- DASK/poliçe + 30 gün uyarısı; kira artışı (oran + kaynak + onay); randevu + takvim.
- Portföy önerisi; arıza/bakım talebi (fotoğraf, durum, masraf); Excel/CSV içe aktarma.
- Taşınabilir Windows paketi: `Desktop/Aysana-gonderilecek/UmayEmlak-Beta-2026-11-04/` + zip (288 MB).
  Doğrulama: `/health {"ok":true,"migrations":15}`, giriş 200, HTML 200, ilk açılış 14 sn.

## Açık işler (ayrıntı: 10-DENETIM-ISTEK-LISTESI-2026-11-04.txt)
- H-1…H-15 ekran/metin/sayaç bulguları (ana sayfa başlığı "Takvim", mal sahibi "—", 51/49 sayaç,
  personel metni, poliçe mülk seçici, arıza başlığı…).
- K-1…K-10 kod bulguları (Listings.tsx 914 satır, api.ts 725, documents.ts 716, 11 sessiz catch,
  audit_log yok, domain birim testi yok).
- SIRA 8 otomasyon (yükümlülük motoru + e-posta), SIRA 9 ekstre/gider, SIRA 11 kapak fotoğrafı + filigran.
- Mal sahibi paneli, kiracı paneli, mobil (saha), WhatsApp/e-posta, banka eşleştirme, OCR/AI.
- Y-93: paket OKU-BENI'ye "Türkçe karakterli klasöre açmayın" uyarısı.

## Sıradaki adım (tek cümle)
H-1…H-6 (yanlış ekran metinleri ve sayaçlar) düzeltilip ekrandan doğrulanacak.

## Sorular (kullanıcıdan bekleyen)
- Aysan kirayı mal sahibine mi yatırıyor, ofis hesabından mı geçiyor? (para akışı modeli)
- Program yalnız Aysan'ın ofisi için mi, başka ofislere satılacak mı? (RLS/SaaS kararı)

## Kararlar
K-82 paket ASCII klasörde · K-83 denetim önce listelenir, onarım sonraki oturumda · K-70…K-81 yürürlükte.

## Test durumu
typecheck 0 · `pnpm test` 17 dosya / 64 test 0 · web build 0 · paket /health 200.
