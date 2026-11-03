/**
 * Arıza / bakım talebi — TUR:35 (yol haritası SIRA 7).
 *
 * Kiracı arıza bildirir (telefonla, ofise), ofis kaydı açar; durum ilerler:
 * açık → işlemde → bitti / iptal. Fotoğraf eklenebilir (mülk medyası altyapısı).
 * Talep silinmez; masraf ve not sonradan yazılır.
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";
import { putObject, sha256Of } from "../storage.js";

export const maintenanceRoutes = new Hono();

const CATEGORY_TR: Record<string, string> = {
  electrical: "Elektrik",
  plumbing: "Su / tesisat",
  heating: "Isıtma",
  elevator: "Asansör",
  appliance: "Beyaz eşya",
  other: "Diğer",
};

const PRIORITY_TR: Record<string, string> = { low: "Düşük", normal: "Normal", urgent: "Acil" };
const STATUS_TR: Record<string, string> = {
  open: "Açık",
  in_progress: "İşlemde",
  done: "Bitti",
  cancelled: "İptal",
};

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const createSchema = z.object({
  propertyId: z.string().uuid(),
  listingId: z.string().uuid().nullish(),
  personId: z.string().uuid().nullish(),
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  category: z.enum(["electrical", "plumbing", "heating", "elevator", "appliance", "other"]).default("other"),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  reportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
  note: z.string().max(600).nullish(),
  costText: z.string().max(40).nullish(),
  priority: z.enum(["low", "normal", "urgent"]).optional(),
});

type Row = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  district: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  reportedAt: string;
  daysOpen: number;
  costKurus: string | number | null;
  note: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  photoCount: number;
};

const LIST_SQL = sql`
  select m.id, m.property_id as "propertyId", pr.title as "propertyTitle",
         pr.district, m.title, m.description, m.category, m.priority, m.status,
         m.reported_at::text as "reportedAt",
         (current_date - m.reported_at)::int as "daysOpen",
         m.cost_kurus as "costKurus", m.note,
         per.full_name as "reporterName", per.phone as "reporterPhone",
         (select count(*)::int from property_media pm where pm.maintenance_id = m.id)
           as "photoCount"
    from maintenance_request m
    join property pr on pr.id = m.property_id
    left join person per on per.id = m.person_id
`;

function present(row: Row) {
  const cost = row.costKurus === null ? null : Number(row.costKurus);
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    propertyTitle: String(row.propertyTitle),
    district: row.district,
    title: String(row.title),
    description: row.description,
    category: String(row.category),
    categoryLabel: CATEGORY_TR[String(row.category)] ?? String(row.category),
    priority: String(row.priority),
    priorityLabel: PRIORITY_TR[String(row.priority)] ?? String(row.priority),
    status: String(row.status),
    statusLabel: STATUS_TR[String(row.status)] ?? String(row.status),
    reportedAt: String(row.reportedAt),
    daysOpen: Number(row.daysOpen),
    costKurus: cost,
    costText: cost === null ? null : formatTry(cost),
    note: row.note,
    reporterName: row.reporterName,
    reporterPhone: row.reporterPhone,
    photoCount: Number(row.photoCount),
  };
}

maintenanceRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const status = (c.req.query("status") ?? "").trim();
  const propertyId = (c.req.query("propertyId") ?? "").trim();
  if (status && !Object.keys(STATUS_TR).includes(status)) throw new HttpError(400, "Durum geçersiz");
  if (propertyId && !z.string().uuid().safeParse(propertyId).success) {
    throw new HttpError(400, "propertyId geçersiz");
  }

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      ${LIST_SQL}
      where true
        ${status ? sql`and m.status = ${status}` : sql``}
        ${propertyId ? sql`and m.property_id = ${propertyId}::uuid` : sql``}
      order by (m.status in ('open','in_progress')) desc, m.reported_at desc
      limit 300
    `);
    return (result as unknown as { rows: Row[] }).rows;
  });

  return c.json({ count: rows.length, items: rows.map(present) });
});

maintenanceRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "arıza kaydı");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz arıza kaydı");
  }
  const input = parsed.data;

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .where(eq(schema.properties.id, input.propertyId))
      .limit(1);
    if (!property) throw new HttpError(404, "Mülk bulunamadı");

    const result = await tx.execute(sql`
      insert into maintenance_request
        (tenant_id, property_id, listing_id, person_id, title, description,
         category, priority, reported_at, created_by_user_id)
      values (${session.tenantId}::uuid, ${input.propertyId}::uuid,
              ${input.listingId ?? null}::uuid, ${input.personId ?? null}::uuid,
              ${input.title.trim()}, ${input.description?.trim() || null},
              ${input.category}, ${input.priority},
              coalesce(${input.reportedAt ?? null}::date, current_date),
              ${session.userId}::uuid)
      returning id
    `);
    const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!id) throw new HttpError(409, "Kayıt oluşturulamadı");

    const detail = await tx.execute(sql`${LIST_SQL} where m.id = ${id}::uuid`);
    const row = (detail as unknown as { rows: Row[] }).rows[0];
    if (!row) throw new HttpError(409, "Kayıt oluşturulamadı");
    return present(row);
  });

  return c.json(created, 201);
});

maintenanceRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "arıza durumu");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Arıza bilgisi geçersiz");
  const input = parsed.data;

  let costKurus: number | null = null;
  if (input.costText && input.costText.trim() !== "") {
    try {
      costKurus = parseTryToKurus(input.costText);
    } catch (error) {
      throw new HttpError(400, `Masraf: ${(error as Error).message}`);
    }
  }

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update maintenance_request
         set status = coalesce(${input.status ?? null}, status),
             note = coalesce(${input.note ?? null}, note),
             cost_kurus = coalesce(${costKurus}, cost_kurus),
             priority = coalesce(${input.priority ?? null}, priority),
             resolved_at = case
               when ${input.status ?? null} in ('done', 'cancelled') then now()
               when ${input.status ?? null} = 'open' then null
               else resolved_at end,
             updated_at = now()
       where id = ${c.req.param("id")}::uuid
      returning id
    `);
    const rows = (result as unknown as { rows: Array<{ id: string }> }).rows;
    if (rows.length === 0) throw new HttpError(404, "Arıza kaydı bulunamadı");

    const detail = await tx.execute(sql`${LIST_SQL} where m.id = ${rows[0]!.id}::uuid`);
    return (detail as unknown as { rows: Row[] }).rows[0] ?? null;
  });

  if (!updated) throw new HttpError(404, "Arıza kaydı bulunamadı");
  return c.json(present(updated));
});

/** Talep fotoğrafı — mülk medyası deposuna yazılır, talebe bağlanır. */
maintenanceRoutes.post("/:id/photos", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "arıza fotoğrafı");
  const requestId = c.req.param("id");

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new HttpError(400, "Dosya gerekli (file)");
  if (file.size === 0) throw new HttpError(400, "Dosya boş");
  if (file.size > 15 * 1024 * 1024) throw new HttpError(400, "Fotoğraf 15 MB'dan büyük");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type.startsWith("image/") ? file.type : (IMAGE_MIME[ext] ?? null);
  if (!mimeType) throw new HttpError(400, "Yalnız fotoğraf (JPG/PNG/WEBP)");

  const request = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({ propertyId: schema.maintenanceRequests.propertyId })
      .from(schema.maintenanceRequests)
      .where(eq(schema.maintenanceRequests.id, requestId))
      .limit(1);
    return row ?? null;
  });
  if (!request) throw new HttpError(404, "Arıza kaydı bulunamadı");

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256Of(bytes);
  await putObject(hash, bytes);

  const created = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.propertyMedia)
      .values({
        tenantId: session.tenantId,
        propertyId: request.propertyId,
        maintenanceId: requestId,
        kind: "image",
        title: String(form.get("title") ?? "").trim() || null,
        sha256: hash,
        mimeType,
        sizeBytes: bytes.length,
        createdByUserId: session.userId,
      })
      .returning({ id: schema.propertyMedia.id });
    return row!;
  });

  return c.json(
    {
      id: created.id,
      url: `/api/v1/properties/${request.propertyId}/media/${created.id}/file`,
    },
    201,
  );
});

maintenanceRoutes.get("/:id/photos", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const requestId = c.req.param("id");

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.propertyMedia.id,
        propertyId: schema.propertyMedia.propertyId,
        title: schema.propertyMedia.title,
      })
      .from(schema.propertyMedia)
      .where(and(eq(schema.propertyMedia.maintenanceId, requestId))),
  );

  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: `/api/v1/properties/${row.propertyId}/media/${row.id}/file`,
    })),
  });
});
