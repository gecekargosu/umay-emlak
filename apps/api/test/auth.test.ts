/**
 * DİLİM 1 KABUL TESTLERİ.
 * Gerçek uygulama nesnesine (app.request) istek atılır; sunucu açılmaz.
 * Kapsam: giriş, yanlış şifre, çerez kurcalama, ofis sınırı, onay yetkisi,
 * şifre değiştirme (diğer oturumları kapatma) ve sıfırlama akışı.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, getPool, schema, withTenant } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const ELIF = "elif.demir@umay-emlak.local";
const B_OFIS = "b.ofis.sahibi@test-ofis-b.local";
const PASSWORD = "Umay!2026";
const NEW_PASSWORD = "YeniSifre!2026";

function cookieFrom(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("Yanıtta çerez yok");
  return raw.split(";")[0]!;
}

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `giriş başarısız: ${email}`).toBe(200);
  return cookieFrom(res);
}

async function get(path: string, cookie?: string): Promise<Response> {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

afterAll(async () => {
  // Test sırasında değişen şifreyi geri al ve test oturumlarını temizle
  await getPool().query(
    `update app_user set password_hash = (select password_hash from app_user where email = $1)
      where email = any($2::text[])`,
    [AYSAN, [ELIF, B_OFIS]],
  );
  await closePool();
});

describe("giriş", () => {
  it("doğru şifreyle giriş yapar ve oturum çerezi verir", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: AYSAN, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { name: string }; role: string };
    expect(body.user.name).toBe("Aysan Kılıç");
    expect(body.role).toBe("owner");
    expect(cookieFrom(res)).toMatch(/^umay_sid=/);
  });

  it("yanlış şifre 401 döner ve çerez vermez", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: AYSAN, password: "yanlis-sifre" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("olmayan e-posta da 401 döner (kullanıcı varlığı sızmaz)", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "yok@yok.local", password: PASSWORD }),
    });
    expect(res.status).toBe(401);
  });
});

describe("oturum", () => {
  it("geçerli çerezle /me çalışır", async () => {
    const cookie = await login(AYSAN);
    const res = await get("/api/v1/auth/session", cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenant: { name: string } };
    expect(body.tenant.name).toBe("Umay Emlak (pilot)");
  });

  it("çerez yoksa 401", async () => {
    expect((await get("/api/v1/me")).status).toBe(401);
  });

  it("kurcalanmış çerez reddedilir", async () => {
    const cookie = await login(AYSAN);
    const tampered = cookie.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    expect((await get("/api/v1/me", tampered)).status).toBe(401);
  });

  it("çıkış yapan oturum tekrar kullanılamaz", async () => {
    const cookie = await login(AYSAN);
    const out = await app.request("/api/v1/auth/logout", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);
    expect((await get("/api/v1/me", cookie)).status).toBe(401);
  });
});

describe("ofis sınırı", () => {
  it("A ofisi kullanıcısı B ofisine geçemez", async () => {
    const cookie = await login(AYSAN);
    const bTenant = await getPool().query<{ id: string }>(
      "select id from tenant where slug = 'test-ofis-b'",
    );
    const res = await app.request("/api/v1/auth/switch-tenant", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: bTenant.rows[0]!.id }),
    });
    expect(res.status).toBe(403);
  });

  it("B ofisi kullanıcısı yalnız kendi özetini görür", async () => {
    const cookie = await login(B_OFIS);
    const res = await get("/api/v1/summary", cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openKurus: number };
    expect(body.openKurus).toBe(1_200_000);
  });
});

describe("yetki ve ekip", () => {
  it("personel ekip listesini görebilir ama üye ekleyemez", async () => {
    const cookie = await login(ELIF);
    expect((await get("/api/v1/team", cookie)).status).toBe(200);

    const res = await app.request("/api/v1/team", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Yeni Personel", email: "yeni@umay-emlak.local" }),
    });
    expect(res.status).toBe(403);
  });

  it("personel komisyon onaylayamaz, sahip onaylayabilir", async () => {
    const { rows } = await getPool().query<{ id: string }>(
      "select id from tenant where slug = 'umay-emlak'",
    );
    const tenantId = rows[0]!.id;

    // RLS: komisyon yazımı da kiracı bağlamında olmalı (testin kendisi kanıt).
    const id = await withTenant(tenantId, async (tx) => {
      const listing = await tx
        .select({ id: schema.listings.id })
        .from(schema.listings)
        .limit(1);
      const [commission] = await tx
        .insert(schema.commissions)
        .values({
          tenantId,
          listingId: listing[0]!.id,
          rateBp: 300,
          amountKurus: 500_000,
        })
        .returning({ id: schema.commissions.id });
      return commission!.id;
    });

    const agent = await login(ELIF);
    const denied = await app.request(`/api/v1/commissions/${id}/approve`, {
      method: "POST",
      headers: { cookie: agent },
    });
    expect(denied.status).toBe(403);

    const owner = await login(AYSAN);
    const allowed = await app.request(`/api/v1/commissions/${id}/approve`, {
      method: "POST",
      headers: { cookie: owner },
    });
    expect(allowed.status).toBe(200);

    await withTenant(tenantId, async (tx) => {
      await tx.delete(schema.commissions).where(eq(schema.commissions.id, id));
    });
  });

  it("sahip yeni personel ekler, geçici şifre bir kez döner", async () => {
    const cookie = await login(AYSAN);
    const email = `test-personel-${Date.now()}@umay-emlak.local`;
    const res = await app.request("/api/v1/team", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Test Personel", email, role: "agent" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { tempPassword?: string };
    expect(body.tempPassword).toBeTruthy();

    // Geçici şifreyle giriş yapılır ama veri uçları şifre değişene kadar kapalı
    const tempCookie = await login(email, body.tempPassword!);
    const blocked = await get("/api/v1/summary", tempCookie);
    expect(blocked.status).toBe(403);

    await getPool().query("delete from app_user where email = $1", [email]);
  });
});

describe("şifre", () => {
  it("şifre değişince diğer cihazların oturumu kapanır", async () => {
    const first = await login(B_OFIS);
    const second = await login(B_OFIS);

    const changed = await app.request("/api/v1/auth/change-password", {
      method: "POST",
      headers: { cookie: second, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    });
    expect(changed.status).toBe(200);

    expect((await get("/api/v1/me", first)).status).toBe(401);
    expect((await get("/api/v1/me", second)).status).toBe(200);

    // Eski şifre artık çalışmaz, yeni şifre çalışır
    const oldLogin = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: B_OFIS, password: PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);
    expect((await login(B_OFIS, NEW_PASSWORD)).length).toBeGreaterThan(0);
  });

  it("sıfırlama jetonu tek kullanımlıktır", async () => {
    const req = await app.request("/api/v1/auth/reset-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: B_OFIS }),
    });
    expect(req.status).toBe(200);
    const { devToken } = (await req.json()) as { devToken?: string };
    expect(devToken).toBeTruthy();

    const confirm = await app.request("/api/v1/auth/reset-confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: devToken, newPassword: NEW_PASSWORD }),
    });
    expect(confirm.status).toBe(200);

    const reuse = await app.request("/api/v1/auth/reset-confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: devToken, newPassword: "BaskaSifre!123" }),
    });
    expect(reuse.status).toBe(400);
  });
});
