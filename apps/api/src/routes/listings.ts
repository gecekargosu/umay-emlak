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
import { and, desc, eq, or } from "drizzle-orm";
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

listingRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.listings.id,
        propertyId: schema.listings.propertyId,
        kind: schema.listings.kind,
        status: schema.listings.status,
        priceKurus: schema.listings.priceKurus,
        title: schema.properties.title,
        district: schema.properties.district,
        city: schema.properties.city,
        publishedAt: schema.listings.publishedAt,
        createdAt: schema.listings.createdAt,
      })
      .from(schema.listings)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .orderBy(desc(schema.listings.createdAt))
      .limit(100),
  );

  return c.json({
    count: rows.length,
    items: rows.map((r) => ({ ...r, price: formatTry(r.priceKurus) })),
  });
});

const newListing = z.object({
  propertyTitle: z.string().min(2).max(200),
  ownerPersonId: z.uuid(),
  kind: z.enum(["sale", "rent"]),
  priceKurus: z.number().int().nonnegative(),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
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

    const owners = await tx
      .select({
        personId: schema.propertyOwners.personId,
        shareBp: schema.propertyOwners.shareBp,
        fullName: schema.persons.fullName,
        phone: schema.persons.phone,
      })
      .from(schema.propertyOwners)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.propertyOwners.personId))
      .where(eq(schema.propertyOwners.propertyId, row.property.id));

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
