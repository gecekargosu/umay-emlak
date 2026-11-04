# PROJECT-STATUS

Son güncelleme: 2026-11-05 06:00 · Aktif tur: TUR:55 bitti — kiracı talep bağlantısı (girişsiz arıza bildirimi)

## Şu an çalışan (doğrulandı)
- Giriş/oturum, boşta kilit, şifre değiştirme; ofis/personel/onay yetkisi.
- Mal sahipleri alfabetik raflar + kişi dosyası; mülk + ilan ayrımı; raf ve liste görünümü.
- Belge arşivi (sha256 tek kopya, ada göre eşleştirme), fiyat geçmişi, teklif/kapora/komisyon.
- Demo veri dolu: 90 mülk fotoğrafı, 270 belge (tapu/yetki/kimlik/sözleşme), kişi kartında belge listesi (TUR:48).
- Sözleşme + kiracılık + teslim tutanağı + depozito; kira tahakkuku/tahsilat/gecikme.
- DASK/poliçe + 30 gün uyarısı; kira artışı (oran + kaynak + onay); randevu + takvim.
- Portföy önerisi; arıza/bakım talebi (fotoğraf, durum, masraf); Excel/CSV içe aktarma.
- Kiracı talep bağlantısı (TUR:55): kiralık dosyada üret/iptal, `/talep/<jeton>` girişsiz form,
  bildirim arıza listesine düşer; jeton DB'de yalnız sha256 özetiyle, süre + iptal kontrolü.
- Taşınabilir Windows paketi: `Desktop/Aysana-gonderilecek/UmayEmlak-Beta-2026-11-04/` + zip (288 MB).
  Doğrulama: `/health {"ok":true,"migrations":15}`, giriş 200, HTML 200, ilk açılış 14 sn.

## Açık işler (ayrıntı: 10-DENETIM-ISTEK-LISTESI-2026-11-04.txt)
- H-1…H-6 **YAPILDI** (TUR:38, commit 8c3ff2d; TUR:39 yeniden doğrulandı).
- H-7…H-15 ekran/metin/akış bulguları (aşağıdaki mission kuyruğunda sıraya kondu).
- K-1…K-10 kod bulguları (dosya bölme, 11 sessiz catch, audit_log yok, domain birim testi yok).
- SIRA 8 otomasyon (yükümlülük motoru + e-posta), SIRA 9 ekstre/gider, SIRA 11 kapak fotoğrafı.
- Mal sahibi paneli, kiracı paneli, mobil (saha), WhatsApp/e-posta, banka eşleştirme, OCR/AI.
- Y-93: paket OKU-BENI'ye "Türkçe karakterli klasöre açmayın" uyarısı.
- Yol haritası ekranı tur sonunda tazelenir (TUR:47): kapananlar ayrı bölümde, açık maddeler otomatik 1..N numaralı.

## Mission kuyruğu (plan — her satır bir mission)
M1 · **H-13 + H-14** → YAPILDI (2026-11-04, TUR:42) — sözleşmeler listeyle açılsın, poliçe mülk seçicisine arama gelsin.
     Bitiş: typecheck 0, test yeşil, iki akış preview'da tıklandı, TUR + commit + push.
M2 · **H-7 + H-8** → YAPILDI (2026-11-04, TUR:44) — ana sayfadaki Görevler/Mesajlar kutuları tıklanabilsin; kira takibi satırı
     "geciken tahakkuk / beklenen / ödenen" olarak ayrışsın. Bitiş: aynı ölçüt.
M3 · **K-4 + K-9** → YAPILDI (2026-11-04, TUR:45) — 11 sessiz catch kullanıcıya sade Türkçe mesaj + kayıt numarası versin;
     teknik ayrıntı log'a. Bitiş: hata üreten akış ekranda görülür, test yeşil.
M4 · **K-6 audit_log** → YAPILDI (2026-11-04, TUR:46) — "kim ne yaptı" kaydı (tablo + yazma uçları + JSON log + request_id).
     Bitiş: bir işlem yapılıp kaydı DB'den okunur.
M5 · **H-15 + K-10** → YAPILDI (2026-11-04, TUR:47) — belgeler ekranında liste/arama önce gelsin; portföy listesi sanal liste.
     Bitiş: 91 kartta kaydırma akıcı, belge listesi ilk bakışta görünür.
M6 · **K-1 / K-2 / K-3** → YAPILDI (2026-11-05, TUR:49-50) — Listings.tsx 914, api.ts 725, documents.ts 716 satır bölünür.
     Bitiş: davranış aynı, typecheck + test yeşil, ekran kontrolü.
M7 · **Y-93 + H-11** — paket OKU-BENI uyarısı ve sürüm notu; paket ASCII klasörde açılır.
     Bitiş: zip yeniden üretilip /health 200.
M8 · **Yol haritası 1** → YAPILDI (2026-11-05, TUR:55) — kiracı kendi arıza/talebini tek kullanımlık
     bağlantıyla açsın. Bitiş: girişsiz bildirim arıza listesine düşer, iptal edilen jeton 404.

Kural: aynı anda tek mission; kapsam büyütülmez, bitmeyen mission yeni mission açmaz.

## Sıradaki adım (tek cümle)
M8: YAPILDI (TUR:55). Sırada: yol haritası ekranındaki en üst açık madde.

## Sorular (kullanıcıdan bekleyen)
- Aysan kirayı mal sahibine mi yatırıyor, ofis hesabından mı geçiyor? (para akışı modeli)
- Program yalnız Aysan'ın ofisi için mi, başka ofislere satılacak mı? (RLS/SaaS kararı)

## Kararlar
K-82 paket ASCII klasörde · K-83 denetim önce listelenir · K-84 mal sahibi tek kaynak ·
K-85 onarım sırası: kullanılabilirlik (M1-M2) → güven/iz (M3-M4) → liste/performans (M5) →
dosya bölme en son (M6) · K-70…K-81 yürürlükte.

## Test durumu
typecheck 0 · `pnpm test` 19 dosya / 67 test 0 · web build 0 · paket /health 200 (17 migration).
