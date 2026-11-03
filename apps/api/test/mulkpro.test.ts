/**
 * MülkPro devir belgesinden gelen eksiklerin kabul testleri (TUR:16).
 * Y-53 snapshot · Y-54 aday CRM · Y-55 abonelik/demirbaş · Y-59 iletişim izni
 * · Y-60 yetki no · Y-58 boşta kilit şifre doğrulama · arama hatası düzeltmesi.
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

function send(path: string, cookie: string, method: string, body?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    const personScope = "select id from person where full_name like 'Mulk Test%'";
    const propertyScope = "select id from property where title like 'Mulk Test%'";
    const contractScope = `select id from contract where listing_id in
      (select id from listing where property_id in (${propertyScope}))`;
    const chargeScope = `select id from charge where contract_id in (${contractScope})`;
    await admin.query(`delete from person_note where person_id in (${personScope})`);
    await admin.query(
      `delete from property_subscription where property_id in (${propertyScope})`,
    );
    await admin.query(`delete from property_fixture where property_id in (${propertyScope})`);
    await admin.query(`delete from owner_payout where contract_id in (${contractScope})`);
    await admin.query(`delete from charge_notice where charge_id in (${chargeScope})`);
    await admin.query(`delete from payment where charge_id in (${chargeScope})`);
    await admin.query(`delete from charge where contract_id in (${contractScope})`);
    await admin.query(`delete from contract where id in (${contractScope})`);
    await admin.query(
      `delete from listing where property_id in (${propertyScope})`,
    );
    await admin.query(`delete from property_owner where property_id in (${propertyScope})`);
    await admin.query(`delete from property where title like 'Mulk Test%'`);
    await admin.query(`delete from person where full_name like 'Mulk Test%'`);
    await admin.query(
      `delete from session where user_id in (select id from app_user where email like 'mulk-test-%')`,
    );
    await admin.query(
      `delete from membership where user_id in (select id from app_user where email like 'mulk-test-%')`,
    );
    await admin.query(`delete from app_user where email like 'mulk-test-%'`);
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("MülkPro eksikleri", () => {
  it("sözleşme anlık görüntüsü kişi adı değişince bozulmaz", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();

    const owner = await json<{ id: string }>(
      await send("/api/v1/people?force=1", cookie, "POST", {
        fullName: `Mulk Test Malik ${suffix}`,
        kind: "owner",
      }),
    );
    const tenant = await json<{ id: string }>(
      await send("/api/v1/people?force=1", cookie, "POST", {
        fullName: `Mulk Test Kiraci ${suffix}`,
        kind: "tenant",
      }),
    );
    const listing = await json<{ id: string }>(
      await send("/api/v1/listings", cookie, "POST", {
        propertyTitle: `Mulk Test Daire ${suffix}`,
        ownerPersonId: owner.id,
        kind: "rent",
        priceKurus: 900_000,
      }),
    );
    const contract = await json<{ id: string }>(
      await send("/api/v1/contracts", cookie, "POST", {
        listingId: listing.id,
        tenantPersonId: tenant.id,
        startDate: "2026-02-01",
        rentText: "9.000",
        dueDay: 5,
      }),
    );

    // Kiracının adı sonradan değişiyor
    const renamed = await send(`/api/v1/people/${tenant.id}`, cookie, "PATCH", {
      fullName: `Mulk Test Kiraci DEGISTI ${suffix}`,
    });
    expect(renamed.status).toBe(200);

    const detail = await json<{
      contract: { snapshot: { tenant: { fullName: string }; terms: { rentKurus: number } } | null };
    }>(await app.request(`/api/v1/contracts/${contract.id}`, { headers: { cookie } }));

    expect(detail.contract.snapshot).toBeTruthy();
    expect(detail.contract.snapshot!.tenant.fullName).toContain("Mulk Test Kiraci");
    expect(detail.contract.snapshot!.tenant.fullName).not.toContain("DEGISTI");
    expect(detail.contract.snapshot!.terms.rentKurus).toBe(900_000);

    // Tahliye taahhüdü şablonu dondurulmuş adla üretilir
    const output = await app.request(`/api/v1/contracts/${contract.id}/output/tahliye`, {
      headers: { cookie },
    });
    expect(output.status).toBe(200);
    const html = await output.text();
    expect(html).toContain("TAHLİYE TAAHHÜDÜ");
    expect(html).not.toContain("DEGISTI");
  });

  it("aday CRM alanları, görüşme notu ve iletişim izni kaydedilir", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();

    const candidate = await json<{ id: string }>(
      await send("/api/v1/people?force=1", cookie, "POST", {
        fullName: `Mulk Test Aday ${suffix}`,
        kind: "candidate",
      }),
    );

    const patched = await send(`/api/v1/people/${candidate.id}`, cookie, "PATCH", {
      candidateStage: "viewing",
      followUpDate: "2026-12-01",
      budgetText: "5.000.000",
      wantsDistrict: "Kadıköy",
      wantsRoomCount: "2+1",
      contactPermission: "denied",
      contactPermissionNote: "Telefonla aranmak istemiyor",
    });
    expect(patched.status).toBe(200);

    const detail = await json<{
      person: {
        candidateStage: string | null;
        budgetKurus: number | null;
        wantsDistrict: string | null;
        contactPermission: string;
      };
    }>(await app.request(`/api/v1/people/${candidate.id}`, { headers: { cookie } }));

    expect(detail.person.candidateStage).toBe("viewing");
    expect(detail.person.budgetKurus).toBe(500_000_000);
    expect(detail.person.wantsDistrict).toBe("Kadıköy");
    expect(detail.person.contactPermission).toBe("denied");

    const note = await send(`/api/v1/people/${candidate.id}/notes`, cookie, "POST", {
      body: "Kadıköy 2+1 baktı, bütçe 5 milyon.",
    });
    expect(note.status).toBe(201);

    const notes = await json<{ items: Array<{ body: string; author: string }> }>(
      await app.request(`/api/v1/people/${candidate.id}/notes`, { headers: { cookie } }),
    );
    expect(notes.items).toHaveLength(1);
    expect(notes.items[0]!.body).toContain("2+1");
  });

  it("ilan yetki numarası kaydedilir", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();
    const owner = await json<{ id: string }>(
      await send("/api/v1/people?force=1", cookie, "POST", {
        fullName: `Mulk Test Yetki Malik ${suffix}`,
        kind: "owner",
      }),
    );
    const listing = await json<{ id: string }>(
      await send("/api/v1/listings", cookie, "POST", {
        propertyTitle: `Mulk Test Yetki Daire ${suffix}`,
        ownerPersonId: owner.id,
        kind: "sale",
        priceKurus: 5_000_000_00,
      }),
    );

    const patched = await send(`/api/v1/listings/${listing.id}/authority`, cookie, "PATCH", {
      authorityNo: "EİDS-TEST-1",
    });
    expect(patched.status).toBe(200);

    const detail = await json<{ listing: { authorityNo: string | null } }>(
      await app.request(`/api/v1/listings/${listing.id}`, { headers: { cookie } }),
    );
    expect(detail.listing.authorityNo).toBe("EİDS-TEST-1");
  });

  it("mülk aboneliği ve demirbaş eklenir, başka ofise sızmaz", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();
    const owner = await json<{ id: string }>(
      await send("/api/v1/people?force=1", cookie, "POST", {
        fullName: `Mulk Test Abone Malik ${suffix}`,
        kind: "owner",
      }),
    );
    const listing = await json<{ id: string }>(
      await send("/api/v1/listings", cookie, "POST", {
        propertyTitle: `Mulk Test Abone Daire ${suffix}`,
        ownerPersonId: owner.id,
        kind: "rent",
        priceKurus: 800_000,
      }),
    );
    const detail = await json<{ listing: { propertyId: string } }>(
      await app.request(`/api/v1/listings/${listing.id}`, { headers: { cookie } }),
    );
    const propertyId = detail.listing.propertyId;

    expect(
      (
        await send(`/api/v1/properties/${propertyId}/subscriptions`, cookie, "POST", {
          kind: "elektrik",
          provider: "Enerjisa",
          monthlyText: "450",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send(`/api/v1/properties/${propertyId}/fixtures`, cookie, "POST", {
          name: "Klima",
          quantity: 2,
        })
      ).status,
    ).toBe(201);

    const assets = await json<{
      subscriptions: Array<{ kind: string; monthly: string | null }>;
      fixtures: Array<{ name: string; quantity: number }>;
    }>(await app.request(`/api/v1/properties/${propertyId}/assets`, { headers: { cookie } }));
    expect(assets.subscriptions[0]!.kind).toBe("elektrik");
    expect(assets.fixtures[0]!.name).toBe("Klima");

    // Başka ofis göremez
    const bCookie = await login(B_OFIS);
    const foreign = await app.request(`/api/v1/properties/${propertyId}/assets`, {
      headers: { cookie: bCookie },
    });
    expect(foreign.status).toBe(404);
  });

  it("boşta kilit şifre doğrulaması çalışır", async () => {
    const cookie = await login(AYSAN);
    expect((await send("/api/v1/auth/verify-password", cookie, "POST", { password: PASSWORD })).status).toBe(200);
    expect(
      (await send("/api/v1/auth/verify-password", cookie, "POST", { password: "yanlis-sifre" })).status,
    ).toBe(401);
  });

  it("isim araması telefonu olan herkesi döndürmez", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();
    await send("/api/v1/people?force=1", cookie, "POST", {
      fullName: `Mulk Test Arama Bir ${suffix}`,
      kind: "owner",
      phone: "0532 111 22 33",
    });
    await send("/api/v1/people?force=1", cookie, "POST", {
      fullName: `Mulk Test Arama Iki ${suffix}`,
      kind: "owner",
      phone: "0532 444 55 66",
    });

    const found = await json<{ items: Array<{ fullName: string }> }>(
      await app.request(`/api/v1/people?q=${encodeURIComponent(`Arama Bir ${suffix}`)}`, {
        headers: { cookie },
      }),
    );
    expect(found.items).toHaveLength(1);
    expect(found.items[0]!.fullName).toContain("Arama Bir");
  });

  it("geçici şifreli personel şifresini değiştirmeden veriye giremez", async () => {
    const ownerCookie = await login(AYSAN);
    const email = `mulk-test-${Date.now()}@umay-emlak.local`;

    const created = await json<{ tempPassword?: string }>(
      await send("/api/v1/team", ownerCookie, "POST", {
        fullName: "Mulk Test Personel",
        email,
        role: "agent",
      }),
    );
    expect(created.tempPassword).toBeTruthy();

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: created.tempPassword }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0]!;

    // Şifre değişmeden veri uçları kilitli
    expect((await app.request("/api/v1/people", { headers: { cookie } })).status).toBe(403);

    // Kısa şifre reddedilir
    expect(
      (
        await send("/api/v1/auth/change-password", cookie, "POST", {
          currentPassword: created.tempPassword,
          newPassword: "kisa",
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await send("/api/v1/auth/change-password", cookie, "POST", {
          currentPassword: created.tempPassword,
          newPassword: "YeniSifre!2026",
        })
      ).status,
    ).toBe(200);

    // Artık veriye girebiliyor
    expect((await app.request("/api/v1/people", { headers: { cookie } })).status).toBe(200);
    const session = await json<{ mustChangePassword: boolean }>(
      await app.request("/api/v1/auth/session", { headers: { cookie } }),
    );
    expect(session.mustChangePassword).toBe(false);
  });
});
