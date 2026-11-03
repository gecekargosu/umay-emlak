/**
 * Teklif / görüşme kaydı — TUR:24 kullanıcı isteği.
 *
 * "Bir kiralık yer için müşteriyle görüştün, teklifini sisteme girdin; ya da
 *  satılık ilan için biriyle görüştün — bunu da sisteme not edebilmelisin."
 *
 * Teklif silinmez, durumu değişir (received → negotiating → accepted/rejected).
 * Para K-13: kuruş, tam sayı. Kişi kaydı zorunlu değil: telefonla gelen müşteri
 * adı yeterli; kişi seçilirse ad/telefon oradan doldurulur.
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const offerRoutes = new Hono();

const statusEnum = z.enum(["received", "negotiating", "accepted", "rejected"]);

const STATUS_TR: Record<string, string> = {
  received: "Teklif alındı",
  negotiating: "Pazarlıkta",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
};

type OfferRow = {
  id: string;
  listingId: string;
  bidderName: string;
  bidderPhone: string | null;
  amountKurus: number | string;
  status: string;
  note: string | null;
  createdAt: string;
};

function present(row: OfferRow) {
  const amountKurus = Number(row.amountKurus ?? 0);
  return {
    id: String(row.id),
    listingId: String(row.listingId),
    bidderName: String(row.bidderName),
    bidderPhone: row.bidderPhone === null ? null : String(row.bidderPhone),
    amountKurus,
    amountText: formatTry(amountKurus),
    status: String(row.status),
    statusLabel: STATUS_TR[String(row.status)] ?? String(row.status),
    note: row.note === null ? null : String(row.note),
    createdAt: String(row.createdAt),
  };
}

/** İlanın teklifleri (mülk dosyasında ve personel portföyünde kullanılır). */
offerRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const listingId = (c.req.query("listingId") ?? "").trim();
  if (listingId && !z.uuid().safeParse(listingId).success) {
    throw new HttpError(400, "listingId geçersiz");
  }

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select o.id, o.listing_id as "listingId", o.bidder_name as "bidderName",
             o.bidder_phone as "bidderPhone", o.amount_kurus as "amountKurus",
             o.status, o.note, o.created_at as "createdAt"
        from offer o
       ${listingId ? sql`where o.listing_id = ${listingId}::uuid` : sql``}
       order by o.created_at desc
       limit 200
    `);
    return (result as unknown as { rows: OfferRow[] }).rows;
  });

  return c.json({ count: rows.length, items: rows.map(present) });
});

/** Yeni teklif / görüşme notu. */
offerRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "teklif kaydı");

  const body = z
    .object({
      listingId: z.uuid(),
      personId: z.uuid().nullish(),
      bidderName: z.string().max(160).optional(),
      bidderPhone: z.string().max(40).optional(),
      amountText: z.string().min(1).max(40),
      note: z.string().max(1000).optional(),
      status: statusEnum.optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HttpError(400, body.error.issues[0]?.message ?? "Geçersiz teklif");
  }
  const input = body.data;

  let amountKurus: number;
  try {
    amountKurus = parseTryToKurus(input.amountText);
  } catch (error) {
    throw new HttpError(400, `Tutar: ${(error as Error).message}`);
  }
  if (amountKurus <= 0) throw new HttpError(400, "Teklif tutarı sıfırdan büyük olmalı");

  const created = await withTenant(session.tenantId, async (tx) => {
    // İlan gerçekten bu ofiste mi? (RLS zaten korur, mesaj anlaşılır olsun diye)
    const [listing] = await tx
      .select({ id: schema.listings.id, kind: schema.listings.kind })
      .from(schema.listings)
      .where(eq(schema.listings.id, input.listingId))
      .limit(1);
    if (!listing) throw new HttpError(404, "İlan bulunamadı");

    let bidderName = input.bidderName?.trim() ?? "";
    let bidderPhone = input.bidderPhone?.trim() || null;

    if (input.personId) {
      const [person] = await tx
        .select({ fullName: schema.persons.fullName, phone: schema.persons.phone })
        .from(schema.persons)
        .where(eq(schema.persons.id, input.personId))
        .limit(1);
      if (!person) throw new HttpError(404, "Müşteri (kişi) bulunamadı");
      if (!bidderName) bidderName = person.fullName;
      if (!bidderPhone) bidderPhone = person.phone;
    }

    if (!bidderName) throw new HttpError(400, "Teklifi verenin adı gerekli");

    const result = await tx.execute(sql`
      insert into offer (tenant_id, listing_id, bidder_name, bidder_phone, amount_kurus, status, note)
      values (${session.tenantId}::uuid, ${input.listingId}::uuid, ${bidderName}, ${bidderPhone},
              ${amountKurus}, ${input.status ?? "received"}, ${input.note?.trim() || null})
      returning id, listing_id as "listingId", bidder_name as "bidderName",
                bidder_phone as "bidderPhone", amount_kurus as "amountKurus",
                status, note, created_at as "createdAt"
    `);
    const row = (result as unknown as { rows: OfferRow[] }).rows[0];
    if (!row) throw new HttpError(409, "Teklif kaydedilemedi, tekrar deneyin");
    return present(row);
  });

  return c.json(created, 201);
});

/** Durum değişikliği: teklif silinmez, durumu değişir. */
offerRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "teklif durumu");

  const parsed = z
    .object({ status: statusEnum })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Durum geçersiz");

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update offer
         set status = ${parsed.data.status}
       where id = ${c.req.param("id")}::uuid
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows;
  });

  if (updated.length === 0) throw new HttpError(404, "Teklif bulunamadı");
  return c.json({ ok: true });
});
