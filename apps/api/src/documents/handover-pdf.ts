/**
 * Teslim tutanağı PDF üreticisi — TUR:52 (yol haritası 1. madde).
 *
 * Kayıtlı tutanaktan (handover_protocol) tek sayfalık, yazdırılabilir belge üretir:
 * taşınmaz, taraflar, sözleşme bilgisi, demirbaş satırları, depozito hesabı,
 * mülk fotoğrafları ve imza alanları.
 *
 * Fotoğraf: yalnız JPEG gömülebilir (DCTDecode). PNG/SVG sessizce atlanır —
 * belge yine üretilir, fotoğraf satırı kaç fotoğrafın basıldığını söyler.
 *
 * Türkçe: PDF'in yerleşik Helvetica fontu WinAnsi kodlaması kullanır; ğ, ı, İ, ş
 * bu kodlamada yok. Bu dört harf sadeleştirilir (demo belgelerdeki gibi) ki
 * metin bozulmasın. Yeni font dosyası pakete eklenmez.
 *
 * İmza: tutanakta imza ALANI vardır; sistem kimse adına imza üretmez.
 */

export type HandoverPdfInput = {
  handoverId: string;
  kind: "move_in" | "move_out";
  happenedOn: string;
  propertyTitle: string;
  address: string | null;
  district: string | null;
  city: string | null;
  ownerName: string;
  tenantName: string;
  tenantPhone: string | null;
  contractStart: string;
  contractEnd: string | null;
  rentText: string;
  depositText: string;
  dueDay: number | null;
  items: Array<{ name: string; quantity: number; condition?: string }>;
  deductionText: string;
  deductionNote: string | null;
  refundText: string;
  photos: Array<{ bytes: Buffer; caption: string | null }>;
  createdBy: string;
  createdAtText: string;
};

/** WinAnsi'de olmayan dört harfi sadeleştirir (ç ö ü Ç Ö Ü korunur). */
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
  return tr(input)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** JPEG boyutu (SOF0/SOF1/SOF2) — gömme için gerekli. JPEG değilse null. */
export function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

type Line = { text: string; size?: number; bold?: boolean; gap?: number };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = PAGE_WIDTH - 48;

export function buildHandoverPdf(input: HandoverPdfInput): Buffer {
  const ops: string[] = [];
  const text = (value: string, x: number, y: number, size: number, bold = false) => {
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
  };
  const rule = (y: number, shade = "0.6") => {
    ops.push(`0.7 w ${shade} ${shade} ${shade} RG ${LEFT} ${y} m ${RIGHT} ${y} l S`);
  };
  const wrap = (value: string, maxChars: number): string[] => {
    const words = tr(value).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  };

  const kindLabel = input.kind === "move_in" ? "GIRIS TESLIM TUTANAGI" : "CIKIS TESLIM TUTANAGI";

  // Üst şerit
  ops.push(`0.35 0.35 0.35 RG 0.9 w ${LEFT} 806 m ${RIGHT} 806 l S`);
  text("TRADEMARK GAYRIMENKUL", LEFT, 816, 12, true);
  text(`Tutanak no: ${input.handoverId.slice(0, 8).toUpperCase()}`, RIGHT - 150, 816, 9);
  text(kindLabel, LEFT, 776, 18, true);
  text(`Tutanak tarihi: ${input.happenedOn}`, LEFT, 756, 10);

  let y = 726;
  const section = (title: string) => {
    text(title, LEFT, y, 10, true);
    y -= 15;
  };
  const line = (value: string, gap = 13) => {
    if (y < 210) return;
    text(value, LEFT, y, 9);
    y -= gap;
  };

  section("TASINMAZ");
  line(`${input.propertyTitle}`);
  const place = [input.district, input.city].filter(Boolean).join(" / ");
  if (place) line(place);
  if (input.address) for (const part of wrap(input.address, 95).slice(0, 2)) line(part);

  y -= 6;
  section("TARAFLAR");
  line(`Mal sahibi: ${input.ownerName}`);
  line(`Kiraci: ${input.tenantName}${input.tenantPhone ? ` · ${input.tenantPhone}` : ""}`);
  line(`Ofis yetkilisi: ${input.createdBy}`);

  y -= 6;
  section("SOZLESME");
  line(
    `Baslangic: ${input.contractStart}${input.contractEnd ? ` · Bitis: ${input.contractEnd}` : ""}`,
  );
  line(
    `Aylik kira: ${input.rentText} · Depozito: ${input.depositText}${input.dueDay ? ` · Odeme gunu: ${input.dueDay}` : ""}`,
  );

  y -= 6;
  section("DEMIRBAS VE DURUM");
  if (input.items.length === 0) {
    line("Demirbas satiri girilmemis.");
  } else {
    for (const item of input.items.slice(0, 14)) {
      line(
        `${item.name} · adet ${item.quantity}${item.condition ? ` · ${item.condition}` : ""}`,
      );
    }
    if (input.items.length > 14) line(`... ve ${input.items.length - 14} satir daha (ekranda)`);
  }

  if (input.kind === "move_out") {
    y -= 6;
    section("DEPOZITO HESABI");
    line(`Depozito: ${input.depositText}`);
    line(`Kesinti: ${input.deductionText}${input.deductionNote ? ` (${input.deductionNote})` : ""}`);
    line(`Kiracıya iade: ${input.refundText}`, 0);
  }

  // İmza alanları — sayfanın altında sabit
  const signY = 96;
  rule(150, "0.4");
  text("Teslim eden", LEFT, 132, 9, true);
  text("Teslim alan (kiraci)", LEFT + 175, 132, 9, true);
  text("Ofis yetkilisi", LEFT + 350, 132, 9, true);
  ops.push(`0.4 0.4 0.4 RG 0.7 w ${LEFT} ${signY} m ${LEFT + 140} ${signY} l S`);
  ops.push(`0.4 0.4 0.4 RG 0.7 w ${LEFT + 175} ${signY} m ${LEFT + 315} ${signY} l S`);
  ops.push(`0.4 0.4 0.4 RG 0.7 w ${LEFT + 350} ${signY} m ${RIGHT} ${signY} l S`);
  text("Imza / tarih", LEFT, signY - 12, 8);
  text("Imza / tarih", LEFT + 175, signY - 12, 8);
  text("Imza / tarih", LEFT + 350, signY - 12, 8);

  rule(70, "0.55");
  text(
    "Bu tutanak ofis kayitlarindan uretildi; tutanak tarihi, demirbas durumu ve depozito hesabi yukaridaki gibidir.",
    LEFT,
    56,
    7.5,
  );
  text(
    `Olusturma: ${input.createdAtText} · TRADEMARK GAYRIMENKUL · Imza alanlari taraflarca doldurulur.`,
    LEFT,
    45,
    7.5,
  );

  // Fotoğraflar: demirbaş ile imza arasına, en fazla 3 kare
  const photos = input.photos
    .map((photo) => ({ ...photo, size: jpegSize(photo.bytes) }))
    .filter((photo): photo is { bytes: Buffer; caption: string | null; size: { width: number; height: number } } =>
      Boolean(photo.size),
    )
    .slice(0, 3);

  if (photos.length > 0) {
    const top = Math.max(200, Math.min(y - 12, 330));
    const boxWidth = 158;
    const boxHeight = 106;
    const gap = 12;
    text("TESLIM FOTOGRAFLARI", LEFT, top + 8, 10, true);
    let x = LEFT;
    const imageOps: string[] = [];
    photos.forEach((photo, index) => {
      const { width, height } = photo.size;
      const scale = Math.min(boxWidth / width, boxHeight / height);
      const drawWidth = Math.round(width * scale);
      const drawHeight = Math.round(height * scale);
      const drawX = x + Math.round((boxWidth - drawWidth) / 2);
      const drawY = top - 14 - drawHeight;
      imageOps.push(`q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /Im${index + 1} Do Q`);
      text(photo.caption ? tr(photo.caption).slice(0, 26) : `Fotograf ${index + 1}`, x, drawY - 10, 7);
      x += boxWidth + gap;
    });
    ops.push(...imageOps);
  }

  const content = ops.join("\n");
  const contentBytes = Buffer.from(content, "latin1");

  const imageObjects = photos.map((photo, index) => {
    const header = Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${photo.size.width} /Height ${photo.size.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.bytes.length} >>\nstream\n`,
      "latin1",
    );
    return Buffer.concat([header, photo.bytes, Buffer.from("\nendstream", "latin1")]);
  });

  const fontResources = "/Font << /F1 5 0 R /F2 6 0 R >>";
  const xobjectResources =
    photos.length > 0
      ? ` /XObject << ${photos.map((_, index) => `/Im${index + 1} ${7 + index} 0 R`).join(" ")} >>`
      : "";

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << ${fontResources}${xobjectResources} >> /Contents 4 0 R >>`,
      "latin1",
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${contentBytes.length} >>\nstream\n`, "latin1"),
      contentBytes,
      Buffer.from("\nendstream", "latin1"),
    ]),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
    ...imageObjects,
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(offset);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(chunk);
    offset += chunk.length;
  });

  const xref = offset;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const item of offsets) trailer += `${String(item).padStart(10, "0")} 00000 n \n`;
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(Buffer.from(trailer, "latin1"));

  return Buffer.concat(chunks);
}
