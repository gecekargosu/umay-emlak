/**
 * Komisyon ve kapora — TUR:25 (bilgi bankası 9-C, Y-79).
 *
 * Kural (kaynak dosya): komisyon varsayılan %3 ama oran/tutar elle değişebilir;
 * indirim varsa gerekçe zorunlu. Komisyon "teklif edildi → onaylandı → ödendi"
 * diye ilerler; onayı yalnız onay yetkisi olan verir (K-29).
 *
 * Kapora: ilan üzerinde tutulur. Kapora alınınca ilan "kaporalı" (reserved)
 * durumuna düşer; iade edilirse ilan yeniden "aktif" olur. Bu, sözlü anlaşmanın
 * kayda geçmesini sağlar.
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const commissionRoutes = new Hono();

const STATUS_TR: Record<string, string> = {
  proposed: "Teklif edildi",
  approved: "Onaylandı",
  paid: "Ödendi",
  cancelled: "İptal",
};

function money(value: unknown): number {
  return Number(value ?? 0);
}

async function ensureListing(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  listingId: string,
) {
  const [listing] = await tx
    .select({
      id: schema.listings.id,
      kind: schema.listings.kind,
      status: schema.listings.status,
      priceKurus: schema.listings.priceKurus,
    })
    .from(schema.listings)
    .where(eq(schema.listings.id, listingId))
    .limit(1);
  if (!listing) throw new HttpError(404, "İlan bulunamadı");
  return listing;
}

/** İlanın komisyonları + kapora durumu. */
commissionRoutes.get("/:id/commissions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const listingId = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const listing = await ensureListing(tx, listingId);
    const rows = await tx
      .select({
        id: schema.commissions.id,
        rateBp: schema.commissions.rateBp,
        amountKurus: schema.commissions.amountKurus,
        discountReason: schema.commissions.discountReason,
        status: schema.commissions.status,
        createdAt: schema.commissions.createdAt,
      })
      .from(schema.commissions)
      .where(eq(schema.commissions.listingId, listingId))
      .orderBy(schema.commissions.createdAt);

    const [deposit] = await tx
      .select({
        depositKurus: sql<number>`coalesce(deposit_kurus, 0)::bigint`,
        depositReceivedAt: sql<string | null>`deposit_received_at::text`,
      })
      .from(schema.listings)
      .where(eq(schema.listings.id, listingId))
      .limit(1);

    return {
      listing: {
        id: listing.id,
        kind: listing.kind,
        status: listing.status,
        priceKurus: money(listing.priceKurus),
        priceText: formatTry(money(listing.priceKurus)),
      },
      items: rows.map((row) => ({
        id: row.id,
        rateBp: row.rateBp,
        rateText: row.rateBp ? `%${(row.rateBp / 100).toLocaleString("tr-TR")}` : "—",
        amountKurus: money(row.amountKurus),
        amountText: formatTry(money(row.amountKurus)),
        discountReason: row.discountReason,
        status: row.status,
        statusLabel: STATUS_TR[row.status] ?? row.status,
        createdAt: row.createdAt,
      })),
      deposit: {
        amountKurus: money(deposit?.depositKurus),
        amountText: formatTry(money(deposit?.depositKurus)),
        receivedAt: deposit?.depositReceivedAt ?? null,
      },
    };
  });

  return c.json(data);
});

/** Komisyon taslağı (varsayılan %3; oran/tutar elle). */
commissionRoutes.post("/:id/commissions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "komisyon kaydı");
  const listingId = c.req.param("id");

  const parsed = z
    .object({
      rateBp: z.number().int().min(0).max(10000).optional(),
      amountText: z.string().max(40).optional(),
      discountReason: z.string().max(300).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz komisyon");

  const created = await withTenant(session.tenantId, async (tx) => {
    const listing = await ensureListing(tx, listingId);
    const rateBp = parsed.data.rateBp ?? 300;

    let amountKurus: number;
    if (parsed.data.amountText && parsed.data.amountText.trim() !== "") {
      try {
        amountKurus = parseTryToKurus(parsed.data.amountText);
      } catch (error) {
        throw new HttpError(400, `Komisyon tutarı: ${(error as Error).message}`);
      }
    } else {
      amountKurus = Math.round((money(listing.priceKurus) * rateBp) / 10000);
    }
    if (amountKurus <= 0) throw new HttpError(400, "Komisyon tutarı sıfırdan büyük olmalı");

    const expected = Math.round((money(listing.priceKurus) * rateBp) / 10000);
    const discount = amountKurus < expected;
    if (discount && !parsed.data.discountReason?.trim()) {
      throw new HttpError(400, "İndirimli komisyonda gerekçe zorunlu");
    }

    const [row] = await tx
      .insert(schema.commissions)
      .values({
        tenantId: session.tenantId,
        listingId,
        rateBp,
        amountKurus,
        discountReason: parsed.data.discountReason?.trim() || null,
      })
      .returning({ id: schema.commissions.id, amountKurus: schema.commissions.amountKurus });

    return {
      id: row!.id,
      amountKurus: money(row!.amountKurus),
      amountText: formatTry(money(row!.amountKurus)),
    };
  });

  return c.json(created, 201);
});

/** Kapora al / iade et. Kapora alınınca ilan kaporalıya düşer. */
commissionRoutes.post("/:id/deposit", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kapora kaydı");
  const listingId = c.req.param("id");

  const parsed = z
    .object({
      amountText: z.string().max(40).optional(),
      receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      release: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz kapora");

  const result = await withTenant(session.tenantId, async (tx) => {
    const listing = await ensureListing(tx, listingId);

    if (parsed.data.release) {
      await tx.execute(sql`
        update listing
           set deposit_kurus = 0, deposit_received_at = null,
               status = case when status = 'reserved' then 'active'::listing_status else status end
         where id = ${listingId}::uuid
      `);
      return { released: true, amountKurus: 0, amountText: formatTry(0), status: "active" };
    }

    if (!parsed.data.amountText) throw new HttpError(400, "Kapora tutarı gerekli");
    let amountKurus: number;
    try {
      amountKurus = parseTryToKurus(parsed.data.amountText);
    } catch (error) {
      throw new HttpError(400, `Kapora: ${(error as Error).message}`);
    }
    if (amountKurus <= 0) throw new HttpError(400, "Kapora sıfırdan büyük olmalı");

    const receivedAt = parsed.data.receivedAt ?? new Date().toISOString().slice(0, 10);
    await tx.execute(sql`
      update listing
         set deposit_kurus = ${amountKurus},
             deposit_received_at = ${receivedAt}::date,
             status = case when status in ('active','draft') then 'reserved'::listing_status else status end
       where id = ${listingId}::uuid
    `);

    return {
      released: false,
      amountKurus,
      amountText: formatTry(amountKurus),
      status: listing.status === "active" || listing.status === "draft" ? "reserved" : listing.status,
      receivedAt,
    };
  });

  return c.json(result);
});
