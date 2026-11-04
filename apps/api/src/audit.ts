/**
 * Denetim ve istek kaydı — K-6 / M4 (TUR:46).
 *
 * İki iş yapar:
 *  1) Her isteğe bir numara verir (x-request-id) ve tek satır JSON log yazar.
 *     Hata mesajındaki "kayıt no" bu numaradır; kullanıcı onu söyleyince log'da
 *     aynı numarayla isteği buluruz.
 *  2) Yazma istekleri (POST/PATCH/PUT/DELETE) başarılıysa audit_log'a satır ekler:
 *     kim (user_id), hangi ofis (tenant_id), hangi uç, hangi kayıt.
 *
 * Kural: denetim yazımı asla isteği bozmaz — hata olursa yalnız log'lanır.
 * Kayıt silinmez; tablo yalnız eklenir (migration 0016).
 */
import { createMiddleware } from "hono/factory";
import { sql } from "drizzle-orm";
import { withTenant } from "@umay/db";
import { resolveSession } from "./session.js";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Hono bağlamına eklenen istek numarası (x-request-id ile aynı). */
export type AuditEnv = { Variables: { ref: string } };

export function makeRef(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = Math.floor(Math.random() * 46_656).toString(36).toUpperCase();
  return `R-${stamp}${salt}`;
}

/** Tek satır JSON log — sunucu çıktısı makineyle okunabilir kalsın. */
export function logJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

const ACTION_TR: Record<string, string> = {
  POST: "oluşturma",
  PATCH: "güncelleme",
  PUT: "güncelleme",
  DELETE: "silme",
};

export const auditMiddleware = createMiddleware<AuditEnv>(async (c, next) => {
  const ref = makeRef();
  c.set("ref", ref);
  c.header("x-request-id", ref);
  const started = Date.now();
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  await next();

  const status = c.res.status;
  logJson({
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    ref,
    method,
    path,
    status,
    ms: Date.now() - started,
  });

  if (!WRITE_METHODS.has(method) || status >= 400) return;
  // Oturum açma/çıkarma yazma sayılmaz; denetim gürültüsü olmasın.
  if (path.startsWith("/api/v1/auth/")) return;
  // Kiracının jetonsuz (girişsiz) uçları: oturum yok, denetim satırı yazılamaz.
  if (path.startsWith("/api/v1/public/")) return;

  try {
    const session = await resolveSession(c);
    const parts = path.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
    const entityType = parts[0] ?? null;
    const entityId = parts.find((part) => UUID_RE.test(part)) ?? null;
    const action = `${ACTION_TR[method] ?? method.toLowerCase()} ${entityType ?? "kayıt"}`;
    const summary = `${method} ${path} → ${status}`;

    await withTenant(session.tenantId, async (tx) =>
      tx.execute(sql`
        insert into audit_log
          (tenant_id, user_id, request_ref, method, path, action, entity_type, entity_id, status, summary)
        values
          (${session.tenantId}::uuid, ${session.userId}::uuid, ${ref}, ${method}, ${path},
           ${action}, ${entityType}, ${entityId}::uuid, ${status}, ${summary})
      `),
    );
  } catch (error) {
    logJson({
      level: "warn",
      ref,
      what: "denetim kaydı yazılamadı",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
