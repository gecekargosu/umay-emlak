# TABLET + TELEFON — KURULUM VE KULLANIM (UMAY EMLAK)

Bu klasördeki dosyalar tabletin tarayıcısından indirilebilir.
Tablet ve laptop aynı Wi-Fi'de olmalı.

Açık adres: **http://192.168.1.33:8080**

## 1. Termux kurulumu (tablet)

1. Tablet tarayıcısında `http://192.168.1.33:8080` aç.
2. Önce **fdroid.apk** → indir → kur. ("Bilinmeyen kaynaklara izin ver" sorarsa izin ver.)
3. Sonra **termux-arm64.apk** → indir → kur.
4. Termux'u aç, şu komutları yaz:

```
pkg update -y && pkg upgrade -y
pkg install -y openssh curl git python
termux-setup-storage
```

5. Programı tablette test etmek için (kiosk/pano):

```
pkg install -y x11-repo
```

Termux'un bu laptopta ne işe yarar:
- Tabletten `curl http://192.168.1.33:3100/health` ile API'nin ayakta olup olmadığını görürsün.
- `python -m http.server` ile tabletteki dosyaları laptopa açabilirsin.
- Uzun süre açık kalacak ekran için Termux'u açık bırakıp `termux-wake-lock` yazarsın; ekran uyumaz.

## 2. Tableti ikinci ekran yapmak (spacedesk)

Gecikme fazlaysa sırayla dene:

1. **USB ile bağla (en etkili):** Tablette `Ayarlar → Bağlantı ve paylaşım → USB ile internet paylaşımı` aç.
   Kablo takılıyken spacedesk USB üzerinden bağlanır; gecikme Wi-Fi'ye göre çok düşer.
2. **Çözünürlüğü düşür:** Tablet > spacedesk uygulaması > Settings > Resolution & Quality →
   `1280x800` ve `Frame rate 30` seç. Laptop ekranı 2880x1800 olduğu için yüksek çözünürlük
   kablosuzda gecikmeyi artırıyor.
3. **5 GHz Wi-Fi:** Modemde 2.4 GHz ve 5 GHz ayrıysa tableti 5 GHz'e bağla.
4. **TV'yi tablete koymak:** Windows'ta `Win + P` → **Genişlet**. Sonra TV/film penceresini
   tablet ekranına sürükle. Ekran 2'de ne varsa tablette o görünür; laptop ekranı ayrı kalır.
5. Tablette ne görmek istiyorsan o pencereyi 2. ekrana taşı; tarayıcıda tam ekran için `F11`.

Olmazsa: spacedesk sürücüsünü kaldırıp yeniden kur (Denetim Masası → Programlar → spacedesk Driver).

## 3. iPhone (kablo ile)

Bilgisayarda **Apple Devices** uygulaması kurulu (mağazadan indi).

1. Başlat menüsüne `Apple Devices` yaz, uygulamayı aç. Telefonu USB ile bağla.
2. Telefonda çıkan **"Bu bilgisayara güven"** uyarısına **Güven** de, telefon şifresini gir.
3. `Apple Devices` penceresinde telefonun adı solda görünür (ör. "iPhone"). Görünmüyorsa
   kabloyu çıkar-tak, farklı USB portu dene (hub yerine doğrudan laptop portu).
4. Dosya Gezgini → **Bu Bilgisayar** → `Apple iPhone` satırı da görünür (fotoğraf/video için).
5. Ayarlar'da arama yapmana gerek yok: bu iş **Ayarlar**'da değil, **Apple Devices** uygulamasında.

iPhone'un laptopta işe yaradığı yerler:
- **Kişisel Erişim Noktası** (Ayarlar → Kişisel Erişim Noktası): internet yedeği.
- **2FA**: GitHub/Google giriş kodları telefona gelir (paket yüklerken, hesap kurarken).
- **Mobil test**: Safari'de `http://192.168.1.33:5175` → programın telefondaki görünümü.
- **Ekran kaydı/fotoğraf**: sahadaki mülk fotoğraflarını doğrudan programa yükleme.

## 4. Program adresleri

| Ne | Adres |
| --- | --- |
| Program (tablet/telefon) | http://192.168.1.33:5175 |
| API sağlık | http://192.168.1.33:3100/health |
| Bu klasör (APK indirme) | http://192.168.1.33:8080 |

Giriş: `aysan.kilic@umay-emlak.local` / `Umay!2026`
