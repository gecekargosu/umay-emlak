/**
 * DASK / poliçe bitiş takibi — TUR:29 (yol haritası SIRA 3).
 *
 * Kullanıcı isteği: ana sayfadaki "DASK / poliçe" kutusu "planlı" demesin;
 * gerçek poliçe kaydı tutulsun ve bitişten 30 gün önce uyarı çıksın.
 *
 * Kural: poliçe silinmez (yanlış giriş düzeltilir). Süre bitince "süresi geçti"
 * olarak listede kalır; yenileme yeni satır açar (geçmiş korunur).
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const policyRoutes = new Hono();

const KINDS = ["dask", "konut", "sorumluluk", "isyeri", "hayat", "diger"] as const;

const KIND_TR: Record<string, string> = {
  dask: "DASK",
  konut: "Konut sigortası",
  sorumluluk: "Sorumluluk",
  isyeri: "İş yeri",
  hayat: "Hayat",
  diger: "Diğer",
};

const createSchema = z.object({
  propertyId: z.uuid(),
  kind: z.enum(KINDS).default("dask"),
  insurer: z.string().max(120).optional(),
  policyNo: z.string().max(80).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  premiumText: z.string().max(40).optional(),
  note: z.string().max(600).optional(),
});

const updateSchema = z.object({
  insurer: z.string().max(120).nullish(),
  policyNo: z.string().max(80).nullish(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  premiumText: z.string().max(40).nullish(),
  note: z.string().max(600).nullish(),
});

type PolicyRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  district: string | null;
  kind: string;
  insurer: string | null;
  policyNo: string | null;
  startDate: string | null;
  endDate: string;
  premiumKurus: string | number | null;
  note: string | null;
  daysLeft: number;
};

function premiumKurusOf(text: string | null | undefined): number | null {
  if (!text || text.trim() === "") return null;
  try {
    return parseTryToKurus(text);
  } catch (error) {
    throw new HttpError(400, `Prim: ${(error as Error).message}`);
  }
}

function present(row: PolicyRow) {
  const premium = row.premiumKurus === null ? null : Number(row.premiumKurus);
  const daysLeft = Number(row.daysLeft);
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    propertyTitle: String(row.propertyTitle),
    district: row.district === null ? null : String(row.district),
    kind: String(row.kind),
    kindLabel: KIND_TR[String(row.kind)] ?? String(row.kind),
    insurer: row.insurer === null ? null : String(row.insurer),
    policyNo: row.policyNo === null ? null : String(row.policyNo),
    startDate: row.startDate === null ? null : String(row.startDate),
    endDate: String(row.endDate),
    premiumKurus: premium,
    premiumText: premium === null ? null : formatTry(premium),
    note: row.note === null ? null : String(row.note),
    daysLeft,
    expired: daysLeft < 0,
    warning: daysLeft >= 0 && daysLeft <= 30,
  };
}

const LIST_SQL = sql`
  select p.id, p.property_id as "propertyId", pr.title as "propertyTitle",
         pr.district, p.kind, p.insurer, p.policy_no as "policyNo",
         p.start_date::text as "startDate", p.end_date::text as "endDate",
         p.premium_kurus as "premiumKurus", p.note,
         (p.end_date - current_date)::int as "daysLeft"
    from policy p
    join property pr on pr.id = p.property_id
`;

/** Poliçeler: bitişe göre artan sırada. `filter=warning|expired|all`. */
policyRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const filter = (c.req.query("filter") ?? "all").trim();
  const propertyId = (c.req.query("propertyId") ?? "").trim();
  if (propertyId && !z.uuid().safeParse(propertyId).success) {
    throw new HttpError(400, "propertyId geçersiz");
  }

  const rows = await withTenant(session.tenantId, async (tx) => {
    const where = sql`
      where true
        ${filter === "warning" ? sql`and p.end_date between current_date and current_date + 30` : sql``}
        ${filter === "expired" ? sql`and p.end_date < current_date` : sql``}
        ${propertyId ? sql`and p.property_id = ${propertyId}::uuid` : sql``}
    `;
    const result = await tx.execute(sql`${LIST_SQL} ${where} order by p.end_date asc limit 300`);
    return (result as unknown as { rows: PolicyRow[] }).rows;
  });

  return c.json({
    count: rows.length,
    items: rows.map(present),
    kinds: KINDS.map((kind) => ({ kind, label: KIND_TR[kind] })),
  });
});

/** Yeni poliçe (yenileme de yeni satırdır; eski kayıt geçmiş olarak kalır). */
policyRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "poliçe kaydı");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz poliçe");
  }
  const input = parsed.data;
  const premium = premiumKurusOf(input.premiumText);

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .where(eq(schema.properties.id, input.propertyId))
      .limit(1);
    if (!property) throw new HttpError(404, "Mülk bulunamadı");

    const result = await tx.execute(sql`
      insert into policy
        (tenant_id, property_id, kind, insurer, policy_no, start_date, end_date,
         premium_kurus, note, created_by_user_id)
      values (${session.tenantId}::uuid, ${input.propertyId}::uuid, ${input.kind},
              ${input.insurer?.trim() || null}, ${input.policyNo?.trim() || null},
              ${input.startDate ?? null}::date, ${input.endDate}::date,
              ${premium}, ${input.note?.trim() || null}, ${session.userId}::uuid)
      returning id
    `);
    const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!id) throw new HttpError(409, "Poliçe kaydedilemedi, tekrar deneyin");

    const detail = await tx.execute(
      sql`${LIST_SQL} where p.id = ${id}::uuid`,
    );
    const row = (detail as unknown as { rows: PolicyRow[] }).rows[0];
    if (!row) throw new HttpError(409, "Poliçe kaydedilemedi");
    return present(row);
  });

  return c.json(created, 201);
});

/** Düzeltme: prim, tarih, sigorta şirketi, not. */
policyRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "poliçe düzeltme");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Poliçe bilgisi geçersiz");
  const input = parsed.data;

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update policy
         set insurer = coalesce(${input.insurer ?? null}, insurer),
             policy_no = coalesce(${input.policyNo ?? null}, policy_no),
             start_date = coalesce(${input.startDate ?? null}::date, start_date),
             end_date = coalesce(${input.endDate ?? null}::date, end_date),
             note = coalesce(${input.note ?? null}, note),
             premium_kurus = coalesce(${premiumKurusOf(input.premiumText)}, premium_kurus),
             updated_at = now()
       where id = ${c.req.param("id")}::uuid
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows;
  });

  if (updated.length === 0) throw new HttpError(404, "Poliçe bulunamadı");
  return c.json({ ok: true });
});
