/**
 * Belge türleri ve matrisi — K-32.
 *
 * Matris, "hangi iş için hangi belge şart" sorusunun TEK cevabıdır.
 * Arayüz ve sunucu aynı listeyi kullanır; iki yerde farklı kural olmaz.
 */

export const DOCUMENT_KINDS = [
  "tapu",
  "kimlik",
  "yetki_belgesi",
  "satis_yetki",
  "sozlesme",
  "bordro",
  "kefil",
  "findex",
  "imar",
  "dekont",
  "diger",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_TR: Record<DocumentKind, string> = {
  tapu: "Tapu",
  kimlik: "Kimlik",
  yetki_belgesi: "Yetki belgesi",
  satis_yetki: "Satış yetkisi",
  sozlesme: "Sözleşme",
  bordro: "Bordro / gelir belgesi",
  kefil: "Kefil belgesi",
  findex: "Findex / kredi notu",
  imar: "İmar durumu",
  dekont: "Dekont",
  diger: "Diğer",
};

/** Belge türünü dosya adından tahmin etmek için anahtar kelimeler. */
export const DOCUMENT_KIND_KEYWORDS: Record<DocumentKind, string[]> = {
  tapu: ["tapu", "tapu senedi"],
  kimlik: ["kimlik", "nufus", "nüfus", "ehliyet", "pasaport"],
  yetki_belgesi: ["yetki", "vekalet", "yetki belgesi"],
  satis_yetki: ["satis yetki", "satış yetki", "satis yetkisi"],
  sozlesme: ["sozlesme", "sözleşme", "kontrat", "kira sozlesmesi"],
  bordro: ["bordro", "gelir belgesi", "maas", "maaş"],
  kefil: ["kefil", "kefalet"],
  findex: ["findex", "kredi notu", "skor"],
  imar: ["imar", "plan", "kroki"],
  dekont: ["dekont", "makbuz", "havale"],
  diger: [],
};

/** Bir iş için gereken belge grubu. Gruptaki TÜRLERDEN biri yeterlidir. */
export type DocumentRequirement = {
  key: string;
  label: string;
  kinds: DocumentKind[];
};

/** Portföy türüne göre zorunlu belgeler (yayına alma şartı). */
export function requiredForListing(kind: "sale" | "rent"): DocumentRequirement[] {
  if (kind === "sale") {
    return [
      { key: "tapu", label: "Tapu", kinds: ["tapu"] },
      { key: "yetki", label: "Yetki belgesi", kinds: ["yetki_belgesi", "satis_yetki"] },
      { key: "kimlik", label: "Mal sahibi kimliği", kinds: ["kimlik"] },
    ];
  }
  return [
    { key: "tapu", label: "Tapu", kinds: ["tapu"] },
    { key: "kimlik", label: "Mal sahibi kimliği", kinds: ["kimlik"] },
  ];
}

/** Kişi türüne göre beklenen belgeler (bilgi amaçlı; yayına alma şartı değil). */
export function requiredForPerson(kind: "owner" | "tenant" | "candidate"): DocumentRequirement[] {
  if (kind === "tenant") {
    return [
      { key: "kimlik", label: "Kimlik", kinds: ["kimlik"] },
      { key: "sozlesme", label: "Kira sözleşmesi", kinds: ["sozlesme"] },
      { key: "gelir", label: "Gelir belgesi", kinds: ["bordro", "findex"] },
    ];
  }
  if (kind === "owner") {
    return [{ key: "kimlik", label: "Kimlik", kinds: ["kimlik"] }];
  }
  return [];
}

/** Elde olan türlerle eksik grupları bulur. */
export function missingRequirements(
  requirements: DocumentRequirement[],
  presentKinds: readonly string[],
): DocumentRequirement[] {
  const present = new Set(presentKinds);
  return requirements.filter((r) => !r.kinds.some((k) => present.has(k)));
}

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}
