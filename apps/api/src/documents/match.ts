/**
 * Belge eşleştirme — K-32: sistem ÖNERİR, insan onaylar.
 *
 * Kural: burada hiçbir şey bağlanmaz. Sadece "bu dosya şu kişiye/mülke ait
 * olabilir" fikri ve GEREKÇESİ üretilir. Gerekçesiz öneri kullanıcıya
 * güven vermez; bu yüzden her öneri puanının yanında nedenini taşır.
 */
import { DOCUMENT_KIND_KEYWORDS, type DocumentKind } from "@umay/shared";

/** Türkçe karakterleri sadeleştirir: "Şükrü Ölçer" → "sukru olcer". */
export function normalizeTr(input: string): string {
  return input
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Dosya adı gürültüsü: bunlar eşleşme kanıtı sayılmaz. */
const NOISE = new Set([
  "tapu",
  "kimlik",
  "belge",
  "belgesi",
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "docx",
  "doc",
  "scan",
  "taranmis",
  "taranan",
  "fotokopi",
  "kopya",
  "yeni",
  "son",
  "final",
  "whatsapp",
  "image",
  "img",
  "foto",
]);

export function tokensOf(input: string): string[] {
  return normalizeTr(input)
    .split(" ")
    .filter((token) => token.length >= 3 && !NOISE.has(token));
}

export type MatchTarget = {
  type: "person" | "property" | "listing";
  id: string;
  label: string;
  /** Daire no, blok gibi ayırt edici ekler */
  extras?: string[];
};

export type MatchSuggestion = {
  targetType: MatchTarget["type"];
  targetId: string;
  score: number;
  reasons: string[];
};

export const SUGGESTION_THRESHOLD = 45;

export function scoreDocument(
  filename: string,
  kind: DocumentKind,
  targets: MatchTarget[],
): MatchSuggestion[] {
  const fileTokens = new Set(tokensOf(filename.replace(/\.[a-z0-9]+$/i, "")));
  const normalizedFile = normalizeTr(filename);
  const kindHit = (DOCUMENT_KIND_KEYWORDS[kind] ?? []).some((keyword) =>
    normalizedFile.includes(normalizeTr(keyword)),
  );

  const suggestions: MatchSuggestion[] = [];

  for (const target of targets) {
    const labelTokens = tokensOf(target.label);
    if (labelTokens.length === 0) continue;

    const matched = labelTokens.filter((token) => fileTokens.has(token));
    const coverage = matched.length / labelTokens.length;
    const reasons: string[] = [];
    let score = 0;

    if (coverage === 1 && labelTokens.length >= 2) {
      score += 70;
      reasons.push(`Dosya adında “${target.label}” adının tüm parçaları var`);
    } else if (coverage >= 0.5) {
      score += 45;
      reasons.push(`Dosya adı “${target.label}” ile kısmen örtüşüyor`);
    } else if (matched.length > 0) {
      score += 20;
      reasons.push(`Dosya adında “${matched[0]}” geçiyor`);
    }

    for (const extra of target.extras ?? []) {
      const extraTokens = tokensOf(extra);
      if (extraTokens.length > 0 && extraTokens.every((t) => fileTokens.has(t))) {
        score += 15;
        reasons.push(`Dosya adında ayırt edici bilgi var: ${extra}`);
      }
    }

    if (kindHit) {
      score += 10;
      reasons.push("Dosya adı belge türüyle uyumlu");
    }

    const bounded = Math.max(0, Math.min(100, score));
    if (bounded >= SUGGESTION_THRESHOLD && reasons.length > 0) {
      suggestions.push({
        targetType: target.type,
        targetId: target.id,
        score: bounded,
        reasons,
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}
