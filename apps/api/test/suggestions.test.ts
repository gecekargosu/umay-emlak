/**
 * TUR:33 — adaya uygun portföy önerisi (SIRA 6).
 * Puan gerekçeli döner; kriter yoksa liste boş kalır.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const NAME = "TEST Aday Öneri";
let personId: string | null = null;

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
    if (personId) await admin.query("delete from person where id = $1::uuid", [personId]);
    await admin.query("delete from person where full_name like $1", [`${NAME}%`]);
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("portföy önerisi", () => {
  it("ilçe + oda + bütçe ile puanlar ve gerekçe döner", async () => {
    const cookie = await login();

    // Demo veriden bir ilçe ve oda tipi seç (adayın isteği gerçek portföyle eşleşsin).
    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as {
      items: Array<{ district: string | null; roomCount: string | null; priceKurus: number }>;
    };
    const sample = listings.items.find(
      (row) => row.district && row.roomCount && row.priceKurus > 0,
    );
    expect(sample, "demo ilan yok").toBeTruthy();

    const created = await app.request("/api/v1/people?force=1", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "candidate",
        fullName: `${NAME} ${Date.now()}`,
        phone: "0555 000 00 00",
        budgetText: (sample!.priceKurus * 2 / 100).toFixed(2),
        wantsDistrict: sample!.district,
        wantsRoomCount: sample!.roomCount,
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };
    personId = body.id;

    const res = await app.request(`/api/v1/people/${body.id}/suggestions`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      hasCriteria: boolean;
      count: number;
      items: Array<{ score: number; reasons: string[]; district: string | null }>;
    };
    expect(data.hasCriteria).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.items[0]!.score).toBeGreaterThan(0);
    expect(data.items[0]!.reasons.length).toBeGreaterThan(0);
    expect(data.items[0]!.district).toBe(sample!.district);
    // Puan sıralı gelmeli
    for (let i = 1; i < data.items.length; i++) {
      expect(data.items[i - 1]!.score).toBeGreaterThanOrEqual(data.items[i]!.score);
    }
  });

  it("kriteri olmayan aday için boş liste ve hasCriteria=false döner", async () => {
    const cookie = await login();
    const created = await app.request("/api/v1/people?force=1", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "candidate", fullName: `${NAME} kriter ${Date.now()}` }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };

    const res = await app.request(`/api/v1/people/${body.id}/suggestions`, {
      headers: { cookie },
    });
    const data = (await res.json()) as { hasCriteria: boolean; count: number };
    expect(data.hasCriteria).toBe(false);
    expect(data.count).toBe(0);

    const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
    await admin.connect();
    await admin.query("delete from person where id = $1::uuid", [body.id]);
    await admin.end();
  });
});
