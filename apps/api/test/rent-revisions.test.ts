/**
 * TUR:30 — kira artışı / yenileme (SIRA 4).
 * Taslak hesaplanır, yetkili onaylayınca sözleşme kirası güncellenir ve dönem tahakkuku açılır.
 * Test 2030-01 dönemini kullanır ve sonunda temizler (demo verisi bozulmasın).
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const PERIOD = "2030-01-01";

let touchedContract: string | null = null;
let originalRent = 0;

async function login(): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: AYSAN, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from rent_revision where effective_period = $1::date", [PERIOD]);
    await admin.query("delete from charge where period = $1::date and kind = 'rent'", [PERIOD]);
    if (touchedContract) {
      await admin.query("update contract set rent_kurus = $2 where id = $1::uuid", [
        touchedContract,
        originalRent,
      ]);
    }
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("kira artışı", () => {
  it("TÜİK oranıyla taslak üretir, onayda sözleşme kirasını günceller", async () => {
    const cookie = await login();
    const contracts = (await (
      await app.request("/api/v1/contracts", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; status: string }> };
    const active = contracts.items.find((c) => c.status === "active");
    expect(active, "aktif sözleşme yok").toBeTruthy();
    touchedContract = active!.id;

    const before = (await (
      await app.request(`/api/v1/contracts/${active!.id}/rent-revisions`, { headers: { cookie } })
    ).json()) as { contract: { rentKurus: number }; items: Array<{ id: string }> };
    originalRent = before.contract.rentKurus;
    expect(before.items.length).toBe(0);

    const draftRes = await app.request(`/api/v1/contracts/${active!.id}/rent-revisions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        effectivePeriod: PERIOD,
        rateText: "25,5",
        source: "tuik",
        sourceNote: "TEST TÜİK bülteni",
      }),
    });
    expect(draftRes.status).toBe(201);
    const draft = (await draftRes.json()) as {
      id: string;
      oldRentKurus: number;
      rateBp: number;
      newRentKurus: number;
      status: string;
    };
    expect(draft.rateBp).toBe(2550);
    expect(draft.oldRentKurus).toBe(originalRent);
    expect(draft.newRentKurus).toBe(Math.round((originalRent * 12_550) / 10_000));
    expect(draft.status).toBe("proposed");

    // Aynı dönem ikinci kez açılmaz.
    const duplicate = await app.request(`/api/v1/contracts/${active!.id}/rent-revisions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ effectivePeriod: PERIOD, rateText: "10" }),
    });
    expect(duplicate.status).toBe(409);

    const approved = await app.request(`/api/v1/rent-revisions/${draft.id}/approve`, {
      method: "POST",
      headers: { cookie },
    });
    expect(approved.status).toBe(200);
    const approvedBody = (await approved.json()) as { newRentKurus: number };
    expect(approvedBody.newRentKurus).toBe(draft.newRentKurus);

    const detail = (await (
      await app.request(`/api/v1/contracts/${active!.id}`, { headers: { cookie } })
    ).json()) as { contract: { rentKurus: number }; charges: Array<{ period: string }> };
    expect(detail.contract.rentKurus).toBe(draft.newRentKurus);
    expect(detail.charges.some((row) => row.period === PERIOD)).toBe(true);

    const list = (await (
      await app.request(`/api/v1/contracts/${active!.id}/rent-revisions`, { headers: { cookie } })
    ).json()) as { items: Array<{ status: string; rateText: string }> };
    expect(list.items[0]?.status).toBe("approved");
    expect(list.items[0]?.rateText).toBe("%25,5");
  });
});
