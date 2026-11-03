/**
 * DİLİM 4-5 KABUL TESTLERİ (kira hattı).
 * Sözleşme açma → ilanın kapanması → aylık tahakkuk (tekrar üretmeme) →
 * tahsilat (elden nakitte teslim alan zorunlu, fazla ödeme reddi, kısmi ödeme)
 * → mal sahibine dönem aktarımı ve ekstre.
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
                       (select id from property where title like 'Kira Test%'))`;
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
                           (select id from property where title like 'Kira Test%'))`);
    await admin.query(
      `delete from listing where property_id in (select id from property where title like 'Kira Test%')`,
    );
    await admin.query("delete from property where title like 'Kira Test%'");
    await admin.query("delete from person where full_name like 'Kira Test%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("kira hattı", () => {
  it("sözleşme açar, ilanı kapatır, tahakkuku bir kez üretir; tahsilat kuralları işler", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();

    const owner = await json<{ id: string }>(
      await post("/api/v1/people?force=1", cookie, {
        fullName: `Kira Test Malik ${suffix}`,
        kind: "owner",
      }),
    );
    const tenantPerson = await json<{ id: string }>(
      await post("/api/v1/people?force=1", cookie, {
        fullName: `Kira Test Kiraci ${suffix}`,
        kind: "tenant",
      }),
    );

    const listing = await json<{ id: string }>(
      await post("/api/v1/listings", cookie, {
        propertyTitle: `Kira Test Daire ${suffix}`,
        ownerPersonId: owner.id,
        kind: "rent",
        priceKurus: 1_850_000,
        city: "İstanbul",
        district: "Kadıköy",
      }),
    );

    const created = await post("/api/v1/contracts", cookie, {
      listingId: listing.id,
      tenantPersonId: tenantPerson.id,
      startDate: "2026-11-01",
      rentText: "18.500",
      depositText: "37.000",
      dueDay: 5,
    });
    expect(created.status).toBe(201);
    const { id: contractId } = await json<{ id: string }>(created);

    const detail = await json<{
      contract: { rent: string; deposit: string; dueDay: number; depositRentCount: number };
      tenant: { fullName: string };
    }>(await app.request(`/api/v1/contracts/${contractId}`, { headers: { cookie } }));
    expect(detail.contract.rent).toBe("18.500,00 ₺");
    expect(detail.contract.depositRentCount).toBe(2);
    expect(detail.tenant.fullName).toContain("Kira Test Kiraci");

    // Sözleşme imzalanınca ilan kapanır (K-17)
    const afterListing = await json<{ listing: { status: string } }>(
      await app.request(`/api/v1/listings/${listing.id}`, { headers: { cookie } }),
    );
    expect(afterListing.listing.status).toBe("closed");

    // İkinci sözleşme aynı ilana açılamaz
    const twice = await post("/api/v1/contracts", cookie, {
      listingId: listing.id,
      tenantPersonId: tenantPerson.id,
      startDate: "2026-12-01",
      rentKurus: 1_850_000,
    });
    expect(twice.status).toBe(409);

    // Tahakkuk: tek seferlik
    const chargeFirst = await json<{ created: boolean; dueDate: string }>(
      await post(`/api/v1/contracts/${contractId}/charges`, cookie, { period: "2026-11-01" }),
    );
    expect(chargeFirst.created).toBe(true);
    expect(chargeFirst.dueDate).toBe("2026-11-05");

    const chargeAgain = await json<{ created: boolean }>(
      await post(`/api/v1/contracts/${contractId}/charges`, cookie, { period: "2026-11-01" }),
    );
    expect(chargeAgain.created).toBe(false);

    const list = await json<{ items: Array<{ id: string; amountKurus: number; remainingKurus: number }> }>(
      await app.request("/api/v1/charges?scope=all", { headers: { cookie } }),
    );
    // Kendi sözleşmemizin tahakkukunu bul (demo veride de aynı tutar var)
    const charge = list.items.find((i) => i.contractId === contractId);
    expect(charge, "tahakkuk listede yok").toBeTruthy();

    // Elden nakit: teslim alan zorunlu (K-21)
    const cashNoName = await post(`/api/v1/charges/${charge!.id}/payments`, cookie, {
      amountText: "10.000",
      method: "cash_office",
    });
    expect(cashNoName.status).toBe(400);

    // Kısmi ödeme
    const partial = await json<{ status: string; remaining: string }>(
      await post(`/api/v1/charges/${charge!.id}/payments`, cookie, {
        amountText: "10.000",
        method: "transfer",
      }),
    );
    expect(partial.status).toBe("partial");
    expect(partial.remaining).toBe("8.500,00 ₺");

    // Fazla ödeme reddedilir
    const tooMuch = await post(`/api/v1/charges/${charge!.id}/payments`, cookie, {
      amountText: "9.000",
      method: "transfer",
    });
    expect(tooMuch.status).toBe(400);

    // Kalanı elden, teslim alan yazılı
    const complete = await json<{ status: string; remaining: string }>(
      await post(`/api/v1/charges/${charge!.id}/payments`, cookie, {
        amountText: "8.500",
        method: "cash_office",
        receivedByName: "Aysan Kılıç",
      }),
    );
    expect(complete.status).toBe("paid");
    expect(complete.remaining).toBe("0,00 ₺");

    const chargeDetail = await json<{ payments: unknown[]; charge: { status: string } }>(
      await app.request(`/api/v1/charges/${charge!.id}`, { headers: { cookie } }),
    );
    expect(chargeDetail.charge.status).toBe("paid");
    expect(chargeDetail.payments).toHaveLength(2);

    // Mal sahibine aktarım: tahsil edilenden, takip bedeli düşülerek
    const preview = await json<{ items: Array<{ contractId: string; grossKurus: number }> }>(
      await app.request("/api/v1/payouts/preview?period=2026-11-01", { headers: { cookie } }),
    );
    const row = preview.items.find((i) => i.contractId === contractId);
    expect(row?.grossKurus).toBe(1_850_000);

    const payout = await post("/api/v1/payouts", cookie, {
      contractId,
      period: "2026-11-01",
      feeText: "2.000",
      markPaid: true,
      note: "Kasım aktarımı",
    });
    expect(payout.status).toBe(201);
    const payoutBody = await json<{ id: string; net: string }>(payout);
    expect(payoutBody.net).toBe("16.500,00 ₺");

    // Aynı dönem ikinci aktarım açılmaz
    const duplicate = await post("/api/v1/payouts", cookie, {
      contractId,
      period: "2026-11-01",
      feeKurus: 0,
    });
    expect(duplicate.status).toBe(409);

    const statement = await app.request(`/api/v1/payouts/${payoutBody.id}/statement`, {
      headers: { cookie },
    });
    expect(statement.status).toBe(200);
    const html = await statement.text();
    expect(html).toContain("MAL SAHİBİ AKTARIM EKSTRESİ");
    expect(html).toContain("16.500,00");

    // Kiracı izolasyonu: B ofisi sözleşmeyi göremez
    const bCookie = await login(B_OFIS);
    const foreign = await app.request(`/api/v1/contracts/${contractId}`, {
      headers: { cookie: bCookie },
    });
    expect(foreign.status).toBe(404);
  });
});
