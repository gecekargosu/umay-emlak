/**
 * Alıcı/kiracı adayına uygun portföy önerisi — TUR:33 (yol haritası SIRA 6).
 *
 * Kaynak dosya: "Adayın bütçesi, ilçesi ve oda sayısı hazır; eşleştirme puanı
 * üretilmiyor." Bu uç yalnız ÖNERİR: puan ve gerekçe döner, hiçbir kaydı
 * değiştirmez. Puanlama şeffaftır (hangi sebeple kaç puan) — kullanıcı neden
 * önerildiğini görsün, "kara kutu" olmasın.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const suggestionRoutes = new Hono();

type Scored = {
  listingId: string;
  kind: string;
  title: string;
  district: string | null;
  city: string | null;
  roomCount: string | null;
  grossM2: number | null;
  priceKurus: number;
  priceText: string;
  score: number;
  reasons: string[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("tr");
}

suggestionRoutes.get("/:id/suggestions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const personId = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const [person] = await tx
      .select({
        id: schema.persons.id,
        fullName: schema.persons.fullName,
        kind: schema.persons.kind,
        budgetKurus: schema.persons.budgetKurus,
        wantsDistrict: schema.persons.wantsDistrict,
        wantsRoomCount: schema.persons.wantsRoomCount,
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, personId))
      .limit(1);
    if (!person) throw new HttpError(404, "Kişi bulunamadı");

    const rows = await tx
      .select({
        listingId: schema.listings.id,
        kind: schema.listings.kind,
        priceKurus: schema.listings.priceKurus,
        title: schema.properties.title,
        district: schema.properties.district,
        city: schema.properties.city,
        roomCount: schema.properties.roomCount,
        grossM2: schema.properties.grossM2,
      })
      .from(schema.listings)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .where(eq(schema.listings.status, "active"));

    return { person, rows };
  });

  const budget = data.person.budgetKurus === null ? null : Number(data.person.budgetKurus);
  const district = normalize(data.person.wantsDistrict);
  const room = normalize(data.person.wantsRoomCount);

  const scored: Scored[] = data.rows.map((row) => {
    const price = Number(row.priceKurus);
    const reasons: string[] = [];
    let score = 0;

    if (district && normalize(row.district) === district) {
      score += 40;
      reasons.push("ilçe uyuyor");
    }
    if (room && normalize(row.roomCount) === room) {
      score += 30;
      reasons.push("oda sayısı uyuyor");
    }
    if (budget !== null && price > 0) {
      if (price <= budget) {
        score += 25;
        reasons.push("bütçe içinde");
      } else if (price <= Math.round(budget * 1.1)) {
        score += 15;
        reasons.push("bütçeye %10 yakın");
      } else if (price > budget * 1.5) {
        // Bütçenin çok üstü: puanı düşür, gerekçeyi yaz (yine de listede kalır).
        score -= 10;
        reasons.push("bütçenin çok üstünde");
      }
    }
    if (row.grossM2 && row.grossM2 >= 100) {
      score += 3;
      reasons.push("100 m² ve üzeri");
    }

    return {
      listingId: String(row.listingId),
      kind: String(row.kind),
      title: String(row.title),
      district: row.district,
      city: row.city,
      roomCount: row.roomCount,
      grossM2: row.grossM2 === null ? null : Number(row.grossM2),
      priceKurus: price,
      priceText: formatTry(price),
      score,
      reasons,
    };
  });

  // Kriter yoksa puanlama anlamsız: m² bonusu tek başına "uygun" sayılmaz.
  const hasCriteria = Boolean(budget !== null || district || room);
  const items = hasCriteria
    ? scored
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.priceKurus - b.priceKurus)
        .slice(0, 12)
    : [];

  return c.json({
    person: {
      id: String(data.person.id),
      fullName: String(data.person.fullName),
      kind: String(data.person.kind),
      budgetKurus: budget,
      budgetText: budget === null ? null : formatTry(budget),
      wantsDistrict: data.person.wantsDistrict,
      wantsRoomCount: data.person.wantsRoomCount,
    },
    count: items.length,
    items,
    /** Kriter yoksa puanlama anlamsız: arayüz bunu söyler. */
    hasCriteria,
  });
});
