/**
 * Tarih/dönem yardımcıları.
 * Kural: veritabanında tarih = DATE (saat yok), zaman damgası = timestamptz.
 * "Dönem" her zaman ayın 1'i olarak saklanır (YYYY-MM-01).
 */

/** Date → 'YYYY-MM-DD' (yerel saat kayması yaratmadan) */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → Date (UTC gece yarısı) */
export function fromDateString(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Geçersiz tarih: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

/** Bir tarihin dönemi: '2026-11-14' → '2026-11-01' */
export function periodOf(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error(`Geçersiz tarih: ${dateStr}`);
  return `${dateStr.slice(0, 7)}-01`;
}

/** Döneme ay ekle: ('2026-11-01', 1) → '2026-12-01' */
export function addMonthsToPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) throw new Error(`Geçersiz dönem: ${period}`);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** İki tarih arası gün farkı (b - a) */
export function daysBetween(a: string, b: string): number {
  const MS = 86_400_000;
  return Math.round((fromDateString(b).getTime() - fromDateString(a).getTime()) / MS);
}

/** '2026-11-01' → 'Kasım 2026' */
export function formatPeriodTr(period: string): string {
  const names = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Geçersiz dönem: ${period}`);
  return `${names[m - 1]} ${y}`;
}
