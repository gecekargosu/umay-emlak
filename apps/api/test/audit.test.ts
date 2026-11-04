/**
 * TUR:53 — işlem kaydı ucu.
 * Yazma isteği kayda düşer; kişi/tarih/arama süzgeçleri sunucuda çalışır.
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

type AuditBody = {
  items: Array<{
    path: string;
    action: string;
    userName: string | null;
    userId: string | null;
    ref: string | null;
  }>;
  users: Array<{ id: string; name: string }>;
  total: number;
};

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from handover_protocol where deduction_note like 'TEST%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("işlem kaydı", () => {
  it("yazmayı kaydeder, kişi ve arama süzgeciyle bulur", async () => {
    const cookie = await login();

    // Kayda düşecek bir yazma işlemi: kiralık sözleşmeye giriş tutanağı.
    const listings = (await (
      await app.request("/api/v1/listings?kind=rent&status=active", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };

    let contractId: string | null = null;
    for (const listing of listings.items.slice(0, 20)) {
      const board = (await (
        await app.request(`/api/v1/listings/${listing.id}/board`, { headers: { cookie } })
      ).json()) as { contract: { id: string } | null };
      if (board.contract) {
        contractId = board.contract.id;
        break;
      }
    }
    expect(contractId, "kiralık sözleşme bulunamadı").toBeTruthy();

    const created = await app.request(`/api/v1/contracts/${contractId}/handovers`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "move_in",
        happenedOn: "2026-11-05",
        items: [{ name: "Anahtar", quantity: 2 }],
        deductionNote: "TEST audit",
      }),
    });
    expect(created.status).toBe(201);

    const listed = await app.request("/api/v1/audit?q=handovers&limit=50", {
      headers: { cookie },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as AuditBody;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]!.path).toContain("/handovers");
    expect(body.items[0]!.userName).toBeTruthy();
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);

    // Kişi süzgeci: kendi kimliğiyle en az bir kayıt gelmeli.
    const userId = body.items[0]!.userId!;
    const mine = await app.request(`/api/v1/audit?userId=${userId}&limit=20`, {
      headers: { cookie },
    });
    const mineBody = (await mine.json()) as AuditBody;
    expect(mineBody.items.length).toBeGreaterThan(0);
    expect(mineBody.items.every((row) => row.userId === userId)).toBe(true);

    // Tarih süzgeci: bugünden sonrası boş olmalı.
    const future = await app.request("/api/v1/audit?from=2099-01-01", { headers: { cookie } });
    expect(((await future.json()) as AuditBody).items.length).toBe(0);
  });
});
