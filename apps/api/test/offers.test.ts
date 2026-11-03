/**
 * TUR:24 — teklif / görüşme kaydı (kullanıcı isteği: "müşteriyle görüştüm, teklifini
 * sisteme girdim; satılık ilan için biriyle görüştüm, not edebilmeliyim").
 * Teklif silinmez, durumu değişir.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const BIDDER = "Test Teklif Musterisi";

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
    await admin.query("delete from offer where bidder_name = $1", [BIDDER]);
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("teklif kaydı", () => {
  it("ilan için teklif ekler, listeler ve durum değiştirir", async () => {
    const cookie = await login();
    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };
    const listingId = listings.items[0]!.id;

    const created = await app.request("/api/v1/offers", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        listingId,
        bidderName: BIDDER,
        bidderPhone: "0500 000 00 00",
        amountText: "1.250.000",
        note: "telefonla görüşüldü, pazarlık devam ediyor",
      }),
    });
    expect(created.status).toBe(201);
    const offer = (await created.json()) as { id: string; amountKurus: number; status: string };
    expect(offer.amountKurus).toBe(125_000_000);
    expect(offer.status).toBe("received");

    const list = (await (
      await app.request(`/api/v1/offers?listingId=${listingId}`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; bidderName: string }> };
    expect(list.items.some((row) => row.id === offer.id)).toBe(true);

    const patched = await app.request(`/api/v1/offers/${offer.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "negotiating" }),
    });
    expect(patched.status).toBe(200);

    const after = (await (
      await app.request(`/api/v1/offers?listingId=${listingId}`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; status: string }> };
    expect(after.items.find((row) => row.id === offer.id)?.status).toBe("negotiating");
  });

  it("tutar bozuksa 400 döner", async () => {
    const cookie = await login();
    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };

    const res = await app.request("/api/v1/offers", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        listingId: listings.items[0]!.id,
        bidderName: BIDDER,
        amountText: "abc",
      }),
    });
    expect(res.status).toBe(400);
  });
});
