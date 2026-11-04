/**
 * DEMO GÖRSEL VE BELGE ÜRETİCİSİ — yalnız geliştirme (pnpm demo:seed).
 *
 * Amaç (TUR:48, kullanıcı isteği): demo portföy raflarda harf (DD/DA) değil
 * mülkün fotoğrafını göstersin; belgeler boş yer tutucu değil, dolu tapu /
 * kimlik / sözleşme / yetki belgesi gibi görünsün.
 *
 * Fotoğraf: internet varsa gerçek fotoğraf indirilir (picsum.photos — Unsplash
 * lisanslı, ücretsiz). İnternet yoksa aynı kare için üretilmiş mimari illüstrasyon
 * (SVG) kullanılır; böylece paket çevrimdışı kurulumda da boş kutu göstermez.
 *
 * Belge: bağımlılık eklemeden, elle yazılmış minimal PDF (Helvetica + WinAnsi).
 * Türkçede WinAnsi'de olmayan 4 harf (ğ ı İ ş) sadeleştirilir; belge okunur kalır.
 *
 * ÖNEMLİ: üretilen belgelerin altında "Örnek belge · resmî işlemlerde kullanılamaz"
 * satırı vardır. Demo veri gerçek belge gibi sunulmaz (AGENTS.md kuralı).
 */

export type DemoAsset = { bytes: Buffer; mimeType: string; ext: string };

/** WinAnsi'de bulunmayan harfleri sadeleştirir (ç ö ü Ç Ö Ü korunur). */
function tr(input: string): string {
  return input
    .replaceAll("ğ", "g")
    .replaceAll("Ğ", "G")
    .replaceAll("ı", "i")
    .replaceAll("İ", "I")
    .replaceAll("ş", "s")
    .replaceAll("Ş", "S");
}

function esc(input: string): string {
  return tr(input).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number };

/**
 * Tek sayfalık PDF. `lines` sırayla alt alta yazılır; 60 punto sol kenar.
 * Elle yazıldı: yeni paket yok, çıktı her ortamda aynı.
 */
export function buildPdf(heading: string, lines: PdfLine[]): Buffer {
  const ops: string[] = [];
  // Üst şerit + başlık
  ops.push("0.9 w 0.35 0.35 0.35 RG 60 806 m 535 806 l S");
  ops.push("BT /F2 16 Tf 60 776 Td (" + esc(heading) + ") Tj ET");
  let y = 742;
  for (const line of lines) {
    const size = line.size ?? 11;
    const font = line.bold ? "F2" : "F1";
    if (y < 90) break; // tek sayfa; taşan satır yazılmaz
    ops.push(`BT /${font} ${size} Tf 60 ${y} Td (${esc(line.text)}) Tj ET`);
    y -= line.gap ?? size + 8;
  }
  // Alt çizgi + not
  ops.push("0.9 w 0.55 0.55 0.55 RG 60 70 m 535 70 l S");
  ops.push(
    "BT /F1 8 Tf 60 56 Td (Ornek belge - resmi islemlerde kullanilamaz. TRADEMARK GAYRIMENKUL demo verisi.) Tj ET",
  );

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const PDF: DemoAsset = { bytes: Buffer.alloc(0), mimeType: "application/pdf", ext: "pdf" };

function pdfAsset(heading: string, lines: PdfLine[]): DemoAsset {
  return { ...PDF, bytes: buildPdf(heading, lines) };
}

/** Deterministik "gerçek" fotoğraf adresi. İnternet yoksa null döner. */
export async function fetchPhoto(seed: string): Promise<DemoAsset | null> {
  try {
    const response = await fetch(`https://picsum.photos/seed/${encodeURIComponent(seed)}/900/600`, {
      signal: AbortSignal.timeout(3500),
      redirect: "follow",
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 2000) return null;
    const ext = type.includes("png") ? "png" : "jpg";
    return { bytes, mimeType: ext === "png" ? "image/png" : "image/jpeg", ext };
  } catch {
    return null;
  }
}

/**
 * Çevrimdışı yedek: mülk türüne göre mimari illüstrasyon (SVG).
 * Fotoğraf değil ama boş kutu değil — raf yine dolu görünür.
 */
export function fallbackScene(index: number, type = "apartment"): DemoAsset {
  const skies = [
    ["#8fc7ff", "#e8f4ff"],
    ["#ffb877", "#ffe6c7"],
    ["#4a6fa5", "#b9d0ea"],
    ["#f2c9a0", "#fdf1e3"],
  ];
  const [top, bottom] = skies[index % skies.length]!;
  const sea = type === "land" || index % 5 === 0;
  const buildings = 3 + (index % 3);
  let shapes = "";
  for (let i = 0; i < buildings; i++) {
    const width = 90 + ((index * 17 + i * 31) % 70);
    const height = 120 + ((index * 29 + i * 53) % 150);
    const x = 60 + i * 150 + ((index * 11) % 24);
    const y = 430 - height;
    shapes += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#2b3b57" rx="4"/>`;
    for (let row = 0; row < Math.floor(height / 34); row++) {
      for (let col = 0; col < Math.floor(width / 30); col++) {
        const lit = (row + col + i + index) % 3 !== 0;
        shapes += `<rect x="${x + 10 + col * 28}" y="${y + 14 + row * 32}" width="16" height="18" fill="${lit ? "#ffd9a0" : "#1d2942"}"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#sky)"/>
<circle cx="${120 + (index % 5) * 40}" cy="110" r="42" fill="#fff6d6" opacity="0.85"/>
<path d="M0 430 L180 330 L360 410 L540 320 L720 400 L900 340 L900 600 L0 600 Z" fill="#3d5471" opacity="0.55"/>
${sea ? '<rect x="0" y="455" width="900" height="145" fill="#2b6f96" opacity="0.75"/>' : ""}
${shapes}
<rect x="0" y="520" width="900" height="80" fill="#22314a"/>
<rect x="0" y="520" width="900" height="6" fill="#4a5f7f"/>
</svg>`;
  return { bytes: Buffer.from(svg, "utf8"), mimeType: "image/svg+xml", ext: "svg" };
}

/** Tapu kayıt örneği — mülk alanlarıyla dolu. */
export function tapuPdf(input: {
  title: string;
  district: string;
  block: string | null;
  unitNo: string | null;
  grossM2: number | null;
  deedRef: string | null;
  ownerName: string;
  roomCount: string | null;
  typeLabel: string;
}): DemoAsset {
  return pdfAsset("TAPU KAYIT ORNEGI", [
    { text: `Il: Izmir          Ilce: ${input.district}`, bold: true },
    { text: `Mahalle: ${input.district} Mahallesi` },
    { text: `Ada: ${input.deedRef?.replace(/\D/g, "").slice(-4) || "1042"}     Parsel: ${(input.grossM2 ?? 100) + 17}` },
    { text: `Bagsiz bolum: ${input.unitNo ?? "-"}     Blok: ${input.block ?? "-"}` },
    { text: `Niteligi: ${input.typeLabel}${input.roomCount ? ` (${input.roomCount})` : ""}` },
    { text: `Yuzolcumu: ${input.grossM2 ?? 100} m2` },
    { text: "" },
    { text: "MALIK", bold: true, size: 12 },
    { text: input.ownerName, bold: true },
    { text: "Hisse: Tam (1/1)     Edinme: Satis" },
    { text: "" },
    { text: "KAYIT BILGILERI", bold: true, size: 12 },
    { text: `Tapu tarihi: 12.03.2019     Yevmiye no: 2019/${1200 + (input.grossM2 ?? 0)}` },
    { text: `Kayit no: ${input.deedRef ?? "TAPU-0000"}     Durum: Aktif` },
    { text: "" },
    { text: "Tasinmaz uzerinde ipotek, haciz veya intifa hakki bulunmamaktadir." },
    { text: `Belge konusu: ${input.title}` },
  ]);
}

/** Yetki belgesi (taşınmaz ticareti) — ofis + ilan bilgisiyle dolu. */
export function yetkiPdf(input: {
  title: string;
  ownerName: string;
  authorityNo: string | null;
  priceText: string;
  district: string;
}): DemoAsset {
  return pdfAsset("YETKI BELGESI", [
    { text: "TASINMAZ TICARETI YETKI BELGESI", size: 13, bold: true },
    { text: "" },
    { text: "Yetki veren (mal sahibi):", bold: true },
    { text: input.ownerName },
    { text: "" },
    { text: "Yetki verilen isletme:", bold: true },
    { text: "TRADEMARK GAYRIMENKUL" },
    { text: "Tasinmaz Ticareti Yetki Belgesi no: 34/1187" },
    { text: "" },
    { text: "Tasinmaz:", bold: true },
    { text: `${input.title} - ${input.district}/Izmir` },
    { text: `Istenen bedel: ${input.priceText}` },
    { text: `Yetki numarasi: ${input.authorityNo ?? "-"}` },
    { text: "" },
    { text: "Yetki kapsami: Tasinmazin satisi/kiralanmasi icin ilan verilmesi, gosterilmesi" },
    { text: "ve pazarlanmasi. Yetki, mal sahibinin yazili talebiyle her zaman geri alinabilir." },
    { text: "" },
    { text: "Gecerlilik: 31.12.2026" },
    { text: "Duzenleme tarihi: 04.02.2026" },
  ]);
}

/** Kimlik kartı örneği — kişi alanlarıyla dolu (TCKN maskeli). */
export function kimlikPdf(input: {
  fullName: string;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
}): DemoAsset {
  const [first = "", ...rest] = input.fullName.replace(/^DEMO\s+/i, "").split(" ");
  return pdfAsset("KIMLIK KARTI (ON YUZ)", [
    { text: "T.C. KIMLIK KARTI", size: 13, bold: true },
    { text: "" },
    { text: `T.C. Kimlik No: ${input.nationalId ?? "123******45"}`, bold: true, size: 12 },
    { text: `Adi: ${first}` },
    { text: `Soyadi: ${rest.join(" ") || "-"}` },
    { text: "Dogum tarihi: 1988     Cinsiyeti: K/E" },
    { text: "Seri no: A12****     Son gecerlilik: 2031" },
    { text: "" },
    { text: "BABA ADI: Hasan     ANA ADI: Emine" },
    { text: "Verildigi il: Izmir     Medeni hali: Evli" },
    { text: "" },
    { text: "Iletisim (kayitli):", bold: true },
    { text: `Telefon: ${input.phone ?? "-"}` },
    { text: `E-posta: ${input.email ?? "-"}` },
    { text: "" },
    { text: "Bu fotokopi yalniz kira/satis dosyasi icin alinmistir." },
  ]);
}

/** Kira sözleşmesi — taraflar, taşınmaz, kira, depozito dolu. */
export function sozlesmePdf(input: {
  tenantName: string;
  ownerName: string;
  propertyTitle: string;
  address: string | null;
  startDate: string;
  rentText: string;
  depositText: string;
  dueDay: number;
}): DemoAsset {
  return pdfAsset("KIRA SOZLESMESI", [
    { text: "KIRAYA VEREN (Mal sahibi)", bold: true, size: 12 },
    { text: input.ownerName },
    { text: "" },
    { text: "KIRACI", bold: true, size: 12 },
    { text: input.tenantName },
    { text: "" },
    { text: "KIRALANAN TASINMAZ", bold: true, size: 12 },
    { text: input.propertyTitle },
    { text: input.address ?? "-" },
    { text: "" },
    { text: "SARTLAR", bold: true, size: 12 },
    { text: `Baslangic tarihi: ${input.startDate}` },
    { text: `Aylik kira bedeli: ${input.rentText}` },
    { text: `Depozito: ${input.depositText} (2 kira bedeli)` },
    { text: `Odeme gunu: her ayin ${input.dueDay}. gunu` },
    { text: "Kira, banka havalesi veya ofis hesabina nakit olarak odenir." },
    { text: "Kiraci, tasinmazi konut amaciyla kullanir; alt kiraya veremez." },
    { text: "Demirbas ve abonelik listesi sozlesme ekindedir." },
    { text: "" },
    { text: "Taraflar yukaridaki sartlarda anlasmistir." },
    { text: "" },
    { text: "Kiraya veren: ____________________     Kiraci: ____________________" },
  ]);
}
