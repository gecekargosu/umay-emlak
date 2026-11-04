/**
 * Teslim tutanağı — TUR:28 (yol haritası SIRA 2).
 *
 * Giriş (move_in) ve çıkış (move_out) tutanağı: demirbaş satırları + durum,
 * çıkışta depozito kesintisi ve iade hesabı. Tutanak silinmez.
 * Depozito sözleşmeden gelir; kesinti ve iade kuruş olarak saklanır (K-13).
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";
import { getObject } from "../storage.js";
import { buildHandoverPdf } from "../documents/handover-pdf.js";

export const handoverRoutes = new Hono();

const itemSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(0).max(999).default(1),
  condition: z.string().max(120).optional(),
});

const createSchema = z.object({
  kind: z.enum(["move_in", "move_out"]),
  happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).max(80).default([]),
  deductionText: z.string().max(40).optional(),
  deductionNote: z.string().max(500).optional(),
});

type Row = {
  id: string;
  kind: string;
  happenedOn: string;
  items: Array<{ name: string; quantity: number; condition?: string }>;
  depositKurus: string | number;
  deductionKurus: string | number;
  deductionNote: string | null;
  refundKurus: string | number;
  createdAt: string;
};

function present(row: Row) {
  const deposit = Number(row.depositKurus ?? 0);
  const deduction = Number(row.deductionKurus ?? 0);
  const refund = Number(row.refundKurus ?? 0);
  return {
    id: String(row.id),
    kind: String(row.kind),
    kindLabel: String(row.kind) === "move_in" ? "Giriş" : "Çıkış",
    happenedOn: String(row.happenedOn),
    items: row.items ?? [],
    depositKurus: deposit,
    depositText: formatTry(deposit),
    deductionKurus: deduction,
    deductionText: formatTry(deduction),
    deductionNote: row.deductionNote,
    refundKurus: refund,
    refundText: formatTry(refund),
    createdAt: String(row.createdAt),
  };
}

handoverRoutes.get("/:id/handovers", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const contractId = c.req.param("id");

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select id, kind, happened_on::text as "happenedOn", items,
             deposit_kurus as "depositKurus", deduction_kurus as "deductionKurus",
             deduction_note as "deductionNote", refund_kurus as "refundKurus",
             created_at as "createdAt"
        from handover_protocol
       where contract_id = ${contractId}::uuid
       order by happened_on desc, created_at desc
    `);
    return (result as unknown as { rows: Row[] }).rows;
  });

  return c.json({ items: rows.map(present) });
});

handoverRoutes.post("/:id/handovers", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "teslim tutanağı");
  const contractId = c.req.param("id");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz tutanak");
  }
  const input = parsed.data;

  let deductionKurus = 0;
  if (input.deductionText && input.deductionText.trim() !== "") {
    try {
      deductionKurus = parseTryToKurus(input.deductionText);
    } catch (error) {
      throw new HttpError(400, `Kesinti: ${(error as Error).message}`);
    }
  }
  if (deductionKurus < 0) throw new HttpError(400, "Kesinti negatif olamaz");

  const created = await withTenant(session.tenantId, async (tx) => {
    const [contract] = await tx
      .select({
        id: schema.contracts.id,
        depositKurus: schema.contracts.depositKurus,
      })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, contractId))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");

    const deposit = Number(contract.depositKurus ?? 0);
    const refund = input.kind === "move_out" ? Math.max(0, deposit - deductionKurus) : 0;

    const result = await tx.execute(sql`
      insert into handover_protocol
        (tenant_id, contract_id, kind, happened_on, items, deposit_kurus,
         deduction_kurus, deduction_note, refund_kurus, created_by_user_id)
      values (${session.tenantId}::uuid, ${contractId}::uuid, ${input.kind},
              ${input.happenedOn}::date, ${JSON.stringify(input.items)}::jsonb,
              ${deposit}, ${deductionKurus}, ${input.deductionNote?.trim() || null},
              ${refund}, ${session.userId}::uuid)
      returning id, kind, happened_on::text as "happenedOn", items,
                deposit_kurus as "depositKurus", deduction_kurus as "deductionKurus",
                deduction_note as "deductionNote", refund_kurus as "refundKurus",
                created_at as "createdAt"
    `);
    const row = (result as unknown as { rows: Row[] }).rows[0];
    if (!row) throw new HttpError(409, "Tutanak kaydedilemedi");
    return present(row);
  });

  return c.json(created, 201);
});

type PdfRow = {
  id: string;
  kind: string;
  happenedOn: string;
  items: Array<{ name: string; quantity: number; condition?: string }> | null;
  depositKurus: string | number;
  deductionKurus: string | number;
  deductionNote: string | null;
  refundKurus: string | number;
  createdAt: string;
  contractStart: string;
  contractEnd: string | null;
  rentKurus: string | number;
  dueDay: number | null;
  propertyId: string;
  title: string;
  address: string | null;
  district: string | null;
  city: string | null;
  tenantName: string;
  tenantPhone: string | null;
  ownerName: string | null;
  createdBy: string | null;
};

/**
 * Tutanağın yazdırılabilir hali (TUR:52): mülk fotoğrafları + imza alanları.
 *Kayıt değişmez; PDF her istendiğinde kayıttan yeniden üretilir.
 */
handoverRoutes.get("/:id/handovers/:handoverId/pdf", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const contractId = c.req.param("id");
  const handoverId = c.req.param("handoverId");
  if (!z.uuid().safeParse(handoverId).success) throw new HttpError(404, "Tutanak bulunamadı");

  const found = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select h.id, h.kind, h.happened_on::text as "happenedOn", h.items,
             h.deposit_kurus as "depositKurus", h.deduction_kurus as "deductionKurus",
             h.deduction_note as "deductionNote", h.refund_kurus as "refundKurus",
             h.created_at as "createdAt",
             c.start_date::text as "contractStart", c.end_date::text as "contractEnd",
             c.rent_kurus as "rentKurus", c.due_day as "dueDay",
             p.id as "propertyId", p.title, p.address, p.district, p.city,
             t.full_name as "tenantName", t.phone as "tenantPhone",
             o.full_name as "ownerName", u.full_name as "createdBy"
        from handover_protocol h
        join contract c on c.id = h.contract_id
        join listing l on l.id = c.listing_id
        join property p on p.id = l.property_id
        join person t on t.id = c.tenant_person_id
        left join person o on o.id = p.owner_person_id
        left join app_user u on u.id = h.created_by_user_id
       where h.id = ${handoverId}::uuid and h.contract_id = ${contractId}::uuid
    `);
    const row = (result as unknown as { rows: PdfRow[] }).rows[0];
    if (!row) return null;

    // Tutanağa mülkün gerçek fotoğrafları girer; kutu boş kalmasın diye
    // yalnız JPEG seçilir (PDF'e gömülebilen tek biçim).
    const media = await tx.execute(sql`
      select sha256, title
        from property_media
       where property_id = ${row.propertyId}::uuid
         and kind = 'image'
         and mime_type = 'image/jpeg'
         and maintenance_id is null
       order by created_at
       limit 3
    `);
    return {
      row,
      photoRows: (media as unknown as { rows: Array<{ sha256: string; title: string | null }> })
        .rows,
    };
  });

  if (!found) throw new HttpError(404, "Tutanak bulunamadı");

  const photos: Array<{ bytes: Buffer; caption: string | null }> = [];
  for (const media of found.photoRows) {
    const bytes = await getObject(media.sha256);
    if (bytes) photos.push({ bytes, caption: media.title });
  }

  const row = found.row;
  const asDate = (iso: string) => iso.split("-").reverse().join(".");
  const pdf = buildHandoverPdf({
    handoverId: String(row.id),
    kind: String(row.kind) === "move_in" ? "move_in" : "move_out",
    happenedOn: asDate(row.happenedOn),
    propertyTitle: row.title,
    address: row.address,
    district: row.district,
    city: row.city,
    ownerName: row.ownerName ?? "(mal sahibi kayitli degil)",
    tenantName: row.tenantName,
    tenantPhone: row.tenantPhone,
    contractStart: asDate(row.contractStart),
    contractEnd: row.contractEnd ? asDate(row.contractEnd) : null,
    rentText: formatTry(Number(row.rentKurus)),
    depositText: formatTry(Number(row.depositKurus)),
    dueDay: row.dueDay === null ? null : Number(row.dueDay),
    items: row.items ?? [],
    deductionText: formatTry(Number(row.deductionKurus)),
    deductionNote: row.deductionNote,
    refundText: formatTry(Number(row.refundKurus)),
    photos,
    createdBy: row.createdBy ?? "—",
    createdAtText: new Date(String(row.createdAt)).toLocaleString("tr-TR"),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="teslim-tutanagi-${String(row.id).slice(0, 8)}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
