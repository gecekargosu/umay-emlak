/**
 * Randevu / yer gösterme — TUR:31 (yol haritası SIRA 5).
 *
 * Kaynak dosyadaki akış: aday + portföy + personel + randevu; sonuç (geldi,
 * gelmedi, iptal) kayda geçer ve sonuçtan teklife bağlantı kurulur.
 *
 * Kural: randevu silinmez; durumu değişir ve sonuç notu saklanır. Adayın
 * telefonu/adı kişi kaydından gelir (mükerrer yazım yok).
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const appointmentRoutes = new Hono();

const STATUS_TR: Record<string, string> = {
  planned: "Planlandı",
  done: "Geldi",
  no_show: "Gelmedi",
  cancelled: "İptal",
};

const createSchema = z.object({
  personId: z.uuid(),
  listingId: z.uuid().nullish(),
  staffUserId: z.uuid().nullish(),
  scheduledAt: z.string().min(16).max(40),
  durationMin: z.number().int().min(10).max(240).default(30),
  place: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

const updateSchema = z.object({
  status: z.enum(["planned", "done", "no_show", "cancelled"]).optional(),
  resultNote: z.string().max(600).nullish(),
  scheduledAt: z.string().min(16).max(40).optional(),
  place: z.string().max(200).nullish(),
  offerId: z.uuid().nullish(),
});

type Row = {
  id: string;
  personId: string;
  personName: string;
  personPhone: string | null;
  personStage: string | null;
  listingId: string | null;
  propertyTitle: string | null;
  district: string | null;
  staffName: string | null;
  scheduledAt: string;
  durationMin: number;
  place: string | null;
  status: string;
  resultNote: string | null;
  offerId: string | null;
};

const LIST_SQL = sql`
  select a.id, a.person_id as "personId", p.full_name as "personName",
         p.phone as "personPhone", p.candidate_stage as "personStage",
         a.listing_id as "listingId", pr.title as "propertyTitle", pr.district,
         u.full_name as "staffName", a.scheduled_at as "scheduledAt",
         a.duration_min as "durationMin", a.place, a.status,
         a.result_note as "resultNote", a.offer_id as "offerId"
    from appointment a
    join person p on p.id = a.person_id
    left join listing l on l.id = a.listing_id
    left join property pr on pr.id = l.property_id
    left join app_user u on u.id = a.staff_user_id
`;

function present(row: Row) {
  const scheduledAt = String(row.scheduledAt);
  const when = new Date(scheduledAt);
  return {
    id: String(row.id),
    personId: String(row.personId),
    personName: String(row.personName),
    personPhone: row.personPhone,
    personStage: row.personStage,
    listingId: row.listingId,
    propertyTitle: row.propertyTitle,
    district: row.district,
    staffName: row.staffName,
    scheduledAt,
    date: scheduledAt.slice(0, 10),
    time: scheduledAt.slice(11, 16),
    dateText: when.toLocaleDateString("tr-TR"),
    durationMin: Number(row.durationMin),
    place: row.place,
    status: String(row.status),
    statusLabel: STATUS_TR[String(row.status)] ?? String(row.status),
    resultNote: row.resultNote,
    offerId: row.offerId,
  };
}

/** Randevular — tarih aralığına göre (varsayılan: bugünden itibaren 60 gün + geçmiş 7 gün). */
appointmentRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const from = (c.req.query("from") ?? "").trim();
  const to = (c.req.query("to") ?? "").trim();
  const status = (c.req.query("status") ?? "").trim();
  for (const value of [from, to]) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "Tarih geçersiz");
  }
  if (status && !["planned", "done", "no_show", "cancelled"].includes(status)) {
    throw new HttpError(400, "Durum geçersiz");
  }

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      ${LIST_SQL}
      where true
        ${from ? sql`and a.scheduled_at >= ${from}::date` : sql`and a.scheduled_at >= current_date - 30`}
        ${to ? sql`and a.scheduled_at < (${to}::date + 1)` : sql`and a.scheduled_at < current_date + 365`}
        ${status ? sql`and a.status = ${status}` : sql``}
      order by a.scheduled_at asc
      limit 300
    `);
    return (result as unknown as { rows: Row[] }).rows;
  });

  return c.json({ count: rows.length, items: rows.map(present) });
});

appointmentRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "randevu");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz randevu");
  }
  const input = parsed.data;

  const created = await withTenant(session.tenantId, async (tx) => {
    const [person] = await tx
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.id, input.personId))
      .limit(1);
    if (!person) throw new HttpError(404, "Kişi (aday) bulunamadı");

    if (input.listingId) {
      const [listing] = await tx
        .select({ id: schema.listings.id })
        .from(schema.listings)
        .where(eq(schema.listings.id, input.listingId))
        .limit(1);
      if (!listing) throw new HttpError(404, "İlan bulunamadı");
    }

    const inserted = await tx.execute(sql`
      insert into appointment
        (tenant_id, person_id, listing_id, staff_user_id, scheduled_at, duration_min,
         place, created_by_user_id)
      values (${session.tenantId}::uuid, ${input.personId}::uuid,
              ${input.listingId ?? null}::uuid, ${input.staffUserId ?? session.userId}::uuid,
              ${input.scheduledAt}::timestamptz, ${input.durationMin},
              ${input.place?.trim() || null}, ${session.userId}::uuid)
      returning id
    `);
    const id = (inserted as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!id) throw new HttpError(409, "Randevu kaydedilemedi");

    const detail = await tx.execute(sql`${LIST_SQL} where a.id = ${id}::uuid`);
    const row = (detail as unknown as { rows: Row[] }).rows[0];
    if (!row) throw new HttpError(409, "Randevu kaydedilemedi");
    return present(row);
  });

  return c.json(created, 201);
});

/** Sonuç: geldi / gelmedi / iptal + not. Teklif bağlantısı isteğe bağlı. */
appointmentRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "randevu sonucu");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Randevu bilgisi geçersiz");
  const input = parsed.data;

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update appointment
         set status = coalesce(${input.status ?? null}, status),
             result_note = coalesce(${input.resultNote ?? null}, result_note),
             scheduled_at = coalesce(${input.scheduledAt ?? null}::timestamptz, scheduled_at),
             place = coalesce(${input.place ?? null}, place),
             offer_id = coalesce(${input.offerId ?? null}::uuid, offer_id),
             updated_at = now()
       where id = ${c.req.param("id")}::uuid
      returning id
    `);
    const rows = (result as unknown as { rows: Array<{ id: string }> }).rows;
    if (rows.length === 0) throw new HttpError(404, "Randevu bulunamadı");

    const detail = await tx.execute(sql`${LIST_SQL} where a.id = ${rows[0]!.id}::uuid`);
    return (detail as unknown as { rows: Row[] }).rows[0] ?? null;
  });

  if (!updated) throw new HttpError(404, "Randevu bulunamadı");
  return c.json(present(updated));
});
