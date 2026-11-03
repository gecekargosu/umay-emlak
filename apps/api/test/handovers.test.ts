/**
 * TUR:28 — teslim tutanağı.
 * Çıkışta iade = depozito − kesinti; giriş tutanağında iade 0.
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

describe("teslim tutanağı", () => {
  it("çıkışta iadeyi depozito eksi kesinti olarak hesaplar", async () => {
    const cookie = await login();
    const listings = (await (
      await app.request("/api/v1/listings?kind=rent&status=active", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };

    let contractId: string | null = null;
    let depositKurus = 0;
    for (const listing of listings.items.slice(0, 20)) {
      const board = (await (
        await app.request(`/api/v1/listings/${listing.id}/board`, { headers: { cookie } })
      ).json()) as {
        contract: { id: string; depositKurus: number } | null;
      };
      if (board.contract && board.contract.depositKurus > 0) {
        contractId = board.contract.id;
        depositKurus = board.contract.depositKurus;
        break;
      }
    }
    expect(contractId, "depozitol u sözleşme bulunamadı").toBeTruthy();

    const created = await app.request(`/api/v1/contracts/${contractId}/handovers`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "move_out",
        happenedOn: "2026-11-04",
        items: [{ name: "Klima", quantity: 1, condition: "sağlam" }],
        deductionText: "2.500",
        deductionNote: "TEST kesinti",
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { refundKurus: number; deductionKurus: number };
    expect(body.deductionKurus).toBe(250_000);
    expect(body.refundKurus).toBe(Math.max(0, depositKurus - 250_000));

    const list = (await (
      await app.request(`/api/v1/contracts/${contractId}/handovers`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; kindLabel: string }> };
    expect(list.items.some((row) => row.kindLabel === "Çıkış")).toBe(true);
  });
});
