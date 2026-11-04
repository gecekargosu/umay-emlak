/**
 * İlan (portföy) uçları — Dilim 3.
 *
 * K-17: ilan ≠ mülk. Mülk kaydı durur, ilan onun üzerindeki ticari tekliftir.
 * K-32: yayına alma belge şartına bağlıdır; eksik belgeyle yayına almak
 *       yalnız onay yetkisi olan kullanıcının bilinçli kararıyla olur ve
 *       durum geçmişine "zorlandı" olarak yazılır.
 * K-13: fiyat kuruş; her değişiklik fiyat geçmişine düşer.
 */
import { Hono } from "hono";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import {
  DOCUMENT_KIND_TR,
  formatTry,
  missingRequirements,
  parseTryToKurus,
  requiredForListing,
  type DocumentKind,
} from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const listingRoutes = new Hono();

const listingStatusSchema = z.enum(["draft", "active", "reserved", "closed", "archived"]);

/** İzin verilen durum geçişleri. Kapalı ilan geri açılmaz; yeni ilan açılır. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["reserved", "closed", "archived"],
  reserved: ["active", "closed", "archived"],
  closed: ["archived"],
  archived: [],
};

/**
 * Portföy listesi + arama.
 * Tek kutuda adres, mülk adı, mal sahibi, kiracı, oda sayısı ve telefon aranır
 * (TUR:17 kullanıcı isteği: "adres ya da mal sahibi/kiracı adı girip ulaşmak").
 */
listingRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const text = (name: string) => (c.req.query(name) ?? "").trim();
  const q = text("q");
  const kind = c.req.query("kind");
  const status = listingStatusSchema.safeParse(c.req.query("status") ?? undefined);
  const addressQ = text("address");
  const unitQ = text("unitNo");
  const siteQ = text("site");
  const buildingQ = text("building");
  const ownerQ = text("owner");
  const tenantQ = text("tenant");
  const districtQ = text("district");
  const roomsQ = text("rooms");
  const minTl = Number(c.req.query("minTl") ?? "");
  const maxTl = Number(c.req.query("maxTl") ?? "");

  const owner = alias(schema.persons, "owner_person");
  const tenant = alias(schema.persons, "tenant_person");
  const like = (value: string) => `%${value.toLocaleLowerCase("tr")}%`;

  const conditions: SQL[] = [];
  if (kind === "sale" || kind === "rent") conditions.push(eq(schema.listings.kind, kind));
  if (status.success) conditions.push(eq(schema.listings.status, status.data));

  // Alan bazlı filtreler (TUR:20): her biri ayrı kutu, hepsi birlikte daraltır.
  if (addressQ) {
    conditions.push(
      sql`lower(coalesce(${schema.properties.address}, '')) like ${like(addressQ)}`,
    );
  }
  if (unitQ) {
    // "12" daire numarası ya da blok adı olabilir → ikisi OR ile aranır (AND olsa hiç eşleşmez).
    conditions.push(
      or(
        sql`lower(coalesce(${schema.properties.unitNo}, '')) like ${like(unitQ)}`,
        sql`lower(coalesce(${schema.properties.block}, '')) like ${like(unitQ)}`,
      )!,
    );
  }
  if (siteQ) {
    conditions.push(
      sql`lower(coalesce(${schema.properties.siteName}, '')) like ${like(siteQ)}`,
    );
  }
  if (buildingQ) {
    conditions.push(
      sql`lower(coalesce(${schema.properties.buildingName}, '')) like ${like(buildingQ)}`,
    );
  }
  if (ownerQ) {
    conditions.push(sql`lower(coalesce(${owner.fullName}, '')) like ${like(ownerQ)}`);
  }
  if (tenantQ) {
    conditions.push(sql`lower(coalesce(${tenant.fullName}, '')) like ${like(tenantQ)}`);
  }
  if (districtQ) {
    conditions.push(
      sql`lower(coalesce(${schema.properties.district}, '')) = ${districtQ.toLocaleLowerCase("tr")}`,
    );
  }
  if (roomsQ) {
    conditions.push(sql`lower(coalesce(${schema.properties.roomCount}, '')) = ${roomsQ.toLocaleLowerCase("tr")}`);
  }
  if (Number.isFinite(minTl) && minTl > 0) {
    conditions.push(sql`${schema.listings.priceKurus} >= ${Math.round(minTl * 100)}`);
  }
  if (Number.isFinite(maxTl) && maxTl > 0) {
    conditions.push(sql`${schema.listings.priceKurus} <= ${Math.round(maxTl * 100)}`);
  }

  if (q) {
    const wide = like(q);
    const digits = q.replace(/\D/g, "");
    const parts = [
      sql`lower(${schema.properties.title}) like ${wide}`,
      sql`lower(coalesce(${schema.properties.address}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.district}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.city}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.roomCount}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.unitNo}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.siteName}, '')) like ${wide}`,
      sql`lower(coalesce(${schema.properties.buildingName}, '')) like ${wide}`,
      sql`lower(coalesce(${owner.fullName}, '')) like ${wide}`,
      sql`lower(coalesce(${tenant.fullName}, '')) like ${wide}`,
    ];
    if (digits.length >= 3) {
      parts.push(sql`coalesce(${owner.phoneDigits}, '') like ${`%${digits}%`}`);
      parts.push(sql`coalesce(${tenant.phoneDigits}, '') like ${`%${digits}%`}`);
    }
    conditions.push(or(...parts)!);
  }

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.listings.id,
        propertyId: schema.listings.propertyId,
        kind: schema.listings.kind,
        status: schema.listings.status,
        priceKurus: schema.listings.priceKurus,
        authorityNo: schema.listings.authorityNo,
        title: schema.properties.title,
        district: schema.properties.district,
        city: schema.properties.city,
        address: schema.properties.address,
        roomCount: schema.properties.roomCount,
        block: schema.properties.block,
        unitNo: schema.properties.unitNo,
        floor: schema.properties.floor,
        siteName: schema.properties.siteName,
        buildingName: schema.properties.buildingName,
        publishedAt: schema.listings.publishedAt,
        createdAt: schema.listings.createdAt,
        ownerName: owner.fullName,
        tenantName: tenant.fullName,
        tenantPhone: tenant.phone,
        // TUR:48 — rafta harf yerine mülkün kapak fotoğrafı görünsün.
        coverMediaId: sql<string | null>`(
          select pm.id from property_media pm
           where pm.property_id = ${schema.properties.id}
             and pm.kind = 'image' and pm.maintenance_id is null
           order by pm.created_at
           limit 1
        )`,
      })
      .from(schema.listings)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .leftJoin(owner, eq(owner.id, schema.properties.ownerPersonId))
      .leftJoin(
        schema.contracts,
        and(
          eq(schema.contracts.listingId, schema.listings.id),
          eq(schema.contracts.status, "active"),
        ),
      )
      .leftJoin(tenant, eq(tenant.id, schema.contracts.tenantPersonId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.listings.createdAt))
      .limit(200),
  );

  return c.json({
    count: rows.length,
    items: rows.map((r) => ({
      ...r,
      price: formatTry(r.priceKurus),
      coverUrl: r.coverMediaId
        ? `/api/v1/properties/${r.propertyId}/media/${r.coverMediaId}/file`
        : null,
    })),
  });
});

/** Filtre kutusundaki ilçe listesi — veriden gelir, sabit liste tutulmaz. */
listingRoutes.get("/districts", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .selectDistinct({ district: schema.properties.district })
      .from(schema.properties)
      .where(sql`${schema.properties.district} is not null`),
  );

  const items = rows
    .map((row) => row.district)
    .filter((district): district is string => Boolean(district))
    .sort((a, b) => a.localeCompare(b, "tr"));

  return c.json({ items });
});

const newListing = z.object({
  propertyTitle: z.string().min(2).max(200),
  ownerPersonId: z.uuid(),
  kind: z.enum(["sale", "rent"]),
  priceKurus: z.number().int().nonnegative(),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  /** Y-60: EİDS / yetki numarası — kayıt alanı, resmî doğrulama değil */
  authorityNo: z.string().max(60).optional(),
});

listingRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "ilan açma");

  const parsed = newListing.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, `Geçersiz veri: ${parsed.error.issues[0]?.message ?? "bilinmiyor"}`);
  }
  const input = parsed.data;

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .insert(schema.properties)
      .values({
        tenantId: session.tenantId,
        ownerPersonId: input.ownerPersonId,
        title: input.propertyTitle,
        city: input.city ?? null,
        district: input.district ?? null,
      })
      .returning({ id: schema.properties.id });

    const [listing] = await tx
      .insert(schema.listings)
      .values({
        tenantId: session.tenantId,
        propertyId: property!.id,
        kind: input.kind,
        status: "draft",
        priceKurus: input.priceKurus,
        authorityNo: input.authorityNo?.trim() || null,
        responsibleUserId: session.userId,
      })
      .returning({ id: schema.listings.id });

    return listing!;
  });

  return c.json({ id: created.id }, 201);
});

/** İlan detayı: mülk, malikler, belgeler, eksik belgeler, iki geçmiş. */
listingRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        listing: schema.listings,
        property: schema.properties,
      })
      .from(schema.listings)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .where(eq(schema.listings.id, id))
      .limit(1);
    if (!row) return null;

    const ownerRows = await tx
      .select({
        personId: schema.propertyOwners.personId,
        shareBp: schema.propertyOwners.shareBp,
        fullName: schema.persons.fullName,
        phone: schema.persons.phone,
      })
      .from(schema.propertyOwners)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.propertyOwners.personId))
      .where(eq(schema.propertyOwners.propertyId, row.property.id));

    // H-3: demo ve eski kayıtlarda malik, property_owners tablosunda değil mülkün
    // owner_person_id alanında duruyor. Bu durumda mülk dosyasında mal sahibi "—"
    // görünüyordu; mülk kartındaki kaynakla aynı kişiyi gösteriyoruz.
    const fallbackOwnerId = row.property.ownerPersonId;
    const owners =
      ownerRows.length > 0
        ? ownerRows
        : fallbackOwnerId
          ? await tx
              .select({
                personId: schema.persons.id,
                shareBp: sql<number | null>`null::int`,
                fullName: schema.persons.fullName,
                phone: schema.persons.phone,
              })
              .from(schema.persons)
              .where(eq(schema.persons.id, fallbackOwnerId))
          : [];

    const docs = await tx
      .select({
        id: schema.documents.id,
        kind: schema.documents.kind,
        filename: schema.documents.filename,
        title: schema.documents.title,
        createdAt: schema.documents.createdAt,
        personId: schema.documents.personId,
        listingId: schema.documents.listingId,
      })
      .from(schema.documents)
      .where(
        or(
          eq(schema.documents.listingId, row.listing.id),
          eq(schema.documents.propertyId, row.property.id),
        ),
      )
      .orderBy(desc(schema.documents.createdAt));

    const requirements = requiredForListing(row.listing.kind);
    const presentKinds = [...new Set(docs.map((d) => d.kind as DocumentKind))];
    const missing = missingRequirements(requirements, presentKinds);

    const priceHistory = await tx
      .select()
      .from(schema.listingPriceChanges)
      .where(eq(schema.listingPriceChanges.listingId, row.listing.id))
      .orderBy(desc(schema.listingPriceChanges.createdAt))
      .limit(20);

    const statusHistory = await tx
      .select()
      .from(schema.listingStatusChanges)
      .where(eq(schema.listingStatusChanges.listingId, row.listing.id))
      .orderBy(desc(schema.listingStatusChanges.createdAt))
      .limit(20);

    return {
      listing: { ...row.listing, price: formatTry(row.listing.priceKurus) },
      property: row.property,
      owners,
      documents: docs.map((d) => ({
        ...d,
        kindLabel: DOCUMENT_KIND_TR[d.kind as DocumentKind],
      })),
      requirements: requirements.map((r) => ({
        ...r,
        met: !missing.some((m) => m.key === r.key),
      })),
      missing: missing.map((m) => m.key),
      priceHistory,
      statusHistory,
      canPublish: missing.length === 0,
    };
  });

  if (!detail) throw new HttpError(404, "İlan bulunamadı");
  return c.json(detail);
});

/** Y-60: yetki numarasını ayrı uçtan güncelle (fiyat/durum akışını bozmadan). */
listingRoutes.patch("/:id/authority", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "yetki numarası güncelleme");

  const parsed = z
    .object({ authorityNo: z.string().max(60).nullable() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz veri");
  const value = parsed.data.authorityNo?.trim() || null;

  const updated = await withTenant(session.tenantId, async (tx) =>
    tx
      .update(schema.listings)
      .set({ authorityNo: value })
      .where(eq(schema.listings.id, c.req.param("id")))
      .returning({ id: schema.listings.id }),
  );
  if (!updated[0]) throw new HttpError(404, "İlan bulunamadı");
  return c.json({ ok: true, authorityNo: value });
});

const patchListing = z.object({
  priceKurus: z.number().int().positive().optional(),
  /** Arayüz "4.300.000" gibi yazar; kuruşa çevirme tek yerde yapılır */
  priceText: z.string().max(40).optional(),
  status: listingStatusSchema.optional(),
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

listingRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "ilan güncelleme");
  const id = c.req.param("id");

  const parsed = patchListing.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz veri");
  const input = parsed.data;

  let priceKurus = input.priceKurus;
  if (priceKurus === undefined && input.priceText !== undefined) {
    try {
      priceKurus = parseTryToKurus(input.priceText);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  }
  if (priceKurus !== undefined && priceKurus <= 0) {
    throw new HttpError(400, "Fiyat sıfırdan büyük olmalı");
  }
  if (priceKurus === undefined && input.status === undefined) {
    throw new HttpError(400, "Değişiklik yok (fiyat veya durum gerekli)");
  }

  const result = await withTenant(session.tenantId, async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, id))
      .limit(1);
    if (!current) throw new HttpError(404, "İlan bulunamadı");

    let priceChanged = false;
    if (priceKurus !== undefined && priceKurus !== current.priceKurus) {
      await tx.insert(schema.listingPriceChanges).values({
        tenantId: session.tenantId,
        listingId: id,
        oldKurus: current.priceKurus,
        newKurus: priceKurus,
        note: input.note ?? null,
        changedByUserId: session.userId,
      });
      priceChanged = true;
    }

    let forced = false;
    let publishedAt = current.publishedAt;
    if (input.status && input.status !== current.status) {
      const allowed = TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new HttpError(
          409,
          `Durum geçişi kapalı: ${current.status} → ${input.status}. Açık geçişler: ${allowed.join(", ") || "yok"}`,
        );
      }

      if (input.status === "active" && current.status === "draft") {
        const docs = await tx
          .select({ kind: schema.documents.kind })
          .from(schema.documents)
          .where(
            or(
              eq(schema.documents.listingId, current.id),
              eq(schema.documents.propertyId, current.propertyId),
            ),
          );
        const present = [...new Set(docs.map((d) => d.kind as DocumentKind))];
        const missing = missingRequirements(requiredForListing(current.kind), present);

        if (missing.length > 0) {
          const canForce = input.force === true && session.canApprove;
          if (!canForce) {
            throw new HttpError(
              409,
              `Yayına almak için eksik belge: ${missing.map((m) => m.label).join(", ")}. ` +
                `Belgeleri yükleyin; yetkiliyseniz zorlayabilirsiniz.`,
            );
          }
          forced = true;
        }
        if (!publishedAt) publishedAt = new Date();
      }

      await tx.insert(schema.listingStatusChanges).values({
        tenantId: session.tenantId,
        listingId: id,
        fromStatus: current.status,
        toStatus: input.status,
        forced,
        note: input.note ?? null,
        changedByUserId: session.userId,
      });
    }

    const [updated] = await tx
      .update(schema.listings)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(priceKurus !== undefined ? { priceKurus } : {}),
        ...(publishedAt !== current.publishedAt ? { publishedAt } : {}),
      })
      .where(eq(schema.listings.id, id))
      .returning({
        id: schema.listings.id,
        status: schema.listings.status,
        priceKurus: schema.listings.priceKurus,
      });

    return { updated: updated!, priceChanged, forced };
  });

  return c.json({
    ok: true,
    ...result,
    price: formatTry(result.updated.priceKurus),
  });
});

/** Kaporalı ilanı "kaporalı" işaretlemek ayrı uç değil; PATCH status=reserved. */
void and;
