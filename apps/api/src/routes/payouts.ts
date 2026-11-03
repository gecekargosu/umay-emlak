/**
 * Mal sahibine dönem aktarımı — K-25 (M09).
 *
 * Mantık: mal sahibinin hakkı, o dönemde TAHSİL EDİLEN paradır (tahakkuk değil).
 * Ofis, kira takip bedelini (K-22: elle girilir) ve varsa masrafı düşer;
 * kalan net tutar sahibine aktarılır. Aktarım ayrı kayıttır: tahsilatla
 * karıştırılmaz, silinmez, dönem başına tek kayıt olur.
 *
 * Ekstre: yazdırılabilir HTML (tarayıcıdan "Yazdır → PDF"). Tasarımlı PDF
 * üretimi ileride aynı veriden yapılacak; veri burada hazır.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatKurus, formatPeriodTr, formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const payoutRoutes = new Hono();

const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Dönem YYYY-MM-01 olmalı");

function kurusFrom(value: number | undefined, text: string | undefined, label: string): number {
  if (value !== undefined) return value;
  if (text === undefined || text.trim() === "") return 0;
  try {
    return parseTryToKurus(text);
  } catch (error) {
    throw new HttpError(400, `${label}: ${(error as Error).message}`);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type PreviewRow = {
  contract_id: string;
  rent_kurus: string;
  gross_kurus: string;
  tenant_name: string;
  owner_name: string | null;
  property_title: string;
};

/** Dönem önizlemesi: hangi sözleşmede ne kadar tahsil edilmiş? */
payoutRoutes.get("/preview", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const payload = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = periodSchema.safeParse(payload.period);
  if (!parsed.success) throw new HttpError(400, "period=YYYY-MM-01 gerekli");
  const period = parsed.data;

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select k.id as contract_id,
             k.rent_kurus,
             coalesce((select sum(p.amount_kurus)
                         from payment p join charge ch on ch.id = p.charge_id
                        where ch.contract_id = k.id and ch.period = ${period}::date), 0)::bigint
               as gross_kurus,
             per.full_name as tenant_name,
             owner.full_name as owner_name,
             prop.title as property_title
        from contract k
        join person per on per.id = k.tenant_person_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
        left join person owner on owner.id = prop.owner_person_id
       where k.status = 'active'
       order by prop.title
    `);
    return (result as unknown as { rows: PreviewRow[] }).rows;
  });

  return c.json({
    period,
    periodLabel: formatPeriodTr(period),
    items: rows.map((r) => {
      const grossKurus = Number(r.gross_kurus);
      return {
        contractId: r.contract_id,
        tenantName: r.tenant_name,
        ownerName: r.owner_name ?? "—",
        propertyTitle: r.property_title,
        rentKurus: Number(r.rent_kurus),
        rent: formatTry(Number(r.rent_kurus)),
        grossKurus,
        gross: formatTry(grossKurus),
      };
    }),
  });
});

payoutRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.ownerPayouts.id,
        period: schema.ownerPayouts.period,
        grossKurus: schema.ownerPayouts.grossKurus,
        feeKurus: schema.ownerPayouts.feeKurus,
        expenseKurus: schema.ownerPayouts.expenseKurus,
        netKurus: schema.ownerPayouts.netKurus,
        status: schema.ownerPayouts.status,
        paidAt: schema.ownerPayouts.paidAt,
        note: schema.ownerPayouts.note,
        contractId: schema.ownerPayouts.contractId,
        propertyTitle: schema.properties.title,
        ownerName: schema.persons.fullName,
      })
      .from(schema.ownerPayouts)
      .innerJoin(schema.contracts, eq(schema.contracts.id, schema.ownerPayouts.contractId))
      .innerJoin(schema.listings, eq(schema.listings.id, schema.contracts.listingId))
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .leftJoin(schema.persons, eq(schema.persons.id, schema.properties.ownerPersonId))
      .orderBy(desc(schema.ownerPayouts.period), desc(schema.ownerPayouts.createdAt))
      .limit(100),
  );

  return c.json({
    count: rows.length,
    items: rows.map((r) => ({
      ...r,
      periodLabel: formatPeriodTr(r.period),
      gross: formatTry(r.grossKurus),
      fee: formatTry(r.feeKurus),
      expense: formatTry(r.expenseKurus),
      net: formatTry(r.netKurus),
    })),
  });
});

const createPayout = z.object({
  contractId: z.uuid(),
  period: periodSchema,
  feeKurus: z.number().int().nonnegative().optional(),
  feeText: z.string().max(40).optional(),
  expenseKurus: z.number().int().nonnegative().optional(),
  expenseText: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  markPaid: z.boolean().optional(),
  method: z.enum(["transfer", "office_account", "cash_office", "card", "offset"]).optional(),
});

payoutRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "sahibe aktarım");

  const parsed = createPayout.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, `Geçersiz veri: ${parsed.error.issues[0]?.message ?? "bilinmiyor"}`);
  }
  const input = parsed.data;
  const feeKurus = kurusFrom(input.feeKurus, input.feeText, "Takip bedeli");
  const expenseKurus = kurusFrom(input.expenseKurus, input.expenseText, "Masraf");

  const created = await withTenant(session.tenantId, async (tx) => {
    const [contract] = await tx
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, input.contractId))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");

    const grossRows = await tx.execute(sql`
      select coalesce(sum(p.amount_kurus), 0)::bigint as gross
        from payment p join charge ch on ch.id = p.charge_id
       where ch.contract_id = ${input.contractId}::uuid and ch.period = ${input.period}::date
    `);
    const grossKurus = Number(
      (grossRows as unknown as { rows: Array<{ gross: string }> }).rows[0]?.gross ?? 0,
    );
    if (grossKurus <= 0) {
      throw new HttpError(409, "Bu dönemde tahsilat yok; aktarım oluşturulamaz");
    }

    const netKurus = grossKurus - feeKurus - expenseKurus;
    if (netKurus < 0) {
      throw new HttpError(400, "Takip bedeli + masraf tahsilattan büyük olamaz");
    }

    const inserted = await tx
      .insert(schema.ownerPayouts)
      .values({
        tenantId: session.tenantId,
        contractId: input.contractId,
        period: input.period,
        grossKurus,
        feeKurus,
        expenseKurus,
        netKurus,
        status: input.markPaid ? "paid" : "draft",
        paidAt: input.markPaid ? new Date() : null,
        method: input.markPaid ? (input.method ?? "transfer") : null,
        note: input.note ?? null,
        createdByUserId: session.userId,
      })
      .onConflictDoNothing()
      .returning({ id: schema.ownerPayouts.id });

    if (!inserted[0]) {
      throw new HttpError(409, "Bu sözleşme için bu dönemde aktarım zaten var");
    }
    return { id: inserted[0].id, grossKurus, feeKurus, expenseKurus, netKurus };
  });

  return c.json({ ok: true, ...created, net: formatTry(created.netKurus) }, 201);
});

/** Aktarımı "ödendi" işaretle (para gerçekten gönderildi). */
payoutRoutes.post("/:id/pay", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "aktarım ödemesi");

  const parsed = z
    .object({
      method: z.enum(["transfer", "office_account", "cash_office", "card", "offset"]).optional(),
      note: z.string().max(500).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz veri");

  const updated = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.ownerPayouts)
      .set({
        status: "paid",
        paidAt: new Date(),
        method: parsed.data.method ?? "transfer",
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      })
      .where(
        and(eq(schema.ownerPayouts.id, c.req.param("id")), eq(schema.ownerPayouts.status, "draft")),
      )
      .returning({ id: schema.ownerPayouts.id });
    return row;
  });

  if (!updated) throw new HttpError(404, "Taslak aktarım bulunamadı");
  return c.json({ ok: true });
});

/** Ekstre — yazdırılabilir A4 sayfa (tarayıcıdan PDF). */
payoutRoutes.get("/:id/statement", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        payout: schema.ownerPayouts,
        propertyTitle: schema.properties.title,
        city: schema.properties.city,
        district: schema.properties.district,
        ownerName: schema.persons.fullName,
        ownerPhone: schema.persons.phone,
        tenantName: sql<string>`(select full_name from person where id = ${schema.contracts.tenantPersonId})`,
      })
      .from(schema.ownerPayouts)
      .innerJoin(schema.contracts, eq(schema.contracts.id, schema.ownerPayouts.contractId))
      .innerJoin(schema.listings, eq(schema.listings.id, schema.contracts.listingId))
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .leftJoin(schema.persons, eq(schema.persons.id, schema.properties.ownerPersonId))
      .where(eq(schema.ownerPayouts.id, id))
      .limit(1);
    return row ?? null;
  });

  if (!data) throw new HttpError(404, "Aktarım bulunamadı");

  const p = data.payout;
  const periodLabel = formatPeriodTr(p.period);
  const rows: Array<[string, string]> = [
    ["Dönemde tahsil edilen kira", formatTry(p.grossKurus)],
    ["Kira takip bedeli (ofis)", `- ${formatTry(p.feeKurus)}`],
    ["Sahibe yansıtılan masraf", `- ${formatTry(p.expenseKurus)}`],
  ];

  return c.html(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Aktarım ekstresi — ${escapeHtml(data.ownerName ?? "Mal sahibi")} — ${periodLabel}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c2128; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: baseline;
             border-bottom: 2px solid #1f5f4b; padding-bottom: 10px; margin-bottom: 22px; }
    h1 { font-size: 18px; margin: 0; letter-spacing: 1px; }
    .muted { color: #6b7480; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e3e7ec; font-size: 14px; }
    td.amount { text-align: right; font-variant-numeric: tabular-nums; }
    .total { font-size: 18px; font-weight: 600; background: #e8f1ed; }
    footer { margin-top: 26px; font-size: 11px; color: #6b7480; line-height: 1.5; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
             background: ${p.status === "paid" ? "#e8f1ed" : "#fff6e5"};
             border: 1px solid ${p.status === "paid" ? "#cfe2d9" : "#f0dfb6"}; font-size: 11px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>UMAY EMLAK — MAL SAHİBİ AKTARIM EKSTRESİ</h1>
      <div class="muted">${escapeHtml(session.tenantName)} · ${periodLabel}</div>
    </div>
    <div class="muted">Düzenleme: ${new Date().toLocaleDateString("tr-TR")}</div>
  </header>

  <table>
    <tr><th>Mal sahibi</th><td>${escapeHtml(data.ownerName ?? "—")}${
      data.ownerPhone ? ` · ${escapeHtml(data.ownerPhone)}` : ""
    }</td></tr>
    <tr><th>Gayrimenkul</th><td>${escapeHtml(data.propertyTitle)}${
      data.district ? ` · ${escapeHtml(data.district)}` : ""
    }${data.city ? ` / ${escapeHtml(data.city)}` : ""}</td></tr>
    <tr><th>Kiracı</th><td>${escapeHtml(data.tenantName ?? "—")}</td></tr>
    <tr><th>Dönem</th><td>${periodLabel}</td></tr>
  </table>

  <table>
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td>${escapeHtml(label)}</td><td class="amount">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
    <tr class="total"><td>Net aktarılan</td><td class="amount">${formatKurus(p.netKurus)} ₺</td></tr>
  </table>

  <p><span class="badge">${
    p.status === "paid"
      ? `Ödendi${p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString("tr-TR")}` : ""}`
      : "Taslak — henüz ödenmedi"
  }</span></p>

  ${p.note ? `<p class="muted">Not: ${escapeHtml(p.note)}</p>` : ""}

  <footer>
    Bu ekstre bilgi amaçlıdır; mali müşavir onayı yerine geçmez. Tutarlar kuruş
    hassasiyetinde hesaplanır. Tahsil edilmeyen kira bu ekstreye GİRMEZ.
  </footer>
</body>
</html>`);
});

void formatKurus;
void eq;
