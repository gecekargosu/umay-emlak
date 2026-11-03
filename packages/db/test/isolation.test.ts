/**
 * DİLİM 0 KABUL TESTİ (K-07).
 * Üç şey kanıtlanır:
 *  1. A ofisi B ofisinin satırlarını göremez.
 *  2. Kiracı bağlamı olmayan sorgu 0 satır döner (RLS gerçekten açık).
 *  3. Başka kiracının kimliğiyle yazma reddedilir (WITH CHECK).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closePool, getPool, withTenant } from "../src/client.js";
import { listings, persons, properties } from "../src/schema.js";

let tenantA = "";
let tenantB = "";

async function createTenant(slug: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    "insert into tenant (name, slug) values ($1, $2) returning id",
    [`Test ${slug}`, slug],
  );
  return rows[0]!.id;
}

async function seedTenant(tenantId: string, label: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [owner] = await tx
      .insert(persons)
      .values({ tenantId, kind: "owner", fullName: `${label} Mal Sahibi` })
      .returning({ id: persons.id });

    const [property] = await tx
      .insert(properties)
      .values({ tenantId, ownerPersonId: owner!.id, title: `${label} Daire` })
      .returning({ id: properties.id });

    await tx.insert(listings).values({
      tenantId,
      propertyId: property!.id,
      kind: "rent",
      status: "active",
      priceKurus: 1_000_000,
    });
  });
}

async function countInTenant(tenantId: string, table: "person" | "listing"): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const result = await tx.execute(sql.raw(`select count(*)::int as c from ${table}`));
    return Number((result as unknown as { rows: Array<{ c: number }> }).rows[0]!.c);
  });
}

beforeAll(async () => {
  tenantA = await createTenant(`ofis-a-${Date.now()}`);
  tenantB = await createTenant(`ofis-b-${Date.now()}`);
  await seedTenant(tenantA, "A");
  await seedTenant(tenantB, "B");
});

afterAll(async () => {
  await getPool().query("delete from tenant where id = any($1::uuid[])", [[tenantA, tenantB]]);
  await closePool();
});

describe("kiracı izolasyonu", () => {
  it("A ofisi yalnız kendi kişisini görür", async () => {
    expect(await countInTenant(tenantA, "person")).toBe(1);
    expect(await countInTenant(tenantB, "person")).toBe(1);
  });

  it("A ofisi B ofisinin portföyünü göremez", async () => {
    const titles = await withTenant(tenantA, async (tx) =>
      tx.select({ title: properties.title }).from(properties),
    );
    expect(titles).toHaveLength(1);
    expect(titles[0]!.title).toBe("A Daire");
  });

  it("kiracı bağlamı yoksa hiçbir satır dönmez", async () => {
    const { rows } = await getPool().query<{ c: number }>("select count(*)::int as c from person");
    expect(rows[0]!.c).toBe(0);

    const listingRows = await getPool().query<{ c: number }>(
      "select count(*)::int as c from listing",
    );
    expect(listingRows.rows[0]!.c).toBe(0);
  });

  it("başka ofisin kimliğiyle yazma reddedilir", async () => {
    // drizzle hatayı sarar; asıl PostgreSQL mesajı error.cause içindedir.
    let caught: unknown;
    try {
      await withTenant(tenantA, async (tx) =>
        tx.insert(persons).values({ tenantId: tenantB, kind: "tenant", fullName: "Sızma" }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught, "RLS yazmayı reddetmeliydi").toBeInstanceOf(Error);
    const cause = (caught as { cause?: { message?: string } }).cause;
    const message = `${(caught as Error).message} ${cause?.message ?? ""}`;
    expect(message).toMatch(/row-level security|policy/i);
  });

  it("geçersiz kiracı kimliği reddedilir", async () => {
    await expect(withTenant("olmayan-id", async () => 1)).rejects.toThrow(/Geçersiz kiracı/);
  });
});
