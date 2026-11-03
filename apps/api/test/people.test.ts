/**
 * DİLİM 2 KABUL TESTLERİ.
 * Kişi kaydı, mükerrer uyarısı, birleştirme (silmeden), hisseli malik,
 * Excel/CSV içe aktarma ve tekrar aktarımın mükerrer açmaması.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "@umay/db";
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

async function post(path: string, cookie: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function csvFile(rows: string[]): FormData {
  const content = rows.join("\n");
  const form = new FormData();
  form.append("file", new File([content], "kisiler.csv", { type: "text/csv" }));
  return form;
}

afterAll(async () => {
  // Temizlik ŞEMA SAHİBİYLE yapılır: uygulama rolünde RLS vardır ve
  // kiracı bağlamı olmadan hiçbir satır silinemez (bu bir koruma, hata değil).
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(
      `delete from property
        where title like any (array['Aktarim%','Birlesme%','Hisseli%','Askin Hisse%'])`,
    );
    await admin.query(
      `delete from person
        where full_name like any (array['Aktarim%','Test Malik%','Gizli Kisi%',
                                        'Mukerrer%','Dogru Kayit%','Hissedar%'])`,
    );
    await admin.query("delete from import_batch where filename = 'kisiler.csv'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("kişi kaydı", () => {
  it("kişi ekler ve aynı telefonla ikinci kez eklerken uyarır", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();
    const person = {
      fullName: `Test Malik ${suffix}`,
      kind: "owner",
      // Her koşuda farklı numara: mükerrer kontrolü aynı koşu içinde sınanır
      phone: `0555${String(suffix).slice(-7)}`,
    };

    const first = await post("/api/v1/people", cookie, person);
    expect(first.status).toBe(201);

    const second = await post("/api/v1/people", cookie, person);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { duplicate?: { id: string } };
    expect(body.duplicate?.id).toBeTruthy();

    // Zorla eklenebilir (aynı ad iki farklı kişi olabilir)
    const forced = await post("/api/v1/people?force=1", cookie, {
      ...person,
      fullName: `${person.fullName} 2`,
    });
    expect(forced.status).toBe(201);
  });

  it("başka ofisin kişisi görünmez (404)", async () => {
    const a = await login(AYSAN);
    const created = await post("/api/v1/people", a, {
      fullName: `Gizli Kisi ${Date.now()}`,
      kind: "tenant",
    });
    const { id } = (await created.json()) as { id: string };

    const b = await login(B_OFIS);
    const res = await app.request(`/api/v1/people/${id}`, { headers: { cookie: b } });
    expect(res.status).toBe(404);
  });
});

describe("birleştirme", () => {
  it("kaybeden kayıt silinmez, mülkleri kazanana taşınır", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();

    const loser = (await (
      await post("/api/v1/people", cookie, { fullName: `Mukerrer ${suffix}`, kind: "owner" })
    ).json()) as { id: string };
    const winner = (await (
      await post("/api/v1/people", cookie, { fullName: `Dogru Kayit ${suffix}`, kind: "owner" })
    ).json()) as { id: string };

    const property = (await (
      await post("/api/v1/properties", cookie, {
        title: `Birlesme Dairesi ${suffix}`,
        owners: [{ personId: loser.id }],
      })
    ).json()) as { id: string };

    const merged = await post(`/api/v1/people/${loser.id}/merge`, cookie, { intoId: winner.id });
    expect(merged.status).toBe(200);
    const body = (await merged.json()) as { moved: { properties: number; propertyOwners: number } };
    expect(body.moved.propertyOwners).toBe(1);

    const detail = (await (
      await app.request(`/api/v1/properties/${property.id}`, { headers: { cookie } })
    ).json()) as { owners: Array<{ personId: string }> };
    expect(detail.owners.map((o) => o.personId)).toEqual([winner.id]);

    // Kaybeden kişi listede yok ama kaydı duruyor
    const list = (await (
      await app.request("/api/v1/people?q=Mukerrer", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };
    expect(list.items.some((p) => p.id === loser.id)).toBe(false);

    const archived = await app.request(`/api/v1/people/${loser.id}`, { headers: { cookie } });
    expect(archived.status).toBe(200);
  });

  it("hisseli mülkte hisse toplamı %100'ü geçemez", async () => {
    const cookie = await login(AYSAN);
    const suffix = Date.now();
    const a = (await (
      await post("/api/v1/people", cookie, { fullName: `Hissedar A ${suffix}`, kind: "owner" })
    ).json()) as { id: string };
    const b = (await (
      await post("/api/v1/people", cookie, { fullName: `Hissedar B ${suffix}`, kind: "owner" })
    ).json()) as { id: string };

    const ok = await post("/api/v1/properties", cookie, {
      title: `Hisseli Daire ${suffix}`,
      owners: [
        { personId: a.id, shareBp: 5000 },
        { personId: b.id, shareBp: 5000 },
      ],
    });
    expect(ok.status).toBe(201);

    const tooMuch = await post("/api/v1/properties", cookie, {
      title: `Askin Hisse ${suffix}`,
      owners: [
        { personId: a.id, shareBp: 6000 },
        { personId: b.id, shareBp: 6000 },
      ],
    });
    expect(tooMuch.status).toBe(400);
  });
});

describe("Excel/CSV içe aktarma", () => {
  // Her koşuda benzersiz adlar: test tekrar edilebilir olsun, mükerrer sayılmasın
  const RUN = Date.now();
  const rows = [
    "Ad Soyad;Telefon;Tür;Mülk;İl;İlçe;Fiyat;İşlem;Oda",
    `Aktarim Malik ${RUN};0555 900 00 01;Mal Sahibi;Aktarim Daire 3+1 ${RUN};İstanbul;Kadıköy;1.850.000 TL;Kiralık;3+1`,
    `Aktarim Ikinci ${RUN};0555 900 00 02;Mal Sahibi;Aktarim Daire 2+1 ${RUN};İstanbul;Moda;2.400.000 TL;Satılık;2+1`,
    `Aktarim Malik ${RUN};0555 900 00 01;Mal Sahibi;Aktarim Ikinci Daire ${RUN};İstanbul;Kadıköy;;;`,
    ";0555 900 00 09;Kiracı;Eksik Isim;;;0;;",
  ];

  it("önce kuru çalıştırma yapar, sonra yazar", async () => {
    const cookie = await login(AYSAN);

    const dry = await app.request("/api/v1/import?dryRun=1", {
      method: "POST",
      headers: { cookie },
      body: csvFile(rows),
    });
    expect(dry.status).toBe(200);
    const preview = (await dry.json()) as {
      totalRows: number;
      personsCreated: number;
      personsMerged: number;
      propertiesCreated: number;
      listingsCreated: number;
      errors: unknown[];
      mapping: Record<string, number>;
    };
    expect(preview.totalRows).toBe(4);
    expect(preview.personsCreated).toBe(2);
    expect(preview.personsMerged).toBe(1);
    expect(preview.propertiesCreated).toBe(3);
    expect(preview.listingsCreated).toBe(2);
    expect(preview.errors).toHaveLength(1);
    expect(preview.mapping.fullName).toBe(0);

    // Kuru çalıştırma yazmadı
    // Bu koşuya ait kayıt sayısı: eski koşulardan kalan veri testi yanıltmasın
    const beforeWrite = (await (
      await app.request(`/api/v1/people?q=${RUN}`, { headers: { cookie } })
    ).json()) as { count: number };
    expect(beforeWrite.count).toBe(0);

    const write = await app.request("/api/v1/import", {
      method: "POST",
      headers: { cookie },
      body: csvFile(rows),
    });
    expect(write.status).toBe(200);
    const applied = (await write.json()) as { personsCreated: number; propertiesCreated: number };
    expect(applied.personsCreated).toBe(2);
    expect(applied.propertiesCreated).toBe(3);

    // Aynı dosya ikinci kez: mükerrer açılmaz
    const again = await app.request("/api/v1/import", {
      method: "POST",
      headers: { cookie },
      body: csvFile(rows),
    });
    const second = (await again.json()) as {
      personsCreated: number;
      propertiesCreated: number;
      personsMerged: number;
    };
    expect(second.personsCreated).toBe(0);
    expect(second.propertiesCreated).toBe(0);
    expect(second.personsMerged).toBe(3);
  });

  it("başlık yoksa anlaşılır hata verir", async () => {
    const cookie = await login(AYSAN);
    const bad = csvFile(["0555 111 22 33;Kadıköy", "0555 222 33 44;Moda"]);
    const res = await app.request("/api/v1/import?dryRun=1", {
      method: "POST",
      headers: { cookie },
      body: bad,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Ad Soyad");
  });

  it("aktarım defterine kayıt düşer", async () => {
    const cookie = await login(AYSAN);

    // Kendi aktarımını yap (test sırasına bağımlı olmasın)
    const run = Date.now();
    const own = await app.request("/api/v1/import", {
      method: "POST",
      headers: { cookie },
      body: csvFile([
        "Ad Soyad;Telefon;Tür;Mülk",
        `Aktarim Defter ${run};0555 910 00 01;Mal Sahibi;Aktarim Defter Daire ${run}`,
      ]),
    });
    expect(own.status).toBe(200);

    const res = await app.request("/api/v1/import/batches", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBeGreaterThan(0);
  });
});
