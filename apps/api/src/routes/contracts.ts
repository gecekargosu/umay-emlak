/**
 * Sözleşme uçları — Dilim 4 (M08).
 *
 * K-17: sözleşme İLANA bağlanır (mülke değil): aynı daire hem satılık hem
 * kiralık olabilir, kira sözleşmesi kiralık ilanın üzerine kurulur.
 * K-23: depozito ayrı alandır, gelir sayılmaz.
 * K-27: aidat/fatura sorumluluğu sözleşmede seçilir.
 *
 * Kira takvimi (tahakkuk) burada üretilir: her ay tek satır, tekrar üretim
 * mükerrer açmaz (charge_contract_period_kind_uidx).
 */
import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const contractRoutes = new Hono();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD olmalı");
const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Dönem YYYY-MM-01 olmalı");

function toKurus(
  value: number | undefined,
  text: string | undefined,
  label: string,
): number | undefined {
  if (value !== undefined) return value;
  if (text === undefined) return undefined;
  try {
    return parseTryToKurus(text);
  } catch (error) {
    throw new HttpError(400, `${label}: ${(error as Error).message}`);
  }
}

const createContract = z.object({
  listingId: z.uuid(),
  tenantPersonId: z.uuid(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  rentKurus: z.number().int().positive().optional(),
  rentText: z.string().max(40).optional(),
  depositKurus: z.number().int().nonnegative().optional(),
  depositText: z.string().max(40).optional(),
  depositRentCount: z.number().int().min(0).max(24).optional(),
  dueDay: z.number().int().min(1).max(28).default(1),
  utilityPayer: z.enum(["tenant", "office", "owner"]).default("tenant"),
  note: z.string().max(500).optional(),
});

contractRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "sözleşme açma");

  const parsed = createContract.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, `Geçersiz veri: ${parsed.error.issues[0]?.message ?? "bilinmiyor"}`);
  }
  const input = parsed.data;

  const rentKurus = toKurus(input.rentKurus, input.rentText, "Kira") ?? 0;
  const depositKurus = toKurus(input.depositKurus, input.depositText, "Depozito") ?? 0;
  if (rentKurus <= 0) throw new HttpError(400, "Kira sıfırdan büyük olmalı");
  if (depositKurus < 0) throw new HttpError(400, "Depozito negatif olamaz");
  if (input.endDate && input.endDate <= input.startDate) {
    throw new HttpError(400, "Bitiş tarihi başlangıçtan sonra olmalı");
  }

  const created = await withTenant(session.tenantId, async (tx) => {
    const [listing] = await tx
      .select({
        id: schema.listings.id,
        kind: schema.listings.kind,
        status: schema.listings.status,
        propertyId: schema.listings.propertyId,
      })
      .from(schema.listings)
      .where(eq(schema.listings.id, input.listingId))
      .limit(1);
    if (!listing) throw new HttpError(404, "İlan bulunamadı");
    if (listing.kind !== "rent") {
      throw new HttpError(400, "Kira sözleşmesi yalnız kiralık ilanda açılır");
    }

    const [tenantPerson] = await tx
      .select({
        id: schema.persons.id,
        kind: schema.persons.kind,
        fullName: schema.persons.fullName,
        phone: schema.persons.phone,
        email: schema.persons.email,
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, input.tenantPersonId))
      .limit(1);
    if (!tenantPerson) throw new HttpError(404, "Kiracı bulunamadı");

    const [property] = await tx
      .select({
        title: schema.properties.title,
        city: schema.properties.city,
        district: schema.properties.district,
        address: schema.properties.address,
        roomCount: schema.properties.roomCount,
      })
      .from(schema.properties)
      .where(eq(schema.properties.id, listing.propertyId))
      .limit(1);

    const owners = await tx
      .select({ fullName: schema.persons.fullName, shareBp: schema.propertyOwners.shareBp })
      .from(schema.propertyOwners)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.propertyOwners.personId))
      .where(eq(schema.propertyOwners.propertyId, listing.propertyId));

    // Y-53: sözleşme açıldığı andaki bilgiler DONDURULUR. Kiracının adı veya
    // mülkün başlığı sonradan değişse bile eski sözleşme ve ekstre bunu gösterir.
    const snapshot = {
      version: 1,
      frozenAt: new Date().toISOString(),
      tenant: {
        fullName: tenantPerson.fullName,
        phone: tenantPerson.phone,
        email: tenantPerson.email,
      },
      property: {
        title: property?.title ?? "",
        city: property?.city ?? null,
        district: property?.district ?? null,
        address: property?.address ?? null,
        roomCount: property?.roomCount ?? null,
      },
      owners: owners.map((o) => ({ fullName: o.fullName, shareBp: o.shareBp })),
      terms: {
        rentKurus,
        depositKurus,
        dueDay: input.dueDay,
        utilityPayer: input.utilityPayer,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      },
    };

    const existing = await tx
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(
        sql`${schema.contracts.listingId} = ${input.listingId} and ${schema.contracts.status} = 'active'`,
      )
      .limit(1);
    if (existing[0]) throw new HttpError(409, "Bu ilanda zaten aktif bir sözleşme var");

    const [contract] = await tx
      .insert(schema.contracts)
      .values({
        tenantId: session.tenantId,
        listingId: input.listingId,
        tenantPersonId: input.tenantPersonId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        rentKurus,
        depositKurus,
        depositRentCount:
          input.depositRentCount ?? (rentKurus > 0 ? Math.round(depositKurus / rentKurus) : null),
        dueDay: input.dueDay,
        utilityPayer: input.utilityPayer,
        snapshot,
      })
      .returning({ id: schema.contracts.id });

    // İlan artık kiracılı: durumu kapatılır ve geçmişe yazılır (K-17)
    if (listing.status !== "closed") {
      await tx.insert(schema.listingStatusChanges).values({
        tenantId: session.tenantId,
        listingId: listing.id,
        fromStatus: listing.status,
        toStatus: "closed",
        forced: false,
        note: input.note ?? "Sözleşme imzalandı",
        changedByUserId: session.userId,
      });
      await tx
        .update(schema.listings)
        .set({ status: "closed" })
        .where(eq(schema.listings.id, listing.id));
    }

    return contract!;
  });

  return c.json({ id: created.id }, 201);
});

contractRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.contracts.id,
        status: schema.contracts.status,
        startDate: schema.contracts.startDate,
        endDate: schema.contracts.endDate,
        rentKurus: schema.contracts.rentKurus,
        depositKurus: schema.contracts.depositKurus,
        dueDay: schema.contracts.dueDay,
        utilityPayer: schema.contracts.utilityPayer,
        tenantName: schema.persons.fullName,
        tenantPhone: schema.persons.phone,
        propertyTitle: schema.properties.title,
        listingId: schema.contracts.listingId,
      })
      .from(schema.contracts)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.contracts.tenantPersonId))
      .innerJoin(schema.listings, eq(schema.listings.id, schema.contracts.listingId))
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .orderBy(desc(schema.contracts.createdAt))
      .limit(100),
  );

  return c.json({
    count: rows.length,
    items: rows.map((r) => ({
      ...r,
      rent: formatTry(r.rentKurus),
      deposit: formatTry(r.depositKurus),
    })),
  });
});

/** Sözleşme detayı + kira takvimi (tahakkuklar ve tahsil edilen tutarlar). */
contractRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        contract: schema.contracts,
        tenant: schema.persons,
        property: schema.properties,
      })
      .from(schema.contracts)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.contracts.tenantPersonId))
      .innerJoin(schema.listings, eq(schema.listings.id, schema.contracts.listingId))
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .where(eq(schema.contracts.id, id))
      .limit(1);
    if (!row) return null;

    const chargesResult = await tx.execute(sql`
      select ch.id, ch.period, ch.kind, ch.amount_kurus, ch.due_date, ch.status,
             ch.reminded_at, ch.notice_sent_at,
             coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
               as paid_kurus
        from charge ch
       where ch.contract_id = ${id}::uuid
       order by ch.period desc
    `);
    const charges = (
      chargesResult as unknown as {
        rows: Array<{
          id: string;
          period: string;
          kind: string;
          amount_kurus: string;
          due_date: string;
          status: string;
          reminded_at: string | null;
          notice_sent_at: string | null;
          paid_kurus: string;
        }>;
      }
    ).rows.map((r) => {
      const amountKurus = Number(r.amount_kurus);
      const paidKurus = Number(r.paid_kurus);
      return {
        id: r.id,
        period: r.period,
        kind: r.kind,
        amountKurus,
        amount: formatTry(amountKurus),
        dueDate: r.due_date,
        status: r.status,
        remindedAt: r.reminded_at,
        noticeSentAt: r.notice_sent_at,
        paidKurus,
        paid: formatTry(paidKurus),
        remainingKurus: Math.max(0, amountKurus - paidKurus),
        remaining: formatTry(Math.max(0, amountKurus - paidKurus)),
        daysOverdue: daysSince(r.due_date),
      };
    });

    return {
      contract: {
        ...row.contract,
        rent: formatTry(row.contract.rentKurus),
        deposit: formatTry(row.contract.depositKurus),
      },
      tenant: {
        id: row.tenant.id,
        fullName: row.tenant.fullName,
        phone: row.tenant.phone,
        email: row.tenant.email,
      },
      property: {
        id: row.property.id,
        title: row.property.title,
        city: row.property.city,
        district: row.property.district,
      },
      charges,
      totals: {
        charged: charges.reduce((sum, ch) => sum + ch.amountKurus, 0),
        paid: charges.reduce((sum, ch) => sum + ch.paidKurus, 0),
        open: charges.reduce((sum, ch) => sum + ch.remainingKurus, 0),
      },
    };
  });

  if (!detail) throw new HttpError(404, "Sözleşme bulunamadı");
  return c.json(detail);
});

/**
 * Y-56: hukuki metin şablonları — tahliye taahhüdü ve kefaletname.
 * Dondurulmuş sözleşme verisi varsa o kullanılır; şablon hukuki danışmanlık değildir.
 */
contractRoutes.get("/:id/output/:kind", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const kind = c.req.param("kind");
  if (kind !== "tahliye" && kind !== "kefalet") throw new HttpError(404, "Şablon bulunamadı");
  const id = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        contract: schema.contracts,
        tenantName: schema.persons.fullName,
        propertyTitle: schema.properties.title,
        district: schema.properties.district,
        city: schema.properties.city,
      })
      .from(schema.contracts)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.contracts.tenantPersonId))
      .innerJoin(schema.listings, eq(schema.listings.id, schema.contracts.listingId))
      .innerJoin(schema.properties, eq(schema.properties.id, schema.listings.propertyId))
      .where(eq(schema.contracts.id, id))
      .limit(1);
    return row ?? null;
  });
  if (!data) throw new HttpError(404, "Sözleşme bulunamadı");

  const esc = (value: string) =>
    value.replace(/[&<>"]/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
    );

  const snap = data.contract.snapshot;
  const tenantName = snap?.tenant.fullName ?? data.tenantName;
  const propertyTitle = snap?.property.title ?? data.propertyTitle;
  const place = [snap?.property.district ?? data.district, snap?.property.city ?? data.city]
    .filter(Boolean)
    .join(" / ");
  const rent = formatTry(snap?.terms.rentKurus ?? data.contract.rentKurus);
  const deposit = formatTry(snap?.terms.depositKurus ?? data.contract.depositKurus);
  const start = snap?.terms.startDate ?? data.contract.startDate;

  const title = kind === "tahliye" ? "TAHLİYE TAAHHÜDÜ" : "KEFALETNAME";
  const body =
    kind === "tahliye"
      ? `<p>Kiracı <strong>${esc(tenantName)}</strong>, ${esc(propertyTitle)}${
          place ? ` (${esc(place)})` : ""
        } adresindeki taşınmazı ${esc(start)} tarihli kira sözleşmesi ile kiralamıştır.</p>
         <p>Kiracı, yukarıda belirtilen taşınmazı <span class="line"></span> tarihinde, kira
         sözleşmesinden doğan tüm borçlarını ödeyerek kayıtsız ve şartsız tahliye etmeyi
         gayrikabili rücu olarak taahhüt eder.</p>`
      : `<p>Kefil <span class="line"></span> (T.C. kimlik no: <span class="line"></span>),
         kiracı <strong>${esc(tenantName)}</strong>'in ${esc(propertyTitle)}${
           place ? ` (${esc(place)})` : ""
         } adresindeki taşınmaz için ${esc(start)} başlangıçlı kira sözleşmesinden doğan;
         aylık kira ${esc(rent)}, depozito ${esc(deposit)} ve sair tüm borçlarına
         müteselsil kefil olmuştur.</p>`;

  return c.html(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8" /><title>${title} — ${esc(tenantName)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c2128; font-size: 13px; line-height: 1.8; }
  h1 { font-size: 16px; letter-spacing: 1px; text-align: center; margin-bottom: 4px; }
  .muted { color: #6b7480; font-size: 11px; }
  .line { border-bottom: 1px solid #9aa4b0; display: inline-block; min-width: 170px; }
  .sign { margin-top: 42px; display: flex; justify-content: space-between; }
</style></head><body>
  <h1>${title}</h1>
  <p class="muted" style="text-align:center">${esc(session.tenantName)} · düzenleme ${new Date().toLocaleDateString("tr-TR")}</p>
  ${body}
  <div class="sign">
    <div>Kiracı<br /><br />Ad soyad: ${esc(tenantName)}<br />İmza: ______________</div>
    <div>${kind === "kefalet" ? "Kefil" : "Mal sahibi / yetkili"}<br /><br />Ad soyad: ______________<br />İmza: ______________</div>
  </div>
  <p class="muted" style="margin-top:26px">Bu metin örnek şablondur; hukuki geçerlilik için avukat onayı gerekir. Program hukuki danışmanlık vermez.</p>
</body></html>`);
});

/** Dönem için kira tahakkuku üret. Aynı dönem ikinci kez üretilmez. */
contractRoutes.post("/:id/charges", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kira tahakkuku");
  const id = c.req.param("id");

  const parsed = z
    .object({ period: periodSchema, amountKurus: z.number().int().positive().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Dönem YYYY-MM-01 biçiminde gerekli");
  const { period } = parsed.data;

  const result = await withTenant(session.tenantId, async (tx) => {
    const [contract] = await tx
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.id, id))
      .limit(1);
    if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");
    if (contract.status !== "active") throw new HttpError(409, "Sözleşme aktif değil");
    if (contract.endDate && period > contract.endDate) {
      throw new HttpError(400, "Dönem sözleşme bitişinden sonra");
    }

    const amountKurus = parsed.data.amountKurus ?? contract.rentKurus;
    const dueDate = `${period.slice(0, 7)}-${String(contract.dueDay).padStart(2, "0")}`;

    const inserted = await tx
      .insert(schema.charges)
      .values({
        tenantId: session.tenantId,
        contractId: contract.id,
        period,
        kind: "rent",
        amountKurus,
        dueDate,
      })
      .onConflictDoNothing()
      .returning({ id: schema.charges.id });

    return { created: Boolean(inserted[0]), id: inserted[0]?.id ?? null, dueDate, amountKurus };
  });

  return c.json({
    ...result,
    amount: formatTry(result.amountKurus),
    message: result.created ? "Tahakkuk oluşturuldu" : "Bu dönem için tahakkuk zaten var",
  });
});

/** Sözleşmeyi bitir (kiracı çıktı). Kayıt silinmez, durum kapanır. */
contractRoutes.post("/:id/end", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "sözleşme bitirme");
  const id = c.req.param("id");

  const parsed = z
    .object({ endDate: dateSchema.optional(), reason: z.string().max(500).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz veri");

  const updated = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.contracts)
      .set({
        status: "ended",
        endedAt: new Date(),
        endReason: parsed.data.reason ?? null,
        ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
      })
      .where(sql`${schema.contracts.id} = ${id} and ${schema.contracts.status} = 'active'`)
      .returning({ id: schema.contracts.id });
    return row;
  });

  if (!updated) throw new HttpError(404, "Aktif sözleşme bulunamadı");
  return c.json({ ok: true });
});

/** Vade geçmiş gün sayısı (geçmemişse 0). */
function daysSince(dateStr: string): number {
  const due = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((today - due) / 86_400_000));
}
