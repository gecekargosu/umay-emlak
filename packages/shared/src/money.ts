/**
 * Para yardımcıları — K-13: tüm tutarlar KURUŞ cinsinden tam sayıdır.
 * Float ile para hesaplanmaz. Kayan nokta hatası muhasebede kabul edilemez.
 */

export type Kurus = number;

const MAX_SAFE_KURUS = Number.MAX_SAFE_INTEGER;

/** "12.500,50" | "12500.5" | "12500" → 1250050 kuruş */
export function parseTryToKurus(input: string): Kurus {
  const raw = input.trim().replace(/\s/g, "");
  if (!raw) throw new Error("Tutar boş olamaz");

  // Türk biçimi: 1.234,56 → 1234.56
  // Türkçe yazımda nokta binlik ayırıcıdır: "4.300.000" = 4300000.
  // Virgül yoksa ve noktalar üçlü gruplar hâlindeyse binlik kabul edilir.
  let normalized: string;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else {
    // "12500.5" gibi tek nokta ondalık ayırıcı olarak okunur
    normalized = raw;
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Geçersiz tutar: ${input}`);
  }

  const negative = normalized.startsWith("-");
  const [whole = "0", frac = ""] = normalized.replace("-", "").split(".");
  const kurus = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(kurus)) throw new Error(`Tutar çok büyük: ${input}`);
  return negative ? -kurus : kurus;
}

/** 1250050 → "12.500,50" */
export function formatKurus(kurus: Kurus): string {
  if (!Number.isFinite(kurus)) throw new Error("Geçersiz kuruş değeri");
  const negative = kurus < 0;
  const abs = Math.abs(Math.round(kurus));
  const whole = Math.floor(abs / 100).toLocaleString("tr-TR");
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole},${frac}`;
}

/** 1250050 → "12.500,50 ₺" */
export function formatTry(kurus: Kurus): string {
  return `${formatKurus(kurus)} ₺`;
}

/** Oranı baz puan olarak tut (yüzde 3 = 300 bp). Yüzde hesabı float'sız. */
export function percentOfKurus(amount: Kurus, basisPoints: number): Kurus {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("Oran baz puanı negatif olmayan tam sayı olmalı");
  }
  // amount * bp / 10000, yarım kuruş yukarı yuvarlanır
  return Math.round((amount * basisPoints) / 10_000);
}

/** Kira adedi → tutar (K-22: "yıllık 1 kira" gibi elle girilen bedeller) */
export function rentMultiple(rentKurus: Kurus, count: number): Kurus {
  if (!Number.isInteger(count) || count < 0) throw new Error("Kira adedi geçersiz");
  return rentKurus * count;
}

export function assertSafeKurus(value: number, label = "tutar"): Kurus {
  if (!Number.isSafeInteger(value)) throw new Error(`Geçersiz ${label}: ${value}`);
  if (Math.abs(value) > MAX_SAFE_KURUS) throw new Error(`${label} çok büyük`);
  return value;
}
