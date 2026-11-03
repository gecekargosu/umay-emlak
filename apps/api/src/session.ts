/**
 * Oturum katmanı — Dilim 1.
 *
 * Akış: giriş → şifre doğrulanır → `session` satırı yazılır → çerez
 * `<oturumId>.<HMAC imzası>` olarak gider. Her istekte:
 *   1) çerez imzası doğrulanır (değiştirilmiş çerez reddedilir),
 *   2) oturum kaydı iptal/süre kontrolünden geçer,
 *   3) üyelik KİRACI BAĞLAMINDA okunur (RLS başka ofisin üyeliğini gizler).
 *
 * Kiracı kimliği istemciden alınmaz; imzalı oturumdan gelir (K-07).
 */
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sql } from "drizzle-orm";
import { getPool, signSessionId, verifySessionCookie, withTenant } from "@umay/db";

export const SESSION_COOKIE = "umay_sid";
export const SESSION_DAYS = 30;

export type Role = "owner" | "partner" | "manager" | "agent" | "finance" | "viewer";

export type Session = {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
  canApprove: boolean;
  fullName: string;
  email: string;
  tenantName: string;
  mustChangePassword: boolean;
};

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET eksik veya çok kısa (.env dosyasına bak)");
  }
  return secret;
}

export async function resolveSession(c: Context): Promise<Session> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) throw new HttpError(401, "Oturum yok, giriş yapın");

  const sessionId = verifySessionCookie(raw, sessionSecret());
  if (!sessionId) throw new HttpError(401, "Oturum çerezi geçersiz");

  const { rows } = await getPool().query<{
    user_id: string;
    tenant_id: string;
    expires_at: Date;
    revoked_at: Date | null;
    full_name: string;
    email: string;
    must_change_password: boolean;
    is_active: boolean;
    tenant_name: string;
  }>(
    `select s.user_id, s.tenant_id, s.expires_at, s.revoked_at,
            u.full_name, u.email, u.must_change_password, u.is_active,
            t.name as tenant_name
       from session s
       join app_user u on u.id = s.user_id
       join tenant t on t.id = s.tenant_id
      where s.id = $1`,
    [sessionId],
  );

  const row = rows[0];
  if (!row) throw new HttpError(401, "Oturum bulunamadı");
  if (row.revoked_at) throw new HttpError(401, "Oturum kapatılmış");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, "Oturum süresi doldu");
  }
  if (!row.is_active) throw new HttpError(403, "Hesap kapatılmış");

  const memberships = await withTenant(row.tenant_id, async (tx) => {
    const result = await tx.execute(sql`
      select role, can_approve
        from membership
       where user_id = ${row.user_id} and status = 'active'
    `);
    return (result as unknown as { rows: Array<{ role: Role; can_approve: boolean }> }).rows;
  });

  const membership = memberships[0];
  if (!membership) throw new HttpError(403, "Bu ofiste üyeliğiniz yok veya kapatılmış");

  return {
    sessionId,
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: membership.role,
    canApprove: membership.can_approve,
    fullName: row.full_name,
    email: row.email,
    tenantName: row.tenant_name,
    mustChangePassword: row.must_change_password,
  };
}

export async function createSessionRow(
  userId: string,
  tenantId: string,
  userAgent: string | undefined,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getPool().query(
    `insert into session (id, user_id, tenant_id, expires_at, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [sessionId, userId, tenantId, expiresAt, userAgent ?? null],
  );
  return { sessionId, expiresAt };
}

export function writeSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE, signSessionId(sessionId, sessionSecret()), {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" });
}

/** K-29: onay yetkisi olmayan işlemi reddeder. */
export function requireApproval(session: Session, action: string): void {
  if (!session.canApprove) {
    throw new HttpError(403, `Bu işlem onay yetkisi ister: ${action}`);
  }
}

export function requireOwner(session: Session, action: string): void {
  if (session.role !== "owner") {
    throw new HttpError(403, `Bu işlem yalnız ofis sahibine açıktır: ${action}`);
  }
}

/** İzleyici rolü yalnız okur; veri değiştiren uçlar bunu çağırır. */
export function requireWrite(session: Session, action: string): void {
  if (session.role === "viewer") {
    throw new HttpError(403, `İzleyici rolü bu işlemi yapamaz: ${action}`);
  }
}

/** Şifresi geçici olan kullanıcı veri uçlarına erişemez. */
export function requirePasswordChanged(session: Session): void {
  if (session.mustChangePassword) {
    throw new HttpError(403, "Önce şifrenizi değiştirmeniz gerekiyor");
  }
}
