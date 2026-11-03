# UMAY EMLAK – Mevcut Durum, Hatalar, Eksikler ve Detaylı Düzeltilme / Geliştirme Önerileri

> **Bu belgeyi doğrudan ajana (kodlama ajanına) paylaşabilirsiniz.**
> İçinde dosya yollarına tıklayarak ilgili kaynak koduna hızlıca erişebilirsiniz.

---

## 1️⃣ Proje Özeti (Mevcut Koddan Çıkarımlar)

| Dosya | Açıklama | Durum |
|------|-----------|-------|
| **[App.tsx](file:///c:/Users/isitm/Desktop/UMAY%20EMLAK/apps/web/src/App.tsx)** | Uygulamanın kök komponenti; oturum, menü, sayfa yönlendirme, bildiriler. | Router (`page` state) yok → URL‑tabanlı navigation eksik. |
| **[pages/Listings.tsx](file:///c:/Users/isitm/Desktop/UMAY%20EMLAK/apps/web/src/pages/Listings.tsx)** | Portföy tablo + filtre + detay paneli. | 800 satır → **SRP** ihlali, çok büyük tek dosya. |
| **[components/ListingBoard.tsx](file:///c:/Users/isitm/Desktop/UMAY%20EMLAK/apps/web/src/components/ListingBoard.tsx)** | Tek bir gayrimenkulün ayrıntılı görüntüsü (belgeler, kiracı, ödeme, demirbaş). | State yönetimi dağınık, API‑error‑handling tekrarı. |
| **[components/BackButton.tsx](file:///c:/Users/isitm/Desktop/UMAY%20EMLAK/apps/web/src/components/BackButton.tsx)** | “Geri” düğmesi (paneli kapat veya tarayıcı geri). | `aria‑label` eksik → erişilebilirlik sorunu. |
| **[styles.css]** | Global stil dosyası. | Scoped‑class çakışması, responsive/dark‑mode yok. |
| **[umay emlak program detayları benim yazdığım.txt]** | İş süreci, veri modeli, UI/UX, mimari önerileri, eksiklerin ve risklerin uzun bir değerlendirmesi (≈ 4 k satır). | İçerik çok detaylı, kodda eksik pek çok öneri bulunuyor. |

---

## 2️⃣ Kritik Hatalar ve Nedenleri

| # | Alan | Hata / Eksik | Açıklama (Neden) | Çözüm (Kısa) |
|---|------|--------------|------------------|--------------|
| **1** | **Routing** | Sayfalar `useState<Page>` ile yönetiliyor, URL yok. | SEO ve doğrudan link paylaşımı imkansız. | `react-router-dom` ekle, `BrowserRouter` içinde `<Route path="/listings" element={<Listings />} />` vb. |
| **2** | **State Management** | Aynı API birden çok komponentte ayrı `useState` ile çekiliyor. | Veri yarışları, tutarsız UI. | **React‑Query / TanStack Query** ile veri önbellekleme; tek `isLoading` / `isError` merkezi. |
| **3** | **Bileşen Boyutu** | `Listings.tsx` 800 satır, 10+ sorumluluk. | **SRP** ihlali → bakım ve test zor. |
| **4** | **API Wrapper (`api.ts`)** | Hata yakalama kodu tekrarı (`catch{ setError('…') }`). | Tekrarlı kod, tip‑güvenliği düşük. |
| **5** | **Stil / UI‑UX** | Tek global `styles.css`, sınıf çakışması, responsive ve dark‑mode eksik. |
| **6** | **Erişilebilirlik (a11y)** | `BackButton` sadece görsel “← Geri”, `aria-label` yok; diğer düğmeler `aria‑pressed` eksik. |
| **7** | **Performans** | Tüm gayrimenkuller tek dizi içinde tutuluyor, tablo virtualization yok. |
| **8** | **Veri Senkronizasyonu / Depolama** | Belgeler sadece telefon hafızasında (yerel). |
| **9** | **Güvenlik** | Rol kontrolü sadece *frontend* (`session.role`). |
| **10** | **Ödeme Entegrasyonu** | Tek “fiyat güncelle” butonu; **sanal POS** ve komisyon hesaplama yok. |
| **11** | **Test & CI** | `vitest.config.ts` var ama test yok, CI eksik. |
| **12** | **Bildirim / Otomasyon** | Cron‑tabanlı hatırlatıcılar UI’da sadece “bugün” sayaçları. |
| **13** | **Rol‑tabanlı Paneller** | Tek UI, farklı roller (admin, personel, owner, tenant) için farklı görünüm yok. |
| **14** | **Veritabanı Modeli** | Çok‑çok ilişkiler (ör. `Property`‑`Owner`) tanımlı değil. |
| **15** | **Doküman/Medya Yönetimi** | Dosya yükleme doğrudan `FormData`, metadata ve watermark eksik. |
| **16** | **Kod Kalitesi** | Hard‑coded Türkçe stringler. |
| **17** | **Responsive / Mobil** | UI sadece geniş ekran, mobilde swipe‑raf çalışmayabilir. |

---

## 3️⃣ Eksik Fonksiyonel Özellikler (Metin Dosyasındaki Gereksinimler)

| Modül | Gereksinim | Mevcut Durum | Nasıl Eklenir |
|------|------------|--------------|---------------|
| **Mal Sahibi Paneli** | Portföy, belgeler, ödeme takibi, raporlar. | Sadece `Owners` listesi, detay yok. | `OwnerDetail` bileşeni → `Property` listesi, `documents`, `rentHistory`, `commission`. |
| **Kiracı Paneli** | Sözleşme PDF, ödeme, dekont, arıza talebi. | `People` temel liste, ödeme/arıza yok. | `TenantDashboard` → `LeaseInfo`, `PaymentForm`, `IssueTicket`. |
| **Personel Yönetimi** | Atama, performans, görev listesi. | `Team`/`TeamPortfolio` var, log/atanma yok. | `PersonnelDetail` → `assignedProperties`, `taskLog`, `performanceChart`. |
| **Raf / Kategorileme** | Dinamik raflar (Satılık, Kiralık, Bölgesel, Öne Çıkan). | Sabit raf UI’sı. | **Raf API** (`GET/POST/PATCH /shelves`), drag‑&‑drop (react‑beautiful‑dnd). |
| **Ödeme & Komisyon** | Kira + komisyon, dekont upload, banka havalesi. | Tek `savePrice`/`saveAuthority`. | **Payment Service** (`POST /payments`), UI `PaymentCard` + breakdown, receipt upload. |
| **Bildirim & Hatırlatıcı** | Kira 4 gün önce, DASK yenileme, geciken ödeme vb. | Sadece “bugün” sayacı. |
| **CRM / Potansiyel Alıcı** | Lead yönetimi, iletişim, randevu, teklif geçmişi. | Yok. |
| **Raporlama / Finans** | Gelir‑gider, komisyon raporu, mal sahibi ekstresi. | `ListingMoney` var, rapor yok. |
| **Çoklu Dil / i18n** | UI çevirilebilir olmalı. | Hard‑coded Türkçe. |
| **Offline / Cache** | Offline çalışma, senkronizasyon. | Tarayıcı önbelleği sadece. |
| **Güvenlik** | 2FA, veri şifreleme, rol‑bazlı API. |
| **Dosya Filigran** | Fotoğraflara logo/tarih watermark. | Yok. |
| **Doküman Şablon Otomasyonu** | Sözleşme şablonları otomatik PDF. | Manual upload. |
| **Kullanıcı Onboarding** | İlk kurulumda rol, ofis, ortak, personel ayarları. | Tek `session` login. |

---

## 4️⃣ Mimari ve Teknoloji Önerileri (Yol Haritası)

### 4.1 Genel Mimari
```
UMAY EMLAK (SaaS)
 ├─ Frontend (React + TS)                 ← Yönetim paneli
 ├─ Mobil (React Native + Expo)           ← Saha uygulaması
 ├─ Backend (FastAPI)                     ← Tek API, tek veri kaynağı
 ├─ DB (PostgreSQL)                       ← İlişkisel model, Alembic migration
 ├─ Dosya Depolama (S3 / MinIO)            ← Belgeler, foto/video, watermark
 ├─ İş Zekası / Raporlama (SQL‑based)      ← Finans, KPI, CRM
 ├─ Task Scheduler (APScheduler)          ← Otomatik hatırlatıcılar, cron jobs
 ├─ Auth (JWT + OAuth2) + RBAC middleware  ← Rol‑tabanlı güvenlik
 └─ CI/CD (Docker‑Compose + GitHub Actions) → Test, lint, build, deploy
```

### 4.2 Sprint‑Bazlı Geliştirme Planı (3 ay)
| Sprint | Hedef | Alt‑görevler | Çıktı |
|--------|-------|--------------|-------|
| **1** | Altyapı & Backend | FastAPI boilerplate, `/auth`, `/users`, `/properties`; PostgreSQL + SQLAlchemy modeller (`User`, `Role`, `Property`, `Owner`, `Lease`, `Document`, `Payment`, `Shelf`); Docker‑Compose (db, api, minio); JWT + RBAC. | Çalışır API, Docker dev ort. |
| **2** | React + Vite UI | `react-router-dom`; **React‑Query**; Tailwind + CSS‑Modules; Dashboard. | URL‑tabanlı, hızlı UI. |
| **3** | Modüler Bileşenler | `ListingTable`, `FilterPanel`, `ListingDetail`; `OwnerDetail`, `TenantDashboard`, `PersonnelCard`; tablo virtualizasyon (`react‑window`); erişilebilir butonlar. | SRP‑uyumlu, performans artışı. |
| **4** | Dosya & Medya | MinIO, `/files/upload`, watermark (Pillow), drag‑&‑drop UI, offline cache (service‑worker). | Bulutta güvenli belgeler, offline sync. |
| **5** | Ödeme & Komisyon | Iyzico/PayTR sandbox, payment schema, `PaymentCard`, webhook. | Güvenli tahsilat, komisyon raporu. |
| **6** | Bildirim & Otomasyon | APScheduler joblar (kira, DASK, sözleşme), e‑mail + WebSocket push, Action Center widget. | Zamanında hatırlatmalar. |
| **7** | Rol‑tabanlı Paneller | UI route guard, Backend ACL, ayrı admin/personel/owner/tenant sayfaları. | Güvenli UI. |
| **8** | Test, CI & Deploy | Vitest + RTL; Playwright e2e; GitHub Actions pipeline; staging (Docker‑Compose). | Kalite garantili CI. |
| **9** | Mobil (React Native) | Axios client; kamera + upload (expo‑image‑picker); offline queue (expo‑task‑manager); mobile‑first UI. | Saha ekibi için mobil. |

---

## 5️⃣ Veri Model Önerileri (ER‑Diagram)
```
User (id, name, email, password_hash, role)
Role (id, name)
Owner (id, name, phone, email)
Property (id, address, city, district, type, area_m2, rooms, floor, block, unit_no)
PropertyOwner (property_id, owner_id, share_percent)
Listing (id, property_id, kind [sale|rent], status, price, entered_at, published_at, authority_no)
Lease (id, property_id, tenant_id, start_date, end_date, rent_price, deposit, status)
Tenant (id, name, phone, email)
Document (id, property_id, listing_id?, tenant_id?, type, filename, url, is_important, uploaded_by, uploaded_at)
Payment (id, lease_id, amount, commission, method, status, created_at, receipt_url)
Shelf (id, name, owner_id?, tenant_id?, user_id?, filter_json)
TaskLog (id, property_id, user_id, action, description, timestamp)
```
*Alan‑bazlı ve zaman‑bazlı sorgular desteklenir. Soft‑delete (`is_active`) ve audit (`TaskLog`) uygulanır.*

---

## 6️⃣ UI/UX – Premium Tasarım (Gemini‑stili)
| Bölüm | Tasarım İpucu | Teknoloji |
|------|----------------|-----------|
| Renk Paleti | Lacivert `#0A0E27`, neon turuncu `#FF7F00`, açık mavi `#4ABEFF`, metin beyaz `#F5F5F5`. | Tailwind `bg-[#0A0E27]`, `text-[#FF7F00]`. |
| Typography | Google **Inter** + **Outfit**. | `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Outfit:wght@400;600" rel="stylesheet">`. |
| Glassmorphism Card | `background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);` | CSS‑module |
| Micro‑Animasyon | Hover `translateY(-2px)` + hafif gölge, `transition: all 0.2s`. | `framer‑motion` (`whileHover`). |
| Responsive Grid | `grid-template-columns: repeat(auto-fit, minmax(260px,1fr));` | Tailwind `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. |
| Dark‑Mode | `prefers-color-scheme: dark` otomatik. | Tailwind `dark:` utilities |
| Skeleton Loader | Tablo/Detay yüklenirken placeholder. | `react-loading-skeleton`. |
| Notification Center | Renk kodlu kartlar (kırmızı‑geciken, sarı‑yaklaşan, mavi‑bugün). |
| Drag‑&‑Drop Raf | `react‑beautiful‑dnd` ile raf taşımaları, “important” işaretleme. |
| PDF/Doc Viewer | Umay PDF Reader entegrasyonu: `iframe` + anotasyon toolbar. |

---

## 7️⃣ En Önemli “Kırmızı Bayraklar” (Acil Düzeltmeler)
1. **Router & URL** – acil: `react-router-dom` kur, `App.tsx`’yi `BrowserRouter` içinde sarmala.
2. **RBAC sadece frontend** – yüksek: Backend RBAC middleware, JWT doğrulama.
3. **Yerel dosya depolama** – kritik: Bulut S3/MinIO + metadata DB.
4. **Ödeme/komisyon sabit kod** – yüksek: Sanal POS ve otomatik komisyon tablosu.
5. **Monolitik `Listings`** – yüksek: Bileşenleri böl, `React‑Query` + `useReducer` ile yönet.

---

## 8️⃣ Özet Yol Haritası (Kısa)
1. **Backend** – FastAPI + PostgreSQL + RBAC + S3.
2. **Frontend** – React‑TS + Vite + React‑Router + React‑Query + Tailwind + Framer‑Motion.
3. **Kritik Modüller** – Dashboard, Property CRUD, Owner/Tenant panelleri, Payment, Notification, Shelf‑manager.
4. **Mobil** – React‑Native (Expo) aynı API.
5. **CI/CD** – Docker‑Compose + GitHub Actions (test → lint → build → deploy).
6. **Dokümantasyon** – README, OpenAPI spec, ER‑diagram, UI mockup (Figma veya generated images).

---

## 9️⃣ Sonraki Adım
- Bu raporu **ajana gönder** ve "Bu gereksinim ve hata listesini al, bir sonraki sprint için plan oluştur ve kod üret" talimatını ver.
- **Implementation plan** hazırlarken **router, auth, veri modeli** gibi yüksek öncelikli işleri önce ele al.
- Araştırma konuları: FastAPI‑JWT‑RBAC örnekleri, S3‑MinIO Python SDK, Iyzico sandbox entegrasyonu.

> **Not:** Dosya yolları Windows formatında (`c:/...`). `file:///` linkleriyle doğrudan erişim sağlanabilir.

---

*Bu belge, mevcut kodun kapsamlı analizi, hataları, eksikleri ve uygulanması gereken tam bir yol haritasını içerir. Ajan bu planı izleyerek istediğiniz premium, güvenli ve ölçeklenebilir UMAY EMLAK platformunu oluşturabilir.*
