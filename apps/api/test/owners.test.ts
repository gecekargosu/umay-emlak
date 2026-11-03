/**
 * TUR:21 kabul testleri — mal sahipleri uçları ve portföy filtreleri.
 * Demo verisi (demo.ts) veritabanında olduğu için sayılar "en az" olarak denenir.
 */
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
  await closePool();
});

describe("mal sahipleri", () => {
  it("sahipleri mülk sayısı ve toplamlarıyla listeler", async () => {
    const cookie = await login();
    const res = await app.request("/api/v1/owners", { headers: { cookie } });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      items: Array<{ id: string; fullName: string; propertyCount: number; saleCount: number }>;
    };
    expect(data.items.length).toBeGreaterThanOrEqual(30);
    // alfabetik sıra
    const names = data.items.map((o) => o.fullName);
    expect([...names].sort((a, b) => a.localeCompare(b, "tr"))).toEqual(names);
    // demo dağıtımı: 10 mülkü olan sahip var
    expect(data.items.some((o) => o.propertyCount === 10)).toBe(true);
  });

  it("sahibin klasörü yalnız kendi mülklerini döndürür", async () => {
    const cookie = await login();
    const list = (await (await app.request("/api/v1/owners", { headers: { cookie } })).json()) as {
      items: Array<{ id: string; propertyCount: number }>;
    };
    const owner = list.items.find((o) => o.propertyCount === 10)!;

    const res = await app.request(`/api/v1/owners/${owner.id}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      person: { propertyCount: number };
      properties: Array<{ id: string; kind: string | null }>;
    };
    expect(detail.person.propertyCount).toBe(10);
    // bir mülk hem satılık hem kiralık ilan taşıyabilir → satır sayısı >= mülk sayısı
    expect(detail.properties.length).toBeGreaterThanOrEqual(10);
  });

  it("portföy filtreleri ilçe, oda ve fiyat aralığıyla çalışır", async () => {
    const cookie = await login();

    const districts = (await (
      await app.request("/api/v1/listings/districts", { headers: { cookie } })
    ).json()) as { items: string[] };
    expect(districts.items).toContain("Karşıyaka");

    const byDistrict = (await (
      await app.request("/api/v1/listings?district=Karşıyaka", { headers: { cookie } })
    ).json()) as { items: Array<{ district: string | null }> };
    expect(byDistrict.items.length).toBeGreaterThan(0);
    expect(byDistrict.items.every((row) => row.district === "Karşıyaka")).toBe(true);

    const byRooms = (await (
      await app.request(`/api/v1/listings?rooms=${encodeURIComponent("3+1")}`, { headers: { cookie } })
    ).json()) as { items: Array<{ roomCount: string | null }> };
    expect(byRooms.items.length).toBeGreaterThan(0);
    expect(byRooms.items.every((row) => row.roomCount === "3+1")).toBe(true);

    const cheap = (await (
      await app.request("/api/v1/listings?kind=sale&maxTl=2000000", { headers: { cookie } })
    ).json()) as { items: Array<{ kind: string; priceKurus: number }> };
    expect(cheap.items.length).toBeGreaterThan(0);
    expect(cheap.items.every((row) => row.kind === "sale" && row.priceKurus <= 200_000_000)).toBe(true);

    const expensive = (await (
      await app.request("/api/v1/listings?kind=sale&minTl=2000000", { headers: { cookie } })
    ).json()) as { items: Array<{ priceKurus: number }> };
    expect(expensive.items.length).toBeGreaterThan(0);
    expect(expensive.items.every((row) => row.priceKurus >= 200_000_000)).toBe(true);
  });
});

describe("kiracılar", () => {
  it("kiracıları aktif sözleşme, mülk ve kira ile listeler", async () => {
    const cookie = await login();
    const res = await app.request("/api/v1/tenants", { headers: { cookie } });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      items: Array<{ id: string; fullName: string; propertyTitle: string | null; rentKurus: number | null }>;
    };
    expect(data.items.length).toBeGreaterThanOrEqual(30);
    expect(data.items.filter((tenant) => tenant.propertyTitle).length).toBeGreaterThanOrEqual(30);
    expect(data.items.some((tenant) => (tenant.rentKurus ?? 0) > 0)).toBe(true);
  });

  it("kiracı dosyası sözleşme ve ödeme dökümü döndürür", async () => {
    const cookie = await login();
    const list = (await (await app.request("/api/v1/tenants", { headers: { cookie } })).json()) as {
      items: Array<{ id: string; fullName: string; propertyTitle: string | null }>;
    };
    const tenant = list.items.find((item) => item.propertyTitle)!;

    const res = await app.request(`/api/v1/tenants/${tenant.id}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      person: { fullName: string };
      contracts: Array<{ status: string }>;
    };
    expect(detail.person.fullName).toBe(tenant.fullName);
    expect(detail.contracts.length).toBeGreaterThanOrEqual(1);
    expect(detail.contracts.some((contract) => contract.status === "active")).toBe(true);
  });
});

describe("personel portföyü ve sözleşme metni", () => {
  it("personelin portföyünü, teklifleri ve ilçe ortalamasını döndürür", async () => {
    const cookie = await login();
    const team = (await (await app.request("/api/v1/team", { headers: { cookie } })).json()) as {
      members: Array<{ id: string; name: string }>;
    };
    const member = team.members[0]!;

    const res = await app.request(`/api/v1/team/${member.id}/portfolio`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      member: { fullName: string };
      listings: Array<{ kind: string; offers: unknown[]; enteredAt: string }>;
      averages: Array<{ district: string; avgRentText: string }>;
    };
    expect(data.member.fullName).toBeTruthy();
    expect(data.listings.length).toBeGreaterThan(0);
    expect(data.listings.every((listing) => listing.enteredAt)).toBe(true);
    expect(data.averages.length).toBeGreaterThan(0);
  });

  it("sözleşme metni HTML olarak açılır", async () => {
    const cookie = await login();
    const list = (await (await app.request("/api/v1/contracts", { headers: { cookie } })).json()) as {
      items: Array<{ id: string }>;
    };
    expect(list.items.length).toBeGreaterThan(0);
    const res = await app.request(`/api/v1/contracts/${list.items[0]!.id}/contract-text`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("KİRA SÖZLEŞMESİ");
    expect(html).toContain("Kira koşulları");
  });
});
