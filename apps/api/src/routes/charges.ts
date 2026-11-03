/**
 * Tahakkuk ve tahsilat uçları — Dilim 5 (M09).
 *
 * K-13: para kuruş, tahsilat tahakkuka mahsup edilir; fazla ödeme kabul edilmez.
 * K-21: elden nakit ayrı yöntemdir ve TESLİM ALAN kişi zorunludur.
 * K-28: gecikmede hatırlatma (3 gün) ve ihtarname (15 gün) kademeleri.
 *
 * Kural: tahsilat silinmez. Hatalı kayıt, ters kayıtla düzeltilir (ileride).
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const chargeRoutes = new Hono();

const paymentMethodSchema = z.enum([
  "transfer",
  "office_account",
  "cash_office",
  "card",
  "offset",
]);

type ChargeRow = {
  id: string;
  contract_id: string;
  period: string;
  kind: string;
  amount_kurus: string;
  due_date: string;
  status: string;
  paid_kurus: string;
  notice_sent_at: string | null;
  reminded_at: string | null;
  tenant_name: string;
  tenant_phone: string | null;
  property_title: string;
  days_overdue: number;
};

function mapCharge(row: ChargeRow) {
  const amountKurus = Number(row.amount_kurus);
  const paidKurus = Number(row.paid_kurus);
  const remainingKurus = Math.max(0, amountKurus - paidKurus);
  const daysOverdue = Math.max(0, Number(row.days_overdue));
  /** K-28: kademe önerisi — kayıt tutmaz, yalnız "sırada ne var" der. */
  const nextAction =
    daysOverdue >= 15 ? "formal" : daysOverdue >= 3 ? "reminder" : null;

  return {
    id: row.id,
    contractId: row.contract_id,
    period: row.period,
    kind: row.kind,
    amountKurus,
    amount: formatTry(amountKurus),
    paidKurus,
    paid: formatTry(paidKurus),
    remainingKurus,
    remaining: formatTry(remainingKurus),
    dueDate: row.due_date,
    status: row.status,
    noticeSentAt: row.notice_sent_at,
    remindedAt: row.reminded_at,
    daysOverdue,
    nextAction,
    tenantName: row.tenant_name,
    tenantPhone: row.tenant_phone,
    propertyTitle: row.property_title,
  };
}

/** Açık/gecikmiş tahakkuklar. Varsayılan: açık olanlar, vadesi yakın önce. */
chargeRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const scope = c.req.query("scope") ?? "open";

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select ch.id, ch.contract_id, ch.period, ch.kind, ch.amount_kurus, ch.due_date, ch.status,
             ch.notice_sent_at, ch.reminded_at,
             coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
               as paid_kurus,
             per.full_name as tenant_name, per.phone as tenant_phone,
             prop.title as property_title,
             (current_date - ch.due_date)::int as days_overdue
        from charge ch
        join contract k on k.id = ch.contract_id
        join person per on per.id = k.tenant_person_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where (
         ${scope} = 'all'
         or (${scope} = 'open' and ch.status in ('open', 'partial'))
         or (${scope} = 'overdue' and ch.status in ('open', 'partial') and ch.due_date < current_date)
         or (${scope} = 'paid' and ch.status = 'paid')
       )
       order by ch.due_date asc
       limit 200
    `);
    return (result as unknown as { rows: ChargeRow[] }).rows;
  });

  const items = rows.map(mapCharge);
  return c.json({
    count: items.length,
    items,
    totals: {
      openKurus: items.reduce((sum, i) => sum + i.remainingKurus, 0),
      overdueCount: items.filter((i) => i.daysOverdue > 0).length,
    },
  });
});

/** Tek tahakkuk + ödeme geçmişi. */
chargeRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select ch.id, ch.contract_id, ch.period, ch.kind, ch.amount_kurus, ch.due_date, ch.status,
             coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
               as paid_kurus,
             per.full_name as tenant_name, per.phone as tenant_phone,
             prop.title as property_title,
             (current_date - ch.due_date)::int as days_overdue
        from charge ch
        join contract k on k.id = ch.contract_id
        join person per on per.id = k.tenant_person_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where ch.id = ${id}::uuid
       limit 1
    `);
    const row = (result as unknown as { rows: ChargeRow[] }).rows[0];
    if (!row) return null;

    const payments = await tx
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.chargeId, id))
      .orderBy(schema.payments.paidAt);

    const notices = await tx
      .select()
      .from(schema.chargeNotices)
      .where(eq(schema.chargeNotices.chargeId, id))
      .orderBy(schema.chargeNotices.sentAt);

    return {
      charge: mapCharge(row),
      payments: payments.map((p) => ({ ...p, amount: formatTry(p.amountKurus) })),
      notices,
    };
  });

  if (!detail) throw new HttpError(404, "Tahakkuk bulunamadı");
  return c.json(detail);
});

const createPayment = z.object({
  amountKurus: z.number().int().positive().optional(),
  amountText: z.string().max(40).optional(),
  method: paymentMethodSchema,
  paidAt: z.string().datetime().optional(),
  receivedByName: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

/** Tahsilat. Fazla ödeme reddedilir; elden nakitte teslim alan zorunlu (K-21). */
chargeRoutes.post("/:id/payments", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "tahsilat");

  const id = c.req.param("id");
  const parsed = createPayment.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, `Geçersiz veri: ${parsed.error.issues[0]?.message ?? "bilinmiyor"}`);
  }
  const input = parsed.data;

  let amountKurus = input.amountKurus;
  if (amountKurus === undefined && input.amountText !== undefined) {
    try {
      amountKurus = parseTryToKurus(input.amountText);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  }
  if (amountKurus === undefined || amountKurus <= 0) {
    throw new HttpError(400, "Tutar sıfırdan büyük olmalı");
  }

  if (
    (input.method === "cash_office" || input.method === "office_account") &&
    !input.receivedByName?.trim()
  ) {
    throw new HttpError(400, "Elden/ofis tahsilatında teslim alan kişi yazılmalı (K-21)");
  }

  const result = await withTenant(session.tenantId, async (tx) => {
    const [charge] = await tx
      .select()
      .from(schema.charges)
      .where(eq(schema.charges.id, id))
      .limit(1);
    if (!charge) throw new HttpError(404, "Tahakkuk bulunamadı");
    if (charge.status === "cancelled") throw new HttpError(409, "Tahakkuk iptal edilmiş");

    const paidRows = await tx.execute(sql`
      select coalesce(sum(amount_kurus), 0)::bigint as paid
        from payment where charge_id = ${id}::uuid
    `);
    const paidKurus = Number(
      (paidRows as unknown as { rows: Array<{ paid: string }> }).rows[0]?.paid ?? 0,
    );
    const remaining = charge.amountKurus - paidKurus;
    if (remaining <= 0) throw new HttpError(409, "Bu tahakkuk zaten tamamen ödenmiş");
    if (amountKurus! > remaining) {
      throw new HttpError(
        400,
        `Tutar kalan borçtan fazla: kalan ${formatTry(remaining)}. Fazla ödeme kabul edilmez.`,
      );
    }

    await tx.insert(schema.payments).values({
      tenantId: session.tenantId,
      chargeId: charge.id,
      amountKurus: amountKurus!,
      method: input.method,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      receivedByUserId: session.userId,
      receivedByName: input.receivedByName?.trim() || session.fullName,
      note: input.note ?? null,
    });

    const newPaid = paidKurus + amountKurus!;
    const status = newPaid >= charge.amountKurus ? "paid" : "partial";
    await tx
      .update(schema.charges)
      .set({ status })
      .where(eq(schema.charges.id, charge.id));

    return {
      status,
      paidKurus: newPaid,
      remainingKurus: Math.max(0, charge.amountKurus - newPaid),
    };
  });

  return c.json({
    ok: true,
    ...result,
    remaining: formatTry(result.remainingKurus),
  });
});

const noticeSchema = z.object({
  level: z.enum(["reminder", "formal"]),
  channel: z.string().max(30).default("phone"),
  note: z.string().max(500).optional(),
});

/** Gecikme bildirimi kaydı: hatırlatma / ihtarname (K-28). */
chargeRoutes.post("/:id/notice", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "gecikme bildirimi");
  const id = c.req.param("id");

  const parsed = noticeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz bildirim");
  const input = parsed.data;

  const created = await withTenant(session.tenantId, async (tx) => {
    const [charge] = await tx
      .select({ id: schema.charges.id, status: schema.charges.status })
      .from(schema.charges)
      .where(eq(schema.charges.id, id))
      .limit(1);
    if (!charge) throw new HttpError(404, "Tahakkuk bulunamadı");
    if (charge.status === "paid") throw new HttpError(409, "Ödenmiş tahakkuka bildirim düşülmez");

    await tx.insert(schema.chargeNotices).values({
      tenantId: session.tenantId,
      chargeId: charge.id,
      level: input.level,
      channel: input.channel,
      note: input.note ?? null,
      sentByUserId: session.userId,
    });

    await tx
      .update(schema.charges)
      .set(
        input.level === "formal"
          ? { noticeSentAt: new Date() }
          : { remindedAt: new Date() },
      )
      .where(eq(schema.charges.id, charge.id));

    return { ok: true, level: input.level };
  });

  return c.json(created);
});
