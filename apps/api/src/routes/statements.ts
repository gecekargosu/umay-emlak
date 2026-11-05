/**
 * Mal sahibi hesap ekstresi — TUR:60 (yol haritası 2. madde).
 *
 * Dönem içinde: kiracıdan tahsil edilen kira, mülk giderleri (aktif olanlar) ve
 * ofisin kira takip bedeli. Net = tahsil − gider − bedel. Ayrıca "tahsil edilmemiş"
 * (tahakkuk − tahsilat) gösterilir; böylece mal sahibi "ne kadar kaldı"yı görür.
 *
 * Kural: rakamlar kuruş tam sayı; hesap sunucuda, arayüz yalnız biçimlendirir.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const statementRoutes = new Hono();

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type OwnerOption = { id: string; name: string; propertyCount: number };

/** Ekstre için mal sahibi listesi: property_owner + mülkün kendi sahibi (K-84). */
statementRoutes.get("/owners", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      with owner_property as (
        select property_id, person_id from property_owner
        union
        select id as property_id, owner_person_id as person_id
          from property where owner_person_id is not null
      )
      select p.id, p.full_name as "name", count(distinct op.property_id)::int as "propertyCount"
        from owner_property op
        join person p on p.id = op.person_id
       group by p.id, p.full_name
       order by p.full_name
    `);
    return (result as unknown as { rows: OwnerOption[] }).rows;
  });

  return c.json({
    count: rows.length,
    items: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      propertyCount: Number(row.propertyCount),
    })),
  });
});

type PropertyLine = {
  id: string;
  title: string;
  district: string | null;
};

type AggregateRow = { propertyId: string; value: string | number };

function toKurus(value: string | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Mal sahibinin dönem ekstresi: mülk mülk tahakkuk/tahsilat/gider/bedel/net. */
statementRoutes.get("/owners/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const ownerId = c.req.param("id");
  if (!z.uuid().safeParse(ownerId).success) throw new HttpError(404, "Mal sahibi bulunamadı");

  const from = (c.req.query("from") ?? monthStartIso()).trim();
  const to = (c.req.query("to") ?? todayIso()).trim();
  if (!dateRe.test(from) || !dateRe.test(to)) {
    throw new HttpError(400, "Tarih aralığı geçersiz (YYYY-AA-GG)");
  }
  if (from > to) throw new HttpError(400, "Başlangıç tarihi bitişten sonra olamaz");

  const data = await withTenant(session.tenantId, async (tx) => {
    const ownerRows = (
      await tx.execute(sql`select id, full_name as "name" from person where id = ${ownerId}::uuid limit 1`)
    ) as unknown as { rows: Array<{ id: string; name: string }> };
    const owner = ownerRows.rows[0];
    if (!owner) throw new HttpError(404, "Mal sahibi bulunamadı");

    const propertyRows = (
      await tx.execute(sql`
        select pr.id, pr.title, pr.district
          from property pr
         where pr.owner_person_id = ${ownerId}::uuid
            or exists (
                 select 1 from property_owner po
                  where po.property_id = pr.id and po.person_id = ${ownerId}::uuid
               )
         order by pr.title
      `)
    ) as unknown as { rows: PropertyLine[] };

    const ids = propertyRows.rows.map((row) => String(row.id));

    // Mülk yoksa ekstre boş ama anlamlı döner (hata değil).
    if (ids.length === 0) {
      return {
        owner: { id: String(owner.id), name: String(owner.name) },
        period: { from, to },
        properties: [] as Array<Record<string, unknown>>,
      };
    }

    const chargedRows = (
      await tx.execute(sql`
        select pr.id as "propertyId",
               coalesce(sum(ch.amount_kurus), 0)::bigint as "charged",
               coalesce(sum(pay.paid), 0)::bigint as "collected"
          from property pr
          left join listing l on l.property_id = pr.id
          left join contract c on c.listing_id = l.id
          left join charge ch
                 on ch.contract_id = c.id
                and ch.period >= ${from}::date and ch.period <= ${to}::date
          left join (
                select charge_id, sum(amount_kurus) as paid from payment group by charge_id
               ) pay on pay.charge_id = ch.id
         where pr.id = any(${sql.raw(`array['${ids.join("','")}']::uuid[]`)})
         group by pr.id
      `)
    ) as unknown as { rows: Array<{ propertyId: string; charged: string | number; collected: string | number }> };

    const expenseRows = (
      await tx.execute(sql`
        select e.property_id as "propertyId", coalesce(sum(e.amount_kurus), 0)::bigint as "value"
          from expense e
         where e.status = 'aktif'
           and e.spent_on >= ${from}::date and e.spent_on <= ${to}::date
           and e.property_id = any(${sql.raw(`array['${ids.join("','")}']::uuid[]`)})
         group by e.property_id
      `)
    ) as unknown as { rows: AggregateRow[] };

    const feeRows = (
      await tx.execute(sql`
        select l.property_id as "propertyId", coalesce(sum(op.fee_kurus), 0)::bigint as "value"
          from owner_payout op
          join contract c on c.id = op.contract_id
          join listing l on l.id = c.listing_id
         where op.period >= ${from}::date and op.period <= ${to}::date
           and l.property_id = any(${sql.raw(`array['${ids.join("','")}']::uuid[]`)})
         group by l.property_id
      `)
    ) as unknown as { rows: AggregateRow[] };

    const chargedMap = new Map(chargedRows.rows.map((row) => [String(row.propertyId), row]));
    const expenseMap = new Map(expenseRows.rows.map((row) => [String(row.propertyId), toKurus(row.value)]));
    const feeMap = new Map(feeRows.rows.map((row) => [String(row.propertyId), toKurus(row.value)]));

    const properties = propertyRows.rows.map((property) => {
      const id = String(property.id);
      const charged = toKurus(chargedMap.get(id)?.charged);
      const collected = toKurus(chargedMap.get(id)?.collected);
      const expenses = expenseMap.get(id) ?? 0;
      const fee = feeMap.get(id) ?? 0;
      return {
        id,
        title: String(property.title),
        district: property.district === null ? null : String(property.district),
        chargedKurus: charged,
        chargedText: formatTry(charged),
        collectedKurus: collected,
        collectedText: formatTry(collected),
        outstandingKurus: charged - collected,
        outstandingText: formatTry(charged - collected),
        expensesKurus: expenses,
        expensesText: formatTry(expenses),
        feeKurus: fee,
        feeText: formatTry(fee),
        netKurus: collected - expenses - fee,
        netText: formatTry(collected - expenses - fee),
      };
    });

    return {
      owner: { id: String(owner.id), name: String(owner.name) },
      period: { from, to },
      properties,
    };
  });

  const properties = (data.properties ?? []) as Array<{
    chargedKurus: number;
    collectedKurus: number;
    outstandingKurus: number;
    expensesKurus: number;
    feeKurus: number;
    netKurus: number;
  }>;
  const sum = (pick: (row: (typeof properties)[number]) => number) =>
    properties.reduce((total, row) => total + pick(row), 0);
  const totals = {
    chargedKurus: sum((row) => row.chargedKurus),
    collectedKurus: sum((row) => row.collectedKurus),
    outstandingKurus: sum((row) => row.outstandingKurus),
    expensesKurus: sum((row) => row.expensesKurus),
    feeKurus: sum((row) => row.feeKurus),
    netKurus: sum((row) => row.netKurus),
  };

  return c.json({
    ...data,
    totals: {
      ...totals,
      chargedText: formatTry(totals.chargedKurus),
      collectedText: formatTry(totals.collectedKurus),
      outstandingText: formatTry(totals.outstandingKurus),
      expensesText: formatTry(totals.expensesKurus),
      feeText: formatTry(totals.feeKurus),
      netText: formatTry(totals.netKurus),
    },
    printedAt: new Date().toISOString(),
  });
});
