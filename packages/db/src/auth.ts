/**
 * Kimlik doğrulama yardımcıları.
 * Şifre: scrypt (Node yerleşik) — ek bağımlılık ve native derleme yok.
 * Saklama biçimi: scrypt$N$r$p$saltB64$hashB64
 * Karşılaştırma her zaman timingSafeEqual ile (zamanlama sızıntısı olmasın).
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı");
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const expected = Buffer.from(hashB64!, "base64");
    const actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64!, "base64"), expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Rastgele, URL-güvenli jeton (oturum kimliği, sıfırlama jetonu). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Çerez değeri = <oturumKimliği>.<imza>. İmza olmadan çerez değiştirilemez.
 * Veritabanı kaydı ayrıca iptal edilebilirlik sağlar (logout, şifre değişimi).
 */
export function signSessionId(sessionId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

export function verifySessionCookie(value: string, secret: string): string | null {
  const index = value.lastIndexOf(".");
  if (index <= 0) return null;
  const sessionId = value.slice(0, index);
  const signature = value.slice(index + 1);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;

  const expected = createHmac("sha256", secret).update(sessionId).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? sessionId : null;
}
