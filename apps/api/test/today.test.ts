/**
 * Y-10 kabul testi: "bugün ne yapılmalı" panosu.
 * Gecikmiş kira gerçekten listede mi, başka ofisin kaydı sızıyor mu?
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
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

function post(path: string, cookie: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    const scope = `select id from contract where listing_id in
                     (select id from listing where property_id in
                       (select id from property where title like 'Gunun Test%'))`;
    await admin.query(`delete from owner_payout where contract_id in (${scope})`);
    await admin.query(
      `delete from charge_notice where charge_id in (select id from charge where contract_id in (${scope}))`,
    );
    await admin.query(
      `delete from payment where charge_id in (select id from charge where contract_id in (${scope}))`,
    );
    await admin.query(`delete from charge where contract_id in (${scope})`);
    await admin.query(`delete from contract where listing_id in
                         (select id from listing where property_id in
                           (select id from property where title like 'Gunun Test%'))`);
    await admin.query(
      `delete from listing where property_id in (select id from property where title like 'Gunun Test%')`,
    );
    await admin.query("delete from property where title like 'Gunun Test%'");
    await admin.query("delete from person where full_name like 'Gunun Test%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("bugün ne yapılmalı", () => {
  it("gecikmiş kirayı iş olarak listeler, başka ofise sızdırmaz", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();

    const owner = await json<{ id: string }>(
      await post("/api/v1/people?force=1", cookie, {
        fullName: `Gunun Test Malik ${suffix}`,
        kind: "owner",
      }),
    );
    const tenantPerson = await json<{ id: string }>(
      await post("/api/v1/people?force=1", cookie, {
        fullName: `Gunun Test Kiraci ${suffix}`,
        kind: "tenant",
      }),
    );
    const listing = await json<{ id: string }>(
      await post("/api/v1/listings", cookie, {
        propertyTitle: `Gunun Test Daire ${suffix}`,
        ownerPersonId: owner.id,
        kind: "rent",
        priceKurus: 900_000,
      }),
    );
    const contract = await json<{ id: string }>(
      await post("/api/v1/contracts", cookie, {
        listingId: listing.id,
        tenantPersonId: tenantPerson.id,
        startDate: "2026-01-01",
        rentKurus: 900_000,
        dueDay: 5,
      }),
    );
    // Geçmiş dönem: vadesi çoktan geçti
    const charge = await post(`/api/v1/contracts/${contract.id}/charges`, cookie, {
      period: "2026-01-01",
    });
    expect(charge.status).toBe(200);

    const today = await json<{
      counts: { overdue: number; upcoming: number };
      upcoming: Array<{ kind: string; id: string; date: string; daysLeft: number; title: string }>;
      charges: { overdue: Array<{ tenantName: string; daysOverdue: number; level: string | null }> };
      month: { period: string; charged: string; collected: string };
      modules: {
        owners: { total: number; portfolio: number };
        properties: { total: number; occupied: number; empty: number; sale: number; rent: number };
        staff: { total: number; approvers: number };
        rent: { overdue: number; overdueFormatted: string };
        tasks: { open: number; urgent: number };
        notBuilt: string[];
      };
    }>(await app.request("/api/v1/today", { headers: { cookie } }));

    expect(today.counts.overdue).toBeGreaterThan(0);

    // TUR:57 — "bu ay bitecekler": sözleşme/poliçe/kira tek liste, tarihe göre sıralı.
    expect(Array.isArray(today.upcoming)).toBe(true);
    expect(today.counts.upcoming).toBe(today.upcoming.length);
    for (const row of today.upcoming) {
      expect(["contract", "policy", "rent"]).toContain(row.kind);
      expect(row.daysLeft).toBeLessThanOrEqual(30);
    }
    // Sıra: süresi geçenler en yeni önce, yaklaşanlar en yakın önce.
    const past = today.upcoming.filter((row) => row.daysLeft < 0).map((row) => row.date);
    const future = today.upcoming.filter((row) => row.daysLeft >= 0).map((row) => row.date);
    expect(past).toEqual([...past].sort().reverse());
    expect(future).toEqual([...future].sort());
    const row = today.charges.overdue.find((c) => c.tenantName.includes("Gunun Test Kiraci"));
    expect(row, "gecikmiş kira listede yok").toBeTruthy();
    expect(row!.daysOverdue).toBeGreaterThan(0);
    expect(row!.level).toBe("formal"); // 15 günden fazla gecikme

    // Ay özeti dolu gelir (panoda gösteriliyor)
    expect(today.month.period).toMatch(/^\d{4}-\d{2}-01$/);
    expect(today.month.charged).toContain(",");
    expect(today.month.collected).toContain(",");

    // Ana sayfa modülleri: gerçek sayımlar gelir, modülsüz kutular "yok" der.
    expect(today.modules.owners.total).toBeGreaterThan(0);
    expect(today.modules.staff.total).toBeGreaterThan(0);
    expect(today.modules.properties.total).toBeGreaterThan(0);
    expect(today.modules.rent.overdue).toBe(today.counts.overdue);
    // TUR:29 DASK, TUR:35 arıza/bakım açıldı; planlı kalan yalnız mesajlar.
    expect(today.modules.notBuilt).not.toContain("dask");
    expect(today.modules.notBuilt).not.toContain("tasks");
    expect(today.modules.notBuilt).toContain("messages");
    expect(today.modules.tasks.open).toBeGreaterThanOrEqual(0);

    // B ofisi aynı kiracıyı göremez
    const bCookie = await login(B_OFIS);
    const bToday = await json<{ charges: { overdue: Array<{ tenantName: string }> } }>(
      await app.request("/api/v1/today", { headers: { cookie: bCookie } }),
    );
    expect(
      bToday.charges.overdue.some((c) => c.tenantName.includes("Gunun Test Kiraci")),
    ).toBe(false);
  });
});
