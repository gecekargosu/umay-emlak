/**
 * Dosya ayrıştırma — Aysan'ın kayıtları "dağınık Excel" ve telefon notları.
 * Bu yüzden ayrıştırıcı hoşgörülüdür: sütun adları eşanlamlıdır, ayırıcı
 * noktalı virgül de olabilir, sayılar "1.850.000 TL" gibi yazılmış olabilir.
 *
 * Kural: tek bir hücre yüzünden tüm dosya reddedilmez. Hatalı satır
 * raporlanır, kalanı aktarılır — 150 portföyü elle girmek zorunda kalmayalım.
 */
import ExcelJS from "exceljs";

export type Table = { headers: string[]; rows: string[][] };

/** Türkçe karakterleri sadeleştirip karşılaştırılabilir anahtar üretir. */
export function normalizeKey(input: string): string {
  return input
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]/g, "");
}

function parseCsv(text: string): Table {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? clean.length : clean.indexOf("\n"));
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const filled = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (filled.shift() ?? []).map((h) => h.trim());
  return { headers, rows: filled };
}

async function parseXlsx(buffer: Buffer): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    // ExcelJS 1 tabanlı indeks kullanır
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      const raw = cell.text ?? "";
      values.push(String(raw).trim());
    }
    rows.push(values);
  });

  const filled = rows.filter((r) => r.some((c) => c !== ""));
  const headers = (filled.shift() ?? []).map((h) => h.trim());
  return { headers, rows: filled };
}

export async function parseTable(buffer: Buffer, filename: string): Promise<Table> {
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) {
    return parseCsv(buffer.toString("utf8"));
  }
  if (/\.xlsx$/i.test(filename)) {
    return parseXlsx(buffer);
  }
  if (/\.xls$/i.test(filename)) {
    throw new Error("Eski .xls biçimi okunamıyor. Excel'de 'Farklı kaydet → .xlsx' yapın.");
  }
  throw new Error("Desteklenmeyen dosya türü: yalnız .xlsx, .csv veya .txt");
}

// --------------------------------------------------------------- sütun eşleme
export type Field =
  | "fullName"
  | "phone"
  | "email"
  | "kind"
  | "propertyTitle"
  | "city"
  | "district"
  | "address"
  | "price"
  | "deal"
  | "roomCount"
  | "grossM2"
  | "notes"
  | "unitNo"
  | "deedRef";

/** Eşanlamlılar: gerçek dosyalar "Ad Soyad" da der, "Müşteri" de. */
const ALIASES: Record<Field, string[]> = {
  fullName: ["adsoyad", "isim", "ad", "mal sahibi", "malsahibi", "musteri", "kisi", "unvan", "sahip"],
  phone: ["telefon", "tel", "gsm", "cep", "ceptel", "phone", "numara", "iletisim"],
  email: ["eposta", "email", "mail", "e-posta"],
  kind: ["tur", "kayittipi", "grup", "rol", "kisi tipi", "musteritipi"],
  propertyTitle: ["mulk", "gayrimenkul", "portfoy", "daire", "mulku", "mul adi", "baslik", "konut"],
  city: ["il", "sehir"],
  district: ["ilce", "semt", "mahalle"],
  address: ["adres", "acik adres", "konum"],
  price: ["fiyat", "kira", "bedel", "tutar", "satis fiyati", "kira bedeli", "istenen"],
  deal: ["satilik", "kiralik", "islem", "durum", "satiskirasi", "tipi"],
  roomCount: ["oda", "odasayisi", "odatipi", "oda sayisi"],
  grossM2: ["m2", "metrekare", "brut", "brutmetrekare", "alan"],
  notes: ["not", "notlar", "aciklama", "detay"],
  unitNo: ["daireno", "kapi", "kapino", "unit"],
  deedRef: ["tapu", "adaparsel", "tapuada", "parsel"],
};

export function mapColumns(headers: string[]): Partial<Record<Field, number>> {
  const mapping: Partial<Record<Field, number>> = {};
  headers.forEach((header, index) => {
    const key = normalizeKey(header);
    if (!key) return;
    for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (mapping[field] !== undefined) continue;
      if (aliases.some((alias) => key === alias || key.startsWith(alias) || alias.startsWith(key))) {
        mapping[field] = index;
        return;
      }
    }
  });
  return mapping;
}

/** "1.850.000 TL" | "1850000" | "18.500" → kuruş (tam sayı) */
export function parseMoneyToKurus(input: string): number | null {
  const digits = input.replace(/[^\d.,-]/g, "").trim();
  if (!digits) return null;

  let normalized: string;
  if (digits.includes(",") && digits.lastIndexOf(",") > digits.lastIndexOf(".")) {
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else if ((digits.match(/\./g)?.length ?? 0) > 1) {
    normalized = digits.replace(/\./g, "");
  } else {
    normalized = digits.replace(/,/g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function parsePhoneDigits(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // Son 10 hane: 0555..., +90 555..., 555... hepsi aynı anahtara düşer
  return digits.slice(-10);
}

/** Kişi türü tahmini: dosyadaki serbest metinden. */
export function guessPersonKind(input: string): "owner" | "tenant" | "candidate" {
  const key = normalizeKey(input);
  if (!key) return "owner";
  if (key.includes("kiraci") || key.includes("kira")) return "tenant";
  if (key.includes("aday") || key.includes("musteri") || key.includes("portfoy")) return "candidate";
  if (key.includes("mal") || key.includes("sahip") || key.includes("evsahibi")) return "owner";
  return "owner";
}

export function guessDealKind(input: string): "sale" | "rent" {
  const key = normalizeKey(input);
  return key.includes("sat") ? "sale" : "rent";
}
