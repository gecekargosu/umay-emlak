/**
 * Taşınabilir Windows paketi üretir — TUR:34 / Y-89.
 *
 * Çıktı: release/umay-emlak/  (node.exe + app + veri klasörü iskeleti)
 * Zip:   C:\Users\isitm\Desktop\Aysana gönderilecek\UmayEmlak-Beta-<tarih>.zip
 */
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const staging = join(root, "release", "umay-emlak");
const appDir = join(staging, "app");
const esbuild = join(root, ".freebuff", "pack-tools", "node_modules", ".bin", "esbuild");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  // Windows'ta pnpm/npm .cmd uzantılıdır; kabuk üzerinden çağrılmalı.
  const line = [command, ...args]
    .map((part) => (part.includes(" ") ? `"${part}"` : part))
    .join(" ");
  console.log(`\n> ${line}`);
  execSync(line, { stdio: "inherit", cwd: root, ...options });
}

// 1) Temiz sayfa
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(appDir, "public"), { recursive: true });
mkdirSync(join(appDir, "migrations"), { recursive: true });
mkdirSync(join(staging, "node"), { recursive: true });

// 2) Arayüz derlemesi
run("pnpm", ["--filter", "@umay/web", "build"]);
cpSync(join(root, "apps", "web", "dist"), join(appDir, "public"), { recursive: true });
cpSync(join(root, "packages", "db", "migrations"), join(appDir, "migrations"), {
  recursive: true,
});

// 3) Sunucu + tohum paketleri (pg / embedded-postgres / exceljs dışarıda kalır)
const externals = [
  "--external:pg",
  "--external:embedded-postgres",
  "--external:exceljs",
];
run(esbuild, [
  "apps/api/src/pack-server.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--outfile=" + join(appDir, "server.mjs"),
  ...externals,
]);
run(esbuild, [
  "apps/api/src/app.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--outfile=" + join(appDir, "api.mjs"),
  ...externals,
]);
run(esbuild, [
  "pack/seed.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--outfile=" + join(appDir, "seed.mjs"),
  ...externals,
]);
run(esbuild, [
  "pack/demo.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--outfile=" + join(appDir, "demo.mjs"),
  ...externals,
]);

// 4) Çalışma zamanı modülleri (yerel npm ile, proje bağımlılıklarına dokunmadan)
writeFileSync(
  join(appDir, "package.json"),
  JSON.stringify(
    {
      name: "umay-emlak-app",
      private: true,
      type: "module",
      dependencies: {
        pg: "^8.16.0",
        "embedded-postgres": "^18.6.0-beta.19",
        "@embedded-postgres/windows-x64": "^18.6.0-beta.19",
        exceljs: "^4.4.0",
      },
    },
    null,
    2,
  ),
);
run(npm, ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: appDir });

// 5) Node çalışma zamanı ve başlatıcılar
cpSync("C:/Program Files/nodejs/node.exe", join(staging, "node", "node.exe"));

writeFileSync(
  join(staging, "UMAY-EMLAK-BASLAT.bat"),
  `@echo off\r
chcp 65001 >nul\r
title UMAY EMLAK — Trademark Gayrimenkul\r
cd /d "%~dp0"\r
if not exist "veri" mkdir "veri"\r
echo UMAY EMLAK baslatiliyor... Ilk acilista 1-3 dakika surebilir.\r
echo Bu pencereyi KAPATMAYIN; program kapaninca kapatabilirsiniz.\r
node\\node.exe app\\server.mjs\r
echo.\r
echo Program kapandi. Kapatmak icin bir tusa basin.\r
pause >nul\r
`,
);

writeFileSync(
  join(staging, "OKU-BENI.txt"),
  `UMAY EMLAK — Trademark Gayrimenkul (inceleme sürümü v3 · 5 Kasım 2026)
=====================================================================

Nasıl açılır?
1) Klasörü masaüstüne çıkarın (zip içinden çıkarmadan çalışmaz).
   ÖNEMLİ — KLASÖR YOLUNDA TÜRKÇE KARAKTER OLMAYACAK:
   Türkçe harf (ı, ş, ğ, ü, ö, ç) içeren bir klasöre çıkarırsanız veritabanı
   açılmaz. Örnek doğru yol:  C:\Aysana-gonderilecek\UmayEmlak
   Örnek yanlış yol:        C:\Users\Aysan\Masaüstü\Gönderilenler
   (Türkçe yolda açılırsa program veriyi %LOCALAPPDATA%\UmayEmlak altına
   taşır; yine de ASCII klasör en güvenlisi.)
2) "UMAY-EMLAK-BASLAT.bat" dosyasına çift tıklayın.
3) Siyah pencere açılır ve tarayıcı kendiliğinden açılır:
   http://localhost:3100
4) Giriş:  aysan.kilic@umay-emlak.local
   Şifre:  Umay!2026

Bu sürümde yeni (v2 → v3)
- Portföy raflarında harf yerine MÜLK FOTOĞRAFI; mülk dosyasında fotoğraf galerisi.
- Belgeler dolu: tapu, yetki belgesi, kimlik ve kira sözleşmesi örnek olarak üretildi;
  kişi kartında "Belgeler" bölümü var, tıklayıp PDF'i açabilirsiniz.
- "Kim ne yaptı" işlem kaydı: her yazma işlemi ofis/kullanıcı/kayıt bilgisiyle saklanıyor.
- Belgeler ekranında arama öne alındı (yazarken süzülür), yükleme formu katlanır panelde.
- Uzun portföy listesi parça parça açılıyor ("Sonraki 60"), 500+ kayıtta donmuyor.
- Hata mesajlarında kayıt numarası (ör. K-2J5R5T) — bize yazarken bu numarayı söyleyin.
- Görevler ekranı, kira satırı etiketleri ve güncel yol haritası.

Not: Fotoğraflar örnek (stok) görsellerdir; kendi çekimlerinizi mülk dosyasından
"Fotoğraflar ve videolar" bölümüne yükleyince onların yerini alır. Belgelerin altında
"örnek belge" satırı vardır; resmî işlemde kullanılmaz.

Önemli notlar
- Siyah pencere açık kaldığı sürece program çalışır; kapatırsanız program kapanır.
- Bütün veriler "veri" klasöründe tutulur. Bu klasörü silmediğiniz sürece
  kayıtlarınız durur; başka bilgisayara taşırken klasörle birlikte taşıyın.
- İlk açılış 1-3 dakika sürebilir (veritabanı hazırlanır, demo veri yüklenir).
- Demo veriler "DEMO" ile başlar; silmek için: veri klasörünü silip programı
  yeniden açmak yeterli (program yeniden demo kurar).
- Bu bir inceleme sürümüdür: gerçek müşteri bilgisi girmeyin, önce eksikleri
  bize yazın.
- Virüs uyarısı çıkarsa "Daha fazla bilgi → Yine de çalıştır" deyin; dosyalar
  imzasızdır çünkü paket henüz kod imzalama sertifikasıyla imzalanmadı.

Bilinen eksikler
- E-posta/SMS hatırlatma yok (uyarılar ekranda).
- Mal sahibi ve kiracı için ayrı giriş paneli henüz yok.
- Fotoğraf filigranı yok; kişi (vesikalık) fotoğrafı alanı yok.
- Teslim tutanağı belgesi (fotoğraf + imza) henüz üretilmiyor.
- Denetim kaydının ekranı yok (kayıtlar tutuluyor, ekranda listelenmiyor).
`,
);

console.log("\nPaket hazır:", staging);
const sizes = execSync(
  `powershell -NoProfile -Command "'{0:N1} MB' -f ((Get-ChildItem -Recurse '${staging}' | Measure-Object Length -Sum).Sum/1MB)"`,
  { encoding: "utf8" },
).trim();
console.log("Boyut:", sizes);
