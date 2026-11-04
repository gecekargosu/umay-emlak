/**
 * TUR:55 — kiracı talep bağlantısı.
 * Ofis jeton üretir; kiracı giriş yapmadan arıza bildirir; iptal edilen jeton iş görmez.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const TITLE = "TEST kiracı bağlantısı arızası";
/** Testin ürettiği bağlantı: temizlikte yalnız bu silinir, elle kurulan bağlantılar kalır. */
let createdLinkId: string | null = null;

async function login(): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: AYSAN, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

async function findContract(cookie: string): Promise<string> {
  const listings = (await (
    await app.request("/api/v1/listings?kind=rent&status=active", { headers: { cookie } })
  ).json()) as { items: Array<{ id: string }> };

  for (const listing of listings.items.slice(0, 20)) {
    const board = (await (
      await app.request(`/api/v1/listings/${listing.id}/board`, { headers: { cookie } })
    ).json()) as { contract: { id: string } | null };
    if (board.contract) return board.contract.id;
  }
  throw new Error("kiralık sözleşme bulunamadı");
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from property_media where maintenance_id in (select id from maintenance_request where title like 'TEST kiracı%')");
    await admin.query("delete from maintenance_request where title like 'TEST kiracı%'");
    if (createdLinkId) {
      await admin.query("delete from tenant_access_link where id = $1", [createdLinkId]);
    }
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("kiracı talep bağlantısı", () => {
  it("jetonla girişsiz bildirim alır, iptal edilince kapanır", async () => {
    const cookie = await login();
    const contractId = await findContract(cookie);

    const created = await app.request(`/api/v1/contracts/${contractId}/tenant-links`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    });
    expect(created.status).toBe(201);
    const link = (await created.json()) as { id: string; token: string; expiresOn: string };
    expect(link.token.length).toBeGreaterThanOrEqual(16);
    expect(link.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    createdLinkId = link.id;

    const publicRes = await app.request(`/api/v1/public/tenant/${link.token}`);
    expect(publicRes.status).toBe(200);
    const info = (await publicRes.json()) as { title: string; tenantName: string };
    expect(info.title.length).toBeGreaterThan(0);
    expect(info.tenantName.length).toBeGreaterThan(0);

    const report = await app.request(`/api/v1/public/tenant/${link.token}/maintenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: TITLE, description: "TEST", category: "plumbing", priority: "urgent" }),
    });
    expect(report.status).toBe(201);

    // Talep ofisin listesinde görünmeli.
    const list = (await (
      await app.request("/api/v1/maintenance?status=open", { headers: { cookie } })
    ).json()) as { items: Array<{ title: string }> };
    expect(list.items.some((row) => row.title === TITLE)).toBe(true);

    // Bağlantı listesi kullanımı gösterir.
    const links = (await (
      await app.request(`/api/v1/contracts/${contractId}/tenant-links`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; useCount: number; active: boolean }> };
    const mine = links.items.find((row) => row.id === link.id);
    expect(mine?.useCount).toBe(1);
    expect(mine?.active).toBe(true);

    // İptal sonrası jeton iş görmez.
    const revoked = await app.request(
      `/api/v1/contracts/${contractId}/tenant-links/${link.id}`,
      { method: "DELETE", headers: { cookie } },
    );
    expect(revoked.status).toBe(200);
    const after = await app.request(`/api/v1/public/tenant/${link.token}`);
    expect(after.status).toBe(404);

    // Uydurma jeton da 404.
    const fake = await app.request("/api/v1/public/tenant/aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(fake.status).toBe(404);
  });
});
