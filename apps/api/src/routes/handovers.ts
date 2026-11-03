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
