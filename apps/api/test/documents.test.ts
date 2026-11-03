/**
 * DİLİM 3 KABUL TESTLERİ.
 * Belge deposu (sha256, tekrar yüklememe), onaylı otomatik eşleştirme,
 * ilan yayına alma belge şartı, fiyat geçmişi ve kiracı izolasyonu.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const AGENT = "elif.demir@umay-emlak.local"; // canApprove = false
const B_OFIS = "b.ofis.sahibi@test-ofis-b.local";
const PASSWORD = "Umay!2026";

async function login(email: string): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status, `giriş başarısız: ${email}`).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

async function post(path: string, cookie: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(path: string, cookie: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Sabit içerik: her koşuda aynı sha256 → depo şişmez, tekrar testi anlamlı olur. */
async function upload(
  cookie: string,
  filename: string,
  content: string,
  fields: Record<string, string> = {},
): Promise<Response> {
  const form = new FormData();
  form.append("file", new File([content], filename, { type: "application/pdf" }));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return app.request("/api/v1/documents", { method: "POST", headers: { cookie }, body: form });
}

afterAll(async () => {
  // Temizlik şema sahibiyle: RLS yüzünden uygulama rolü kiracı bağlamı olmadan silemez.
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from property where title like 'Belge Test Daire%'");
    await admin.query("delete from person where full_name like 'Belge Malik%'");
    await admin.query("delete from document where filename like 'Belge%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("belge deposu", () => {
  it("belgeyi saklar, aynı dosyayı ikinci kez saklamaz (sha256)", async () => {
    const cookie = await login(AYSAN);

    const first = await upload(cookie, "Belge Tapu 01.pdf", "sabit-tapu-icerigi-1", {
      kind: "tapu",
      title: "Belge Tapu 01",
    });
    expect(first.status).toBe(201);
    const created = (await first.json()) as { id: string; duplicate: boolean };
    expect(created.duplicate).toBe(false);

    const second = await upload(cookie, "Belge Tapu 01 kopya.pdf", "sabit-tapu-icerigi-1", {
      kind: "tapu",
    });
    expect(second.status).toBe(201);
    const again = (await second.json()) as { id: string; duplicate: boolean };
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(created.id);

    const list = await app.request("/api/v1/documents", { headers: { cookie } });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      items: Array<{ id: string; kindLabel: string }>;
    };
    const row = body.items.find((d) => d.id === created.id);
    expect(row?.kindLabel).toBe("Tapu");
  });

  it("desteklenmeyen dosya türünü reddeder", async () => {
    const cookie = await login(AYSAN);
    const form = new FormData();
    form.append("file", new File(["x"], "Belge Kurulum.exe", { type: "application/x-msdownload" }));
    form.append("kind", "diger");
    const res = await app.request("/api/v1/documents", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(400);
  });
});

describe("otomatik eşleştirme", () => {
  it("öneri üretir, yetkisiz onaylayamaz, yetkili onaylayınca bağı kurar", async () => {
    const cookie = await login(AYSAN);

    const person = (await (
      await post("/api/v1/people?force=1", cookie, {
        fullName: "Belge Malik Sabit",
        kind: "owner",
      })
    ).json()) as { id: string };

    // Bağsız yükleme: dosya adında kişinin adı geçiyor
    const up = await upload(cookie, "Belge Malik Sabit tapu.pdf", "sabit-tapu-icerigi-2", {
      kind: "tapu",
    });
    expect(up.status).toBe(201);
    const { id, suggestions } = (await up.json()) as { id: string; suggestions: number };
    expect(suggestions).toBeGreaterThan(0);

    const detail = (await (
      await app.request(`/api/v1/documents/${id}`, { headers: { cookie } })
    ).json()) as {
      document: { personId: string | null };
      suggestions: Array<{ id: string; targetType: string; targetId: string; score: number }>;
    };
    expect(detail.document.personId).toBeNull();

    const suggestion = detail.suggestions.find(
      (s) => s.targetType === "person" && s.targetId === person.id,
    );
    expect(suggestion, "kişi için öneri yok").toBeTruthy();
    expect(suggestion!.score).toBeGreaterThanOrEqual(45);

    // Onay yetkisi olmayan ajan öneriyi kesinleştiremez (K-29)
    const agentCookie = await login(AGENT);
    const denied = await post(
      `/api/v1/documents/suggestions/${suggestion!.id}/approve`,
      agentCookie,
      {},
    );
    expect(denied.status).toBe(403);

    const ok = await post(`/api/v1/documents/suggestions/${suggestion!.id}/approve`, cookie, {});
    expect(ok.status).toBe(200);

    const after = (await (
      await app.request(`/api/v1/documents/${id}`, { headers: { cookie } })
    ).json()) as { document: { personId: string | null } };
    expect(after.document.personId).toBe(person.id);

    // Başka ofis ne kaydı ne dosyayı görür
    const bCookie = await login(B_OFIS);
    const foreign = await app.request(`/api/v1/documents/${id}`, { headers: { cookie: bCookie } });
    expect(foreign.status).toBe(404);
    const foreignFile = await app.request(`/api/v1/documents/${id}/file`, {
      headers: { cookie: bCookie },
    });
    expect(foreignFile.status).toBe(404);
  });
});

describe("ilan yayına alma", () => {
  it("eksik belgeyle yayına almaz, belgeler tamamlanınca alır ve fiyat geçmişi tutar", async () => {
    const cookie = await login(AYSAN);

    const owner = (await (
      await post("/api/v1/people?force=1", cookie, {
        fullName: "Belge Malik Ikinci",
        kind: "owner",
      })
    ).json()) as { id: string };

    const created = (await (
      await post("/api/v1/listings", cookie, {
        propertyTitle: "Belge Test Daire Satilik",
        ownerPersonId: owner.id,
        kind: "sale",
        priceKurus: 450_000_000,
        city: "İstanbul",
        district: "Kadıköy",
      })
    ).json()) as { id: string };

    const detail = (await (
      await app.request(`/api/v1/listings/${created.id}`, { headers: { cookie } })
    ).json()) as {
      listing: { status: string; price: string };
      requirements: Array<{ key: string; met: boolean }>;
      missing: string[];
      canPublish: boolean;
    };
    expect(detail.listing.status).toBe("draft");
    expect(detail.listing.price).toBe("4.500.000,00 ₺");
    expect(detail.canPublish).toBe(false);
    expect(detail.missing.sort()).toEqual(["kimlik", "tapu", "yetki"]);

    const blocked = await patch(`/api/v1/listings/${created.id}`, cookie, { status: "active" });
    expect(blocked.status).toBe(409);
    const blockedBody = (await blocked.json()) as { error: string };
    expect(blockedBody.error).toContain("eksik belge");

    // Belgeleri ilana bağlayarak yükle
    for (const [kind, content] of [
      ["tapu", "ilan-tapu-icerik"],
      ["kimlik", "ilan-kimlik-icerik"],
      ["yetki_belgesi", "ilan-yetki-icerik"],
    ] as const) {
      const res = await upload(cookie, `Belge İlan ${kind}.pdf`, content, {
        kind,
        listingId: created.id,
      });
      expect(res.status).toBe(201);
    }

    const published = await patch(`/api/v1/listings/${created.id}`, cookie, { status: "active" });
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as { forced: boolean };
    expect(publishedBody.forced).toBe(false);

    const priced = await patch(`/api/v1/listings/${created.id}`, cookie, {
      priceText: "4.300.000",
      note: "Pazarlık sonrası indirim",
    });
    expect(priced.status).toBe(200);

    const after = (await (
      await app.request(`/api/v1/listings/${created.id}`, { headers: { cookie } })
    ).json()) as {
      listing: { status: string; priceKurus: number; publishedAt: string | null };
      priceHistory: Array<{ oldKurus: number; newKurus: number; note: string | null }>;
      statusHistory: Array<{ fromStatus: string; toStatus: string }>;
      canPublish: boolean;
    };
    expect(after.listing.status).toBe("active");
    expect(after.listing.publishedAt).toBeTruthy();
    expect(after.canPublish).toBe(true);
    expect(after.priceHistory).toHaveLength(1);
    expect(after.priceHistory[0]!.oldKurus).toBe(450_000_000);
    expect(after.priceHistory[0]!.newKurus).toBe(430_000_000);
    expect(after.priceHistory[0]!.note).toBe("Pazarlık sonrası indirim");
    expect(after.statusHistory[0]).toMatchObject({ fromStatus: "draft", toStatus: "active" });

    // Kapanmış/açık ilanda geriye dönüş yok
    const backwards = await patch(`/api/v1/listings/${created.id}`, cookie, { status: "draft" });
    expect(backwards.status).toBe(409);
  });
});
