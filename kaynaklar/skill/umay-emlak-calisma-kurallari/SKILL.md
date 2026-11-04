---
name: umay-emlak-calisma-kurallari
description: UMAY EMLAK projesinde hızlı, az token harcayan ve eksiksiz çalışma kuralları; komutlar, dosya düzeni, "bitti" tanımı, kayıt zorunlulukları ve bilinen tuzaklar. Bu projede kod yazarken, düzeltirken veya denetlerken kullan.
---

# UMAY EMLAK — çalışma kuralları (skill)

Bu skill, UMAY EMLAK projesinde çalışan ajan içindir. Amaç: az token, az tur, eksiksiz iş.
Proje kökü: `C:\Users\isitm\Desktop\UMAY EMLAK`. Arayüz dili Türkçe, ton samimi ("kanka").

## 1. Oturum başlangıcı (sadece bunlar okunur)
1. `PROJECT-STATUS.md` — nerede kaldık, sıradaki tek adım.
2. `03-LOG.txt` son 60 satır — son turda ne oldu.
3. `10-DENETIM-ISTEK-LISTESI-*.txt` — açık bulgular (H-…) ve istek listesi.
Kök metin `umay emlak program detayları benim yazdığım.txt` (5410 satır) **okunmaz**;
gerekirse `code_search` ile hedeflenir. Tüm projeyi yeniden okuma.

## 2. Komutlar (ezber; yeni komut uydurma)
- API: `pnpm --filter @umay/api dev` → 3100, sağlık: `http://localhost:3100/health`
- Arayüz: `pnpm --filter @umay/web exec vite --port 5175 --strictPort` → 5175
  (5173 başka projede dolu; 5174 vite config yüzünden yok sayılıyor)
- Tip: `pnpm -r typecheck` · Test: `pnpm test` · Derleme: `pnpm --filter @umay/web build`
- DB: `docker exec umay-pg psql -U postgres -d umay_dev` · Migration: `pnpm db:migrate`
- Paket: `node pack/build.mjs` → `release/umay-emlak`

## 3. Değişmez kurallar
1. Para **kuruş tam sayı**; biçimlendirme tek yerde. Tarih `DATE`, an `timestamptz`.
2. Kayıt **silinmez**: durum ilerler, ters kayıt, soft delete. Finans/belge geçmişi korunur.
3. Her sorgu ofis (tenant) kimliğiyle; yazma uçlarında `requireWrite`; başka ofisin kaydı 404.
4. Her detay **yeni sayfada** açılır, geri düğmesi olur; sayfa altı panel yok.
5. Satılıklar/Kiralıklar yalnız **raf ekranı**; düzenleme mülk dosyasında.
6. Aynı bilgi iki yerde farklı cevap vermez: tek kaynak (ör. mal sahibi → mülk kartı ile aynı yer).

## 4. Token disiplini
- Tüm okumaları **tek** `read_files` çağrısında, tüm kontrolleri **tek** komutta yap
  (`; echo EXIT=$?` ile çıkış kodlarını yazdır).
- 400 satırı geçen dosya bölünür; yeni sayfa eklerken mevcut bileşeni kopyalama, ortak bileşen çıkar.
- Uzun çıktı sohbete değil **dosyaya** yazılır; sohbette özet verilir.
- "Hem şunu hem bunu" yerine tek hedef; yarım kalan iş en pahalı iştir.

## 5. "Bitti" tanımı
typecheck 0 · ilgili testler yeşil · **ekranda gerçekten tıklandı** (preview) · boş/hata durumu görüldü ·
`03-LOG.txt` TUR kaydı + `04-KARARLAR.txt` (K-no) + `06` (satır silinmeden "YAPILDI") yazıldı ·
commit + push (private repo, noreply adres) · `kaynaklar/yedek/*.zip`.

## 6. Bilinen tuzaklar
- `/health` var, `/api/v1/health` yok.
- Paket Türkçe karakterli klasörde açılmaz: ASCII klasör kullan (`Aysana-gonderilecek`).
- Vite `localhost` (IPv6) dinliyor; `127.0.0.1` yerine `localhost` ile test et.
- `node --watch` dosya değişince API'yi 1-2 sn yeniden başlatır; o anda 500 görülebilir.
- CSS `text-transform: uppercase` bazı başlıkları "ARIZA" yapar; metin arayan testlerde
  büyük/küçük harf duyarsız ara.

## 7. Yapılmayacaklar
- FastAPI / React Native / Docker / Redis / mikroservis ekleme (K-70…K-84).
- Kartla kiraya ek ücret (%10) — 5464 md.17.
- Kira artış oranını koda sabitlemek (oran veridir: kaynak + tarih + onay).
- Demo veriyi gerçek veri gibi göstermek, sahte grafik çizmek.

## 8. Mission yazma kalıbı
```
Görev: <tek cümle, tek hedef>
Bitiş: typecheck 0, pnpm test yeşil, <davranış> preview'da tıklandı, 03-LOG TUR yazıldı, commit + push.
Yapılmayacak: yeni özellik, dosya bölme, tasarım değişikliği (bu mission'da).
```
Mission küçük tutulur (yarım gün). Bitince yeni mission; kapsam büyütülmez.
