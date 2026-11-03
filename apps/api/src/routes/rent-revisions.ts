/**
 * Kira artışı / yenileme — TUR:30 (yol haritası SIRA 4).
 *
 * Kullanıcı notu: "TÜİK oranı görünsün ama otomatik uygulanmasın, yetkili onaylasın."
 * Bu yüzden akış: taslak (oran + eski/yeni kira) → yetkili onayı → sözleşme kirası güncellenir.
 *
 * Kural: oran ve kaynağı saklanır (hangi oranla, hangi dönemde). Taslak silinmez,
 * iptal edilir. Onayda yeni dönem tahakkuku yoksa oluşturulur.
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import {
  HttpError,
  requireApproval,
  requirePasswordChanged,
  requireWrite,
  resolveSession,
} from "../session.js";

export const rentRevisionRoutes = new Hono();

const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Dönem YYYY-MM-01 olmalı");

const createSchema = z.object({
  effectivePeriod: periodSchema,
  rateText: z.string().min(1).max(20),
  newRentText: z.string().max(40).optional(),
  source: z.enum(["tuik", "manual", "contract"]).default("tuik"),
  sourceNote: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
});

type RevisionRow = {
  id: string;
  effectivePeriod: string;
  oldRentKurus: string | number;
  rateBp: number;
  newRentKurus: string | number;
  source: string;
  sourceNote: string | null;
  status: string;
  note: string | null;
  approvedAt: string | null;
  createdAt: string;
};

const SOURCE_TR: Record<string, string> = {
  tuik: "TÜİK",
  manual: "Elle",
  contract: "Sözleşme maddesi",
};

function present(row: RevisionRow) {
  const oldRent = Number(row.oldRentKurus ?? 0);
  const newRent = Number(row.newRentKurus ?? 0);
  const rateBp = Number(row.rateBp ?? 0);
  return {
    id: String(row.id),
    effectivePeriod: String(row.effectivePeriod),
    oldRentKurus: oldRent,
    oldRentText: formatTry(oldRent),
    rateBp,
    rateText: `%${(rateBp / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`,
    newRentKurus: newRent,
    newRentText: formatTry(newRent),
    diffKurus: newRent - oldRent,
    diffText: formatTry(newRent - oldRent),
    source: String(row.source),
    sourceLabel: SOURCE_TR[String(row.source)] ?? String(row.source),
    sourceNote: row.sourceNote,
    status: String(row.status),
    statusLabel:
      String(row.status) === "approved"
        ? "Onaylandı"
        : String(row.status) === "cancelled"
          ? "İptal"
          : "Taslak",
    note: row.note,
    approvedAt: row.approvedAt,
    createdAt: String(row.createdAt),
  };
}

/** Oran metni: "25,5" / "25.5" / "%25,5" → baz puan (2550). */
function parseRateBp(text: string): number {
  const clean = text.replace(/[%\s]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0 || value > 200) {
    throw new HttpError(400, "Oran 0 ile 200 arasında olmalı (örn. 25,5)");
  }
  return Math.round(value * 100);
}

rentRevisionRoutes.get("/:id/rent-revisions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const contractId = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const [contract] = await tx
      .select({
        id: schema.contracts.id,
        rentKurus: schema.contracts.rentKurus,
        status: schema.contracts.status,
        endDate: schema.contracts.endDate,
        startDate: schema.contracts.startDate,
      })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, contractId))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");

    const rows = await tx.execute(sql`
      select id, effective_period::text as "effectivePeriod",
             old_rent_kurus as "oldRentKurus", rate_bp as "rateBp",
             new_rent_kurus as "newRentKurus", source,
             source_note as "sourceNote", status, note,
             approved_at as "approvedAt", created_at as "createdAt"
        from rent_revision
       where contract_id = ${contractId}::uuid
       order by effective_period desc
    `);

    return {
      contract: {
        id: contract.id,
        rentKurus: Number(contract.rentKurus),
        rentText: formatTry(Number(contract.rentKurus)),
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
      },
      items: (rows as unknown as { rows: RevisionRow[] }).rows.map(present),
    };
  });

  return c.json(data);
});

rentRevisionRoutes.post("/:id/rent-revisions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kira artışı taslağı");
  const contractId = c.req.param("id");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz artış bilgisi");
  }
  const input = parsed.data;
  const rateBp = parseRateBp(input.rateText);

  const created = await withTenant(session.tenantId, async (tx) => {
    const [contract] = await tx
      .select({
        id: schema.contracts.id,
        rentKurus: schema.contracts.rentKurus,
        status: schema.contracts.status,
      })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, contractId))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");
    if (contract.status !== "active") {
      throw new HttpError(409, "Yalnız aktif sözleşmede artış yapılır");
    }

    const oldRent = Number(contract.rentKurus);
    let newRent: number;
    if (input.newRentText && input.newRentText.trim() !== "") {
      try {
        newRent = parseTryToKurus(input.newRentText);
      } catch (error) {
        throw new HttpError(400, `Yeni kira: ${(error as Error).message}`);
      }
    } else {
      newRent = Math.round((oldRent * (10_000 + rateBp)) / 10_000);
    }
    if (newRent <= 0) throw new HttpError(400, "Yeni kira sıfırdan büyük olmalı");

    const inserted = await tx.execute(sql`
      insert into rent_revision
        (tenant_id, contract_id, effective_period, old_rent_kurus, rate_bp,
         new_rent_kurus, source, source_note, note, created_by_user_id)
      values (${session.tenantId}::uuid, ${contractId}::uuid, ${input.effectivePeriod}::date,
              ${oldRent}, ${rateBp}, ${newRent}, ${input.source},
              ${input.sourceNote?.trim() || null}, ${input.note?.trim() || null},
              ${session.userId}::uuid)
      on conflict (contract_id, effective_period) do nothing
      returning id, effective_period::text as "effectivePeriod",
                old_rent_kurus as "oldRentKurus", rate_bp as "rateBp",
                new_rent_kurus as "newRentKurus", source,
                source_note as "sourceNote", status, note,
                approved_at as "approvedAt", created_at as "createdAt"
    `);
    const row = (inserted as unknown as { rows: RevisionRow[] }).rows[0];
    if (!row) throw new HttpError(409, "Bu dönem için artış zaten var");
    return present(row);
  });

  return c.json(created, 201);
});

/** Onay: yetkili olmayan taslağı kesinleştiremez (K-29). */
rentRevisionRoutes.post("/:id/approve", async (c) => {
  const session = await resolveSession(c);
  requireApproval(session, "kira artışı onayı");
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const result = await withTenant(session.tenantId, async (tx) => {
    const updated = await tx.execute(sql`
      update rent_revision
         set status = 'approved', approved_by_user_id = ${session.userId},
             approved_at = now()
       where id = ${id}::uuid and status = 'proposed'
      returning contract_id as "contractId", effective_period::text as "effectivePeriod",
                new_rent_kurus as "newRentKurus"
    `);
    const row = (
      updated as unknown as {
        rows: Array<{ contractId: string; effectivePeriod: string; newRentKurus: string }>;
      }
    ).rows[0];
    if (!row) throw new HttpError(409, "Taslak bulunamadı veya zaten onaylı");

    const newRent = Number(row.newRentKurus);

    const [contract] = await tx
      .select({ dueDay: schema.contracts.dueDay, status: schema.contracts.status })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, row.contractId))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");

    await tx
      .update(schema.contracts)
      .set({ rentKurus: newRent })
      .where(eq(schema.contracts.id, row.contractId));

    // Yeni dönem tahakkuku yoksa oluşturulur; varsa dokunulmaz (tahsilat bozulmasın).
    const dueDate = `${row.effectivePeriod.slice(0, 7)}-${String(contract.dueDay).padStart(2, "0")}`;
    await tx.execute(sql`
      insert into charge (tenant_id, contract_id, period, kind, amount_kurus, due_date)
      values (${session.tenantId}::uuid, ${row.contractId}::uuid, ${row.effectivePeriod}::date,
              'rent', ${newRent}, ${dueDate}::date)
      on conflict (contract_id, period, kind) do nothing
    `);

    return { contractId: row.contractId, newRent };
  });

  return c.json({
    ok: true,
    contractId: result.contractId,
    newRentKurus: result.newRent,
    newRentText: formatTry(result.newRent),
  });
});

rentRevisionRoutes.post("/:id/cancel", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kira artışı iptali");

  const cancelled = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update rent_revision
         set status = 'cancelled'
       where id = ${c.req.param("id")}::uuid and status = 'proposed'
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows;
  });

  if (cancelled.length === 0) throw new HttpError(404, "Açık taslak bulunamadı");
  return c.json({ ok: true });
});
