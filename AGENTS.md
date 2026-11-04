# AGENTS.md — UMAY EMLAK çalışma kuralları (ajan içindir, kısa tutulur)

Bu dosya her oturumda okunur. Uzun açıklama yazmayın; kural ekleyin, eskisini silmeyin.

## Proje
Emlak ofisi yönetim programı. Arayüz: Vite + React + TypeScript (`apps/web`), API: Hono (`apps/api`),
veritabanı: PostgreSQL (`packages/db`, migration'lar `packages/db/migrations`). Marka: TRADEMARK GAYRİMENKUL.
Arayüz dili Türkçe, ton samimi ("kanka" hitabı kullanıcıya).

## Komutlar (ezber; yeni komut uydurma)
- API + arayüz ayrı: `pnpm --filter @umay/api dev` (3100) · `pnpm --filter @umay/web exec vite --port 5175 --strictPort`
  (5173 başka projede dolu, 5174 vite config yüzünden yok sayılıyor)
- Test: `pnpm test` · Tip: `pnpm -r typecheck` · Arayüz derleme: `pnpm --filter @umay/web build`
- Migration: `pnpm db:migrate` · DB: `docker exec umay-pg psql -U postgres -d umay_dev`
- Paket: `node pack/build.mjs` → `release/umay-emlak` (git dışı)

## Değişmez kurallar
1. Para kuruş tam sayı; biçimlendirme tek yerde. Tarih `DATE`, an `timestamptz`.
2. Kayıt silinmez: durum ilerler, ters kayıt, soft delete. Finans/belge geçmişi korunur.
3. Her sorgu ofis (tenant) kimliğiyle; yazma uçlarında `requireWrite`; başka ofisin kaydı 404.
4. Arayüzde her detay yeni sayfada açılır, geri düğmesi olur; sayfa altı panel yok.
5. Satılıklar/Kiralıklar yalnız raf ekranıdır; düzenleme mülk dosyasında.
6. Tur sonunda kayıt: `03-LOG.txt` (tarihli TUR kaydı), `04-KARARLAR.txt` (K-numara),
   `06-YAPILMAYAN...` (satır silinmez, "YAPILDI" eklenir), `09-...` (VAR/KISMI/YOK).
7. Commit + push (private repo, noreply adres) + `kaynaklar/yedek/*.zip`.

## Token disiplini (hız için)
- Oturum başında yalnız: `PROJECT-STATUS.md`, `03-LOG.txt` son 60 satır, `10-DENETIM-ISTEK-LISTESI-*.txt`.
- Kök metin (5410 satır) ajana verilmez; gerekirse `code_search` ile hedeflenir (R-7).
- Aynı turda: tüm okumalar bir `read_files` çağrısında, tüm kontroller tek komutta (`; echo EXIT=$?`).
- 400 satırı geçen dosya bölünür; yeni sayfa eklerken mevcut bileşeni kopyalama, ortak bileşen çıkar.
- Uzun çıktı üretme: rapor dosyaya, sohbette özet.

## "Bitti" tanımı
typecheck 0 · ilgili testler yeşil · ekranda gerçekten tıklandı (preview) · hata/boş durum görüldü ·
kayıt dosyaları yazıldı · commit + push · yedek.

## Bilinen tuzaklar
- `/health` var, `/api/v1/health` yok.
- Paket Türkçe karakterli klasörde açılmaz; ASCII klasör (`Aysana-gonderilecek`) kullanılır.
- `node --watch` dosya değişince API'yi yeniden başlatır; o 1-2 sn'de 500 görülebilir, kalıcı hata değil.
- Vite `localhost` IPv6'ya bağlanıyor; `127.0.0.1` yerine `localhost` ile test et.

## Yapılmayacaklar
- FastAPI / React Native / Docker / Redis / mikroservis ekleme (K-70…K-83 kararları).
- Kartla kiraya ek ücret (%10) — 5464 md.17.
- Kira artış oranını koda sabitlemek (oran veridir: kaynak + tarih + onay).
- Demo veriyi gerçek veri gibi göstermek; sahte grafik.
