/**
 * Belge deposu — K-18: içerik adresli (sha256).
 *
 * Dosya, içeriğinin özetiyle adreslenir: aynı dosya iki kez yüklenirse tek
 * kopya durur. Yerleşim: <kök>/ab/cd/<sha256>.
 *
 * Not: depo yolu ortam değişkeniyle taşınabilir (ileride S3/NAS için tek
 * değişecek yer burasıdır). Veritabanı yalnız META veriyi tutar.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function storageRoot(): string {
  const configured = process.env.UMAY_STORAGE_DIR?.trim();
  return configured ? resolve(configured) : resolve(join(process.cwd(), ".data", "documents"));
}

export function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectPath(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Geçersiz içerik adresi");
  return join(storageRoot(), hash.slice(0, 2), hash.slice(2, 4), hash);
}

/** İçeriği yazar (varsa üzerine aynı baytları yazar; sonuç aynı). */
export async function putObject(hash: string, bytes: Buffer): Promise<void> {
  const path = objectPath(hash);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function getObject(hash: string): Promise<Buffer | null> {
  try {
    return await readFile(objectPath(hash));
  } catch {
    return null;
  }
}

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Kabul edilen dosya türleri. Listede olmayan tür 400 ile reddedilir. */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

/** Tarayıcı tür göndermezse uzantıdan çıkarır; ikisi de yoksa null. */
export function resolveMimeType(filename: string, declared: string): string | null {
  const normalized = declared.trim().toLowerCase();
  if (normalized && ALLOWED_TYPES.has(normalized)) return normalized;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}
