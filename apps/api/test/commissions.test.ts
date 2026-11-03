/**
 * TUR:25 — komisyon (%3) ve kapora.
 * Kural: indirimli komisyonda gerekçe zorunlu; kapora alınınca ilan kaporalı,
 * iade edilince yeniden aktif.
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

async function firstActiveListing(cookie: string): Promise<{ id: string; priceKurus: number }> {
  const data = (await (
    await app.request("/api/v1/listings?status=active", { headers: { cookie } })
  ).json()) as { items: Array<{ id: string; priceKurus: number }> };
  return data.items[0]!;
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from commission where discount_reason like 'TEST%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("komisyon ve kapora", () => {
  it("varsayılan %3 komisyonu hesaplar, indirimde gerekçe ister, onaylar", async () => {
    const cookie = await login();
    const listing = await firstActiveListing(cookie);

    const created = await app.request(`/api/v1/listings/${listing.id}/commissions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(created.status).toBe(201);
    const commission = (await created.json()) as { id: string; amountKurus: number };
    expect(commission.amountKurus).toBe(Math.round((listing.priceKurus * 300) / 10000));

    // %3'ün altında tutar → gerekçe zorunlu
    const discounted = await app.request(`/api/v1/listings/${listing.id}/commissions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ amountText: "1.000" }),
    });
    expect(discounted.status).toBe(400);

    const withReason = await app.request(`/api/v1/listings/${listing.id}/commissions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ amountText: "1.000", discountReason: "TEST indirim" }),
    });
    expect(withReason.status).toBe(201);

    const approved = await app.request(`/api/v1/commissions/${commission.id}/approve`, {
      method: "POST",
      headers: { cookie },
    });
    expect(approved.status).toBe(200);

    const list = (await (
      await app.request(`/api/v1/listings/${listing.id}/commissions`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; status: string }> };
    expect(list.items.find((row) => row.id === commission.id)?.status).toBe("approved");
  });

  it("kapora alınınca ilan kaporalıya düşer, iade edilince aktife döner", async () => {
    const cookie = await login();
    const listing = await firstActiveListing(cookie);

    const deposit = await app.request(`/api/v1/listings/${listing.id}/deposit`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ amountText: "25.000" }),
    });
    expect(deposit.status).toBe(200);
    const taken = (await deposit.json()) as { status: string; amountKurus: number };
    expect(taken.amountKurus).toBe(2_500_000);
    expect(taken.status).toBe("reserved");

    const after = (await (
      await app.request(`/api/v1/listings/${listing.id}/commissions`, { headers: { cookie } })
    ).json()) as { listing: { status: string }; deposit: { amountKurus: number } };
    expect(after.listing.status).toBe("reserved");
    expect(after.deposit.amountKurus).toBe(2_500_000);

    const released = await app.request(`/api/v1/listings/${listing.id}/deposit`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ release: true }),
    });
    expect(released.status).toBe(200);

    const finalState = (await (
      await app.request(`/api/v1/listings/${listing.id}/commissions`, { headers: { cookie } })
    ).json()) as { listing: { status: string }; deposit: { amountKurus: number } };
    expect(finalState.listing.status).toBe("active");
    expect(finalState.deposit.amountKurus).toBe(0);
  });
});
