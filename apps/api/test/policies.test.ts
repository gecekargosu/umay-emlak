/**
 * TUR:29 — DASK/poliçe bitiş takibi.
 * 30 gün içinde biten poliçe uyarıya düşer; süresi geçen "expired" olur.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";

async function login(): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: AYSAN, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from policy where note like 'TEST%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("poliçe bitiş takibi", () => {
  it("30 gün içinde biteni uyarıya, geçmişi süresi geçmişe koyar", async () => {
    const cookie = await login();
    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as { items: Array<{ propertyId: string }> };
    const propertyId = listings.items[0]!.propertyId;

    const soon = await app.request("/api/v1/policies", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        kind: "dask",
        insurer: "TEST Sigorta",
        policyNo: "TEST-1",
        startDate: iso(-360),
        endDate: iso(12),
        premiumText: "1.250",
        note: "TEST yakın bitiş",
      }),
    });
    expect(soon.status).toBe(201);
    const soonBody = (await soon.json()) as { daysLeft: number; warning: boolean; premiumKurus: number };
    expect(soonBody.daysLeft).toBe(12);
    expect(soonBody.warning).toBe(true);
    expect(soonBody.premiumKurus).toBe(125_000);

    const past = await app.request("/api/v1/policies", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        kind: "konut",
        endDate: iso(-5),
        note: "TEST geçmiş",
      }),
    });
    expect(past.status).toBe(201);
    const pastBody = (await past.json()) as { daysLeft: number; expired: boolean };
    expect(pastBody.daysLeft).toBe(-5);
    expect(pastBody.expired).toBe(true);

    const warning = (await (
      await app.request("/api/v1/policies?filter=warning", { headers: { cookie } })
    ).json()) as { items: Array<{ policyNo: string | null }> };
    expect(warning.items.some((row) => row.policyNo === "TEST-1")).toBe(true);

    const expired = (await (
      await app.request("/api/v1/policies?filter=expired", { headers: { cookie } })
    ).json()) as { items: Array<{ note: string | null; expired: boolean }> };
    expect(expired.items.every((row) => row.expired)).toBe(true);
    expect(expired.items.some((row) => row.note === "TEST geçmiş")).toBe(true);

    // Ana sayfa kutusu artık "planlı" değil: gerçek sayı dönüyor.
    const today = (await (
      await app.request("/api/v1/today", { headers: { cookie } })
    ).json()) as {
      modules: { dask: { total: number; warning: number }; notBuilt: string[] };
      counts: { policyWarnings: number };
    };
    expect(today.modules.dask.total).toBeGreaterThanOrEqual(2);
    expect(today.modules.dask.warning).toBeGreaterThanOrEqual(2);
    expect(today.modules.notBuilt).not.toContain("dask");
    expect(today.counts.policyWarnings).toBeGreaterThanOrEqual(2);
  });
});
