/**
 * Gider kalemleri — TUR:60 (yol haritası 2. madde: gider + mal sahibi ekstresi).
 *
 * Mülke bağlı gider tutulur (tamir, aidat, temizlik, sigorta, vergi, komisyon).
 * Kayıt silinmez: yanlış giriş düzeltilir, vazgeçilen gider "iptal" olur ve
 * ekstre hesabına girmez (geçmiş iz kalır).
 * Para kuruş tam sayı; metin girişi sunucuda kuruşa çevrilir (tek kaynak).
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const expenseRoutes = new Hono();

const CATEGORIES = [
  "tamir",
  "aidat",
  "temizlik",
  "sigorta",
  "vergi",
  "komisyon",
  "diger",
] as const;

const CATEGORY_TR: Record<string, string> = {
  tamir: "Tamir / bakım",
  aidat: "Aidat",
  temizlik: "Temizlik",
  sigorta: "Sigorta",
  vergi: "Vergi / harç",
  komisyon: "Komisyon",
  diger: "Diğer",
};

type ExpenseRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  district: string | null;
  ownerId: string | null;
  ownerName: string | null;
  category: string;
  amountKurus: string | number;
  spentOn: string;
  vendor: string | null;
  note: string | null;
  status: string;
  createdByName: string | null;
};

const createSchema = z.object({
  propertyId: z.uuid(),
  category: z.enum(CATEGORIES).default("diger"),
  amountText: z.string().min(1, "Tutar gerekli").max(40),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih gerekli"),
  vendor: z.string().max(120).optional(),
  note: z.string().max(600).optional(),
});

const updateSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  amountText: z.string().max(40).optional(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendor: z.string().max(120).nullish(),
  note: z.string().max(600).nullish(),
});

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function amountKurusOf(text: string, what = "Tutar"): number {
  try {
    const value = parseTryToKurus(text);
    if (value <= 0) throw new Error("sıfırdan büyük olmalı");
    return value;
  } catch (error) {
    throw new HttpError(400, `${what}: ${(error as Error).message}`);
  }
}

function present(row: ExpenseRow) {
  const amount = Number(row.amountKurus);
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    propertyTitle: String(row.propertyTitle),
    district: row.district === null ? null : String(row.district),
    ownerId: row.ownerId === null ? null : String(row.ownerId),
    ownerName: row.ownerName === null ? null : String(row.ownerName),
    category: String(row.category),
    categoryLabel: CATEGORY_TR[String(row.category)] ?? String(row.category),
    amountKurus: amount,
    amountText: formatTry(amount),
    spentOn: String(row.spentOn),
    vendor: row.vendor === null ? null : String(row.vendor),
    note: row.note === null ? null : String(row.note),
    status: String(row.status),
    statusLabel: String(row.status) === "iptal" ? "İptal" : "Aktif",
    createdByName: row.createdByName === null ? null : String(row.createdByName),
  };
}

/** Mülkün mal sahibi tek kaynaktan: property_owner varsa o, yoksa mülkün sahibi (K-84). */
const LIST_SQL = sql`
  select e.id, e.property_id as "propertyId", pr.title as "propertyTitle", pr.district,
         coalesce(po.person_id, pr.owner_person_id) as "ownerId",
         owner.full_name as "ownerName",
         e.category, e.amount_kurus as "amountKurus", e.spent_on::text as "spentOn",
         e.vendor, e.note, e.status, u.full_name as "createdByName"
    from expense e
    join property pr on pr.id = e.property_id
    left join lateral (
      select person_id from property_owner where property_id = pr.id order by created_at limit 1
    ) po on true
    left join person owner on owner.id = coalesce(po.person_id, pr.owner_person_id)
    left join app_user u on u.id = e.created_by_user_id
`;

/** Gider listesi: mülk, mal sahibi, tarih aralığı ve durum süzgeci. */
expenseRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const propertyId = (c.req.query("propertyId") ?? "").trim();
  const ownerId = (c.req.query("ownerId") ?? "").trim();
  const from = (c.req.query("from") ?? "").trim();
  const to = (c.req.query("to") ?? "").trim();
  const status = (c.req.query("status") ?? "aktif").trim();
  if (propertyId && !z.uuid().safeParse(propertyId).success) throw new HttpError(400, "propertyId geçersiz");
  if (ownerId && !z.uuid().safeParse(ownerId).success) throw new HttpError(400, "ownerId geçersiz");

  const rows = await withTenant(session.tenantId, async (tx) => {
    const where = sql`
      where true
        ${propertyId ? sql`and e.property_id = ${propertyId}::uuid` : sql``}
        ${ownerId ? sql`and coalesce(po.person_id, pr.owner_person_id) = ${ownerId}::uuid` : sql``}
        ${dateRe.test(from) ? sql`and e.spent_on >= ${from}::date` : sql``}
        ${dateRe.test(to) ? sql`and e.spent_on <= ${to}::date` : sql``}
        ${status === "all" ? sql`` : sql`and e.status = 'aktif'`}
    `;
    const result = await tx.execute(sql`${LIST_SQL} ${where} order by e.spent_on desc, e.created_at desc limit 500`);
    return (result as unknown as { rows: ExpenseRow[] }).rows;
  });

  const items = rows.map(present);
  const total = items.filter((row) => row.status === "aktif").reduce((sum, row) => sum + row.amountKurus, 0);
  return c.json({
    count: items.length,
    items,
    totalKurus: total,
    totalText: formatTry(total),
    categories: CATEGORIES.map((category) => ({ category, label: CATEGORY_TR[category] })),
    statuses: [
      { status: "aktif", label: "Aktif" },
      { status: "iptal", label: "İptal" },
      { status: "all", label: "Tümü" },
    ],
  });
});

/** Yeni gider. */
expenseRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "gider kaydı");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Gider bilgisi geçersiz");
  }
  const input = parsed.data;
  const amount = amountKurusOf(input.amountText);

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .where(eq(schema.properties.id, input.propertyId))
      .limit(1);
    if (!property) throw new HttpError(404, "Mülk bulunamadı");

    const result = await tx.execute(sql`
      insert into expense
        (tenant_id, property_id, category, amount_kurus, spent_on, vendor, note, created_by_user_id)
      values (${session.tenantId}::uuid, ${input.propertyId}::uuid, ${input.category},
              ${amount}, ${input.spentOn}::date, ${input.vendor?.trim() || null},
              ${input.note?.trim() || null}, ${session.userId}::uuid)
      returning id
    `);
    const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!id) throw new HttpError(409, "Gider kaydedilemedi, tekrar deneyin");

    const detail = await tx.execute(sql`${LIST_SQL} where e.id = ${id}::uuid`);
    const row = (detail as unknown as { rows: ExpenseRow[] }).rows[0];
    if (!row) throw new HttpError(409, "Gider kaydedilemedi");
    return present(row);
  });

  return c.json(created, 201);
});

/** Düzeltme: tutar, tarih, kategori, satıcı, not. */
expenseRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "gider düzeltme");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Gider bilgisi geçersiz");
  const input = parsed.data;
  const amount = input.amountText === undefined ? null : amountKurusOf(input.amountText);

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update expense
         set category = coalesce(${input.category ?? null}, category),
             amount_kurus = coalesce(${amount}, amount_kurus),
             spent_on = coalesce(${input.spentOn ?? null}::date, spent_on),
             vendor = coalesce(${input.vendor ?? null}, vendor),
             note = coalesce(${input.note ?? null}, note),
             updated_at = now()
       where id = ${c.req.param("id")}::uuid
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows;
  });

  if (updated.length === 0) throw new HttpError(404, "Gider bulunamadı");
  return c.json({ ok: true });
});

/** İptal: satır silinmez, status = 'iptal' olur; ekstre hesabından düşer. */
expenseRoutes.post("/:id/void", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "gider iptali");

  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update expense
         set status = 'iptal',
             note = case
                      when ${reason} = '' then note
                      when note is null or note = '' then ${reason}
                      else note || ' · iptal: ' || ${reason}
                    end,
             updated_at = now()
       where id = ${c.req.param("id")}::uuid and status = 'aktif'
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows;
  });

  if (updated.length === 0) throw new HttpError(404, "Gider bulunamadı veya zaten iptal");
  return c.json({ ok: true });
});
