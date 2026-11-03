# MülkPro — Ekip Devir ve Geliştirme Planı

> Kaynak: Aysan'ın 2026-11-03'te paylaştığı devir belgesi (sohbetten alınan metin).
> Bu dosya, gelen metnin birebir kopyasıdır; yalnız dosya bağlantıları düz metne çevrildi.
> Orijinal bağlantılar bu bilgisayarda yok (başka bir makinede: `C:/Users/aysan/Documents/Codex/...`).
> Değerlendirme ve bizim projeyle karşılaştırma: `07-MULKPRO-KARSILASTIRMA.txt`.

*MülkPro'yu başka bir yazılım ekibine aktarabilmeniz için yaklaşık 5.500 kelimelik, 15 bölümlü ve 11 tabloluk ayrıntılı bir devir belgesi hazırladım.* Çalışan özellikler, prototipler, tamamlanmamış bağlantılar ve gelecek hedefler belgede ayrı gösteriliyor.

Tarayıcıda okunabilen ve yazdırılabilen paylaşım sürümü: `MulkPro_Ekip_Devir_ve_Gelistirme_Plani.html`
Yazılım ekibinin düzenleyebileceği metin sürümü: `MulkPro_Ekip_Devir_ve_Gelistirme_Plani.md`

## 1. İşin amacı

MülkPro'nun hedefi, gayrimenkul yönetimindeki birbirine bağlı işleri tek veri temeli üzerinde toplamaktır:

*Kişi → Mülk → İlişki → Müşteri takibi → Sözleşme → Belge → Tahsilat → Devam eden yönetim*

Bireysel mülk sahibi kendi taşınmazlarını ve kiracılarını yönetebilmeli; danışman portföyünü ve müşteri görüşmelerini takip edebilmeli; ileride ofis yöneticisi de ekip yetkilerini ve paylaşılan işleri yönetebilmelidir.

Bugün elimizde bunun *tek cihazda, şifreli yerel kasayla çalışan çekirdeği* bulunuyor. Çok kullanıcılı ofis platformu ve harici hizmet bağlantıları sonraki aşamalardır.

## 2. Mevcut durum

Geliştirme çizgimiz şu şekilde ilerledi:

| Aşama | Geldiğimiz nokta |
|---|---|
| İlk uygulama temeli | Flutter uygulaması, veri modelleri ve sözleşme altyapısı |
| Sözleşme geliştirmeleri | Standart sihirbaz, Hızlı Kira Kontratı ve PDF işlemleri |
| TM Gayrimenkul arayüzü | Türkçe marka kimliği, mobil ve masaüstü gezinme |
| Premium tasarım çalışması | Üç tasarım yaklaşımı ve yeni işlem akışlarının prototipleri |
| Yerel CRM | Müşteri adayı, aşama, takip tarihi ve görüşme geçmişi |
| Veri güvenilirliği | Şifreli kayıt, işlem kuyruğu ve sürüm çatışması kontrolleri |
| Son geliştirme paketi | Otomatik kasa kilidi, yeniden açma ve CRM yenileme düzeltmeleri |

Programın hiyerarşik işleyişi ise şöyledir:

| Ana alan | Alt işlevler | Bugünkü durum |
|---|---|---|
| Giriş ve güvenlik | Kasa oluşturma, açma, kilitleme | Çalışıyor |
| Çalışma alanı | Özet, kayıt sayıları, hızlı işlemler | Çalışıyor |
| Kişiler | Gerçek kişi/şirket, iletişim, adres ve hesap alanları | Çalışıyor |
| Mülkler | Adres, kod, bedel, kullanım durumu, abonelik ve demirbaş | Çalışıyor |
| Kişi–mülk ilişkileri | Malik, kiracı, kefil, temsilci, yönetici | Yerel bağlantılar mevcut |
| Sözleşmeler | Kartlardan bilgi seçme, standart ve hızlı hazırlama | Çalışıyor |
| Belgeler | Kira sözleşmesi, ayrı tahliye ve kefaletname taslakları | PDF üretimi mevcut |
| CRM | Aday, ilgili mülk, aşama, takip ve görüşme notları | Çalışıyor |
| Tahsilat | Manuel tam/kısmi ödeme ve özetler | Yerel başlangıç mevcut |
| Takvim | Kira ve yenileme kayıtları, mesaj taslakları | Gönderim yapmıyor |
| Kalıcı taslaklar | Kaydetme ve sürüm kontrolü altyapısı | Ekran bağlantısı eksik |
| Tasarım stüdyosu | Yeni görünümler ve örnek akışlar | Prototip |
| Ofis ve portallar | Ekip, yetkiler, paylaşım ve eşitleme | Planlanıyor |

*En önemli ayrım:* Taslak saklama altyapısının bulunması, otomatik kaydetme ve kaldığı yerden devam etmenin tamamlandığı anlamına gelmiyor. Tasarım stüdyosunda görünen özellikler de gerçek ürün bağlantısı kurulmadan "hazır" sayılmamalı.

## 3. Önerilen teknik çözüm ve ürün işleyişi

Mevcut çalışan yapıyı koruyarak modül modül ilerlemeliyiz. Yeni ekibin uygulamayı baştan yazması için şu an bir gerekçe bulunmuyor.

Üç temel iş akışı var:

- *Portföy ve kiralama:* Kişiyi oluştur → mülkü oluştur → malik/temsilci ilişkisini bağla → sözleşmeyi hazırla → kontrol et → PDF oluştur → kasaya kaydet → tahsilatı takip et.
- *Müşteri takibi:* Kişiyi seç → CRM adayı aç → kiralama/satın alma amacını kaydet → gerekiyorsa mülkle ilişkilendir → görüşmeleri yaz → sonraki takibi belirle → sonucu kaydet.
- *Hızlı belge:* Hızlı Kontrat'ı aç → soruları yanıtla → son kontrolde düzelt → PDF oluştur → paylaş veya yazdır. Açık kasadan başlatılmışsa sözleşmeyi ayrıca kasaya kaydet.

Veri modelinde kritik bir kural var: *Bir müşterinin mülkle ilgilenmesi, o kişiyi malik veya kiracı yapmaz.* Müşteri ilişkisi, mülkiyet ilişkisi ve uygulama erişim yetkisi farklı kavramlar olarak korunmalıdır.

Benzer şekilde, kişi veya mülk kartı sonradan değiştiğinde geçmişte hazırlanmış sözleşmenin içeriği sessizce değişmemelidir.

## 4. Riskler ve açık sınırlar

Devralacak ekibin özellikle bilmesi gerekenler:

- Şifreli yedekleme, geri yükleme ve unutulan parola için kurtarma süreci henüz tamamlanmadı.
- Yerel işlem kuyruğu farklı cihazları veya tarayıcı sekmelerini eşitlemez.
- Kasa oturumu kilitlendiğinde kaydedilmiş kayıtlar korunur; kaydedilmemiş form alanları kapanabilir.
- Kasa dışında açılan bağımsız Hızlı Kontrat, kasa oturumunun otomatik kilidi kapsamında değildir.
- Manuel tahsilat kaydı, bankadan ödeme doğrulaması değildir.
- EİDS numarası girmek, resmî yetki doğrulaması değildir.
- PDF ve barkod üretmek, elektronik imza veya imzalı belge arşivi oluşturmak değildir.
- Kişi kartındaki iletişim tercihi, kapsamlı izin ve ret geçmişinin yerine geçmez.
- Finans kısmı henüz tam muhasebe sistemi değildir; dönem, yıllık peşin ödeme ve para hassasiyeti geliştirmeleri gerekiyor.

Bu sınırlar devir belgesinde açık işlere dönüştürüldü.

## 5. Uygulama aşamaları

Önerdiğim geliştirme sırası şu:

| Sıra | Paket | Beklenen sonuç |
|---|---|---|
| 1 | Mevcut sürümü devralma | Kaynakları ve test sonuçlarını yeni ekip ortamında yeniden doğrulama |
| 2 | Veri güveni ve devamlılık | Şifreli yedek, güvenli geri yükleme ve kalıcı taslak devamı |
| 3 | Kişi ve mülk deneyimi | Daha iyi arama, filtre, mükerrer uyarısı ve anlaşılır formlar |
| 4 | CRM talep yönetimi | Bütçe, bölge ve ihtiyaçlara göre açıklanabilir portföy eşleştirmesi |
| 5 | Belge arşivi | Dosya türleri, sürümler, erişim ve işlem geçmişi |
| 6 | Finans ve operasyon | Ekstre, dönem mutabakatı, gider, bakım, iade ve hassas tutar hesabı |
| 7 | Hesap ve ofis altyapısı | Kullanıcı hesapları, ekip üyeliği ve sunucuda yetki kontrolü |
| 8 | Çoklu cihaz ve portallar | Güvenli eşitleme, malik/kiracı erişimi ve çakışma yönetimi |
| 9 | Harici hizmetler | Onaylanan sağlayıcılarla bildirim, WhatsApp, banka veya imza bağlantıları |
| 10 | Pilot ve yayın | Gerçek cihaz, yazıcı, kullanıcı kabulü ve geri dönüş planı |

*İlk önceliğim yedekleme ve kalıcı taslak devamı.* Uzun sözleşme veya müşteri işlemlerinde kesintiden sonra güvenle devam edebilmek, yeni özelliklerden önce temel güvenilirliği artırır.

Her faz için belgede teslimler, bağımlılıklar ve kabul ölçütleri bulunuyor. Örneğin eşleştirme ekranında eksik bilgi "kesin eşleşme" gösterilmemeli; ofis altyapısında bir ofis başka ofisin kayıtlarına erişememeli.

## 6. Test sonuçları ve teslim

Son geliştirilmiş sürümde:

- *139 otomatik test geçti.*
- *Kod analizi temiz.*
- *Web derlemesi başarılı.*
- Telefon, tablet ve masaüstü genişlikleri ile büyük yazı kontrolleri yapıldı.
- Fiziksel telefon, gerçek yazıcı ve canlı hizmet bağlantıları henüz doğrulanmadı.

Geliştirilmiş kaynaklar ve doğrulama günlükleri ayrı pakette hazır. Mevcut ana çalışma klasörünüz korundu; yeni paket ana dala birleştirilmedi veya canlıya yayımlanmadı.

- Geliştirme paketi ve çalıştırma bilgisi: `MulkPro_Gelistirilmis_Surum/BASLANGIC.md`
- Yerel uygulama önizlemesi: `http://127.0.0.1:57103`

## 7. Kullanıcının onayına sunulan kararlar

Bu devir belgesini hazırlamak için ek onay gerekmiyor. Yeni ekiple başlangıç toplantısında öncelikle şu kararlar netleştirilmeli: ilk hedef kullanıcı, yerel kullanım ile ofis eşitlemesinin sırası, finans kapsamı, belge onay süreci, desteklenecek platformlar ve harici hizmet bütçeleri.

Belge, ekibin bu kararları alıp işi doğrudan görev listesine dönüştürebileceği ayrıntıda hazırlandı.
