/**
 * Kimlik uçları.
 * Giriş denemeleri hız sınırlıdır (bellek içi, süreç başına). Çok sunuculu
 * kuruluma geçilirse aynı sınır Redis/PostgreSQL'e taşınır — şimdilik yeter.
 */
import { Hono } from "hono";
import { z } from "zod";
import { generateToken, getPool, hashPassword, sha256Hex, verifyPassword } from "@umay/db";
import {
  HttpError,
  clearSessionCookie,
  createSessionRow,
  resolveSession,
  writeSessionCookie,
} from "../session.js";

export const authRoutes = new Hono();

// Test koşuları aynı hesapla onlarca kez giriş yapar; sınır testte yükseltilir,
// üretimde 15 dakikada 10 deneme kalır (brute-force koruması).
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? 10);
const LOGIN_WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > LOGIN_LIMIT) {
    throw new HttpError(429, "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.");
  }
}

const loginSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
  tenantId: z.uuid().optional(),
});

authRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "E-posta ve şifre gerekli");
  const { email, password, tenantId } = parsed.data;

  rateLimit(`login:${email.toLowerCase()}`);

  const { rows } = await getPool().query<{
    id: string;
    full_name: string;
    password_hash: string | null;
    must_change_password: boolean;
    is_active: boolean;
  }>(
    `select id, full_name, password_hash, must_change_password, is_active
       from app_user where lower(email) = lower($1)`,
    [email],
  );
  const user = rows[0];

  // Kullanıcı yoksa da hash doğrulaması yapılır: yanıt süresi bilgi sızdırmasın.
  const ok = verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok) throw new HttpError(401, "E-posta veya şifre hatalı");
  if (!user.is_active) throw new HttpError(403, "Hesap kapatılmış");

  const memberships = await getPool().query<{ tenant_id: string; tenant_name: string; role: string }>(
    "select * from auth_lookup($1)",
    [email],
  );
  if (memberships.rows.length === 0) throw new HttpError(403, "Hiçbir ofiste üyeliğiniz yok");

  if (memberships.rows.length > 1 && !tenantId) {
    return c.json({
      needsTenant: true,
      tenants: memberships.rows.map((m) => ({ id: m.tenant_id, name: m.tenant_name })),
    });
  }

  const chosen =
    memberships.rows.find((m) => m.tenant_id === tenantId) ?? memberships.rows[0]!;

  const { sessionId } = await createSessionRow(user.id, chosen.tenant_id, c.req.header("user-agent"));
  writeSessionCookie(c, sessionId);
  attempts.delete(`login:${email.toLowerCase()}`);

  return c.json({
    user: { id: user.id, name: user.full_name, email },
    tenant: { id: chosen.tenant_id, name: chosen.tenant_name },
    role: chosen.role,
    mustChangePassword: user.must_change_password,
  });
});

authRoutes.post("/logout", async (c) => {
  const session = await resolveSession(c).catch(() => null);
  if (session) {
    await getPool().query("update session set revoked_at = now() where id = $1", [session.sessionId]);
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/session", async (c) => {
  const session = await resolveSession(c);
  return c.json({
    user: { id: session.userId, name: session.fullName, email: session.email },
    tenant: { id: session.tenantId, name: session.tenantName },
    role: session.role,
    canApprove: session.canApprove,
    mustChangePassword: session.mustChangePassword,
  });
});

/** Aynı kişi iki ofiste çalışıyorsa ofis değiştirebilir (K-02). */
authRoutes.post("/switch-tenant", async (c) => {
  const session = await resolveSession(c);
  const body = z.object({ tenantId: z.uuid() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "tenantId gerekli");

  const allowed = await getPool().query<{ tenant_id: string }>("select * from auth_lookup($1)", [
    session.email,
  ]);
  if (!allowed.rows.some((r) => r.tenant_id === body.data.tenantId)) {
    throw new HttpError(403, "Bu ofiste üyeliğiniz yok");
  }

  await getPool().query("update session set revoked_at = now() where id = $1", [session.sessionId]);
  const { sessionId } = await createSessionRow(session.userId, body.data.tenantId, c.req.header("user-agent"));
  writeSessionCookie(c, sessionId);
  return c.json({ ok: true, tenantId: body.data.tenantId });
});

const passwordSchema = z.string().min(8, "Şifre en az 8 karakter olmalı").max(200);

authRoutes.post("/change-password", async (c) => {
  const session = await resolveSession(c);
  const body = z
    .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HttpError(400, body.error.issues[0]?.message ?? "Geçersiz veri");
  }

  const { rows } = await getPool().query<{ password_hash: string | null }>(
    "select password_hash from app_user where id = $1",
    [session.userId],
  );
  if (!verifyPassword(body.data.currentPassword, rows[0]?.password_hash)) {
    throw new HttpError(401, "Mevcut şifre hatalı");
  }

  await getPool().query(
    `update app_user
        set password_hash = $1, password_updated_at = now(), must_change_password = false
      where id = $2`,
    [hashPassword(body.data.newPassword), session.userId],
  );
  // Diğer cihazlardaki oturumlar kapanır; bu cihaz açık kalır.
  await getPool().query(
    "update session set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null",
    [session.userId, session.sessionId],
  );

  return c.json({ ok: true });
});

/**
 * Şifre sıfırlama isteği.
 * E-posta servisi henüz yok (Dilim 9): jeton geliştirmede yanıtta döner,
 * üretimde ASLA dönmez — orada e-posta ile gönderilecek.
 */
/**
 * Y-58: boşta kilit açma. Ekran kilitlendiğinde şifre yeniden doğrulanır;
 * oturum çerezi değişmez, yeni oturum açılmaz.
 */
authRoutes.post("/verify-password", async (c) => {
  const session = await resolveSession(c);
  const body = z
    .object({ password: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Şifre gerekli");

  const { rows } = await getPool().query<{ password_hash: string | null }>(
    "select password_hash from app_user where id = $1",
    [session.userId],
  );
  if (!verifyPassword(body.data.password, rows[0]?.password_hash ?? null)) {
    throw new HttpError(401, "Şifre hatalı");
  }
  return c.json({ ok: true });
});

authRoutes.post("/reset-request", async (c) => {
  const body = z.object({ email: z.string().min(3) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "E-posta gerekli");

  const { rows } = await getPool().query<{ id: string }>(
    "select id from app_user where lower(email) = lower($1) and is_active",
    [body.data.email],
  );

  let devToken: string | undefined;
  if (rows[0]) {
    const token = generateToken(32);
    await getPool().query(
      `insert into password_reset (user_id, purpose, token_hash, expires_at)
       values ($1, 'reset', $2, now() + interval '60 minutes')`,
      [rows[0].id, sha256Hex(token)],
    );
    if (process.env.NODE_ENV !== "production") devToken = token;
  }

  // Kullanıcı var mı yok mu belli olmasın: her zaman aynı yanıt.
  return c.json({ ok: true, ...(devToken ? { devToken } : {}) });
});

authRoutes.post("/reset-confirm", async (c) => {
  const body = z
    .object({ token: z.string().min(10), newPassword: passwordSchema })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HttpError(400, body.error.issues[0]?.message ?? "Geçersiz veri");
  }

  const { rows } = await getPool().query<{ id: string; user_id: string }>(
    `select id, user_id from password_reset
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [sha256Hex(body.data.token)],
  );
  const reset = rows[0];
  if (!reset) throw new HttpError(400, "Bağlantı geçersiz veya süresi dolmuş");

  await getPool().query(
    `update app_user
        set password_hash = $1, password_updated_at = now(), must_change_password = false
      where id = $2`,
    [hashPassword(body.data.newPassword), reset.user_id],
  );
  await getPool().query("update password_reset set used_at = now() where id = $1", [reset.id]);
  await getPool().query(
    "update session set revoked_at = now() where user_id = $1 and revoked_at is null",
    [reset.user_id],
  );

  return c.json({ ok: true });
});

/** Profil: kullanıcının ofis listesi (üstteki ofis değiştirme için). */
authRoutes.get("/tenants", async (c) => {
  const session = await resolveSession(c);
  const { rows } = await getPool().query<{ tenant_id: string; tenant_name: string; role: string }>(
    "select * from auth_lookup($1)",
    [session.email],
  );
  return c.json({
    active: session.tenantId,
    tenants: rows.map((r) => ({ id: r.tenant_id, name: r.tenant_name, role: r.role })),
  });
});
