/**
 * Ortam değişkenleri: .env dosyasını yukarı doğru arar (Node 20.12+ loadEnvFile).
 * Sır hiçbir zaman koda gömülmez (K-19).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function loadEnv(): void {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        /* zaten yüklenmiş olabilir */
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Ortam değişkeni eksik: ${name} (.env dosyasına bak)`);
  return value;
}

export const APP_DB_ROLE = "umay_app";
