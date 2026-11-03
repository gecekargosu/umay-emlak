/**
 * Mülk dosyası (pano) — TUR:27.
 * Kullanıcı isteği: "satılık/kiralık karta tıklayınca yeni sayfada resimler, videolar,
 * tüm detaylar, kime ait, kaç m², kaçıncı kat, adres; kiralıkta kiracı, sözleşme,
 * kira çizelgesi, ödenmeyen, depozito, tarihler."
 *
 * Tek uçta toplanır: ilan + mülk + mal sahibi + (varsa) kiracı/sözleşme + kira çizelgesi
 * + demirbaş + fotoğraf/video. Hesap yapılmaz; kalan tutar payment toplamından çıkar.
 */
import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const listingBoardRoutes = new Hono();

listingBoardRoutes.get("/:id/board", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const listingId = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const listingResult = await tx.execute(sql`
      select l.id as "listingId", l.kind, l.status, l.price_kurus as "priceKurus",
             l.created_at as "enteredAt", l.published_at as "publishedAt",
             l.authority_no as "authorityNo",
             pr.id as "propertyId", pr.title, pr.address, pr.city, pr.district,
             pr.room_count as "roomCount", pr.gross_m2 as "grossM2", pr.floor,
             pr.block, pr.unit_no as "unitNo", pr.site_name as "siteName",
             pr.building_name as "buildingName", pr.type, pr.notes,
             ow.full_name as "ownerName", ow.phone as "ownerPhone"
        from listing l
        join property pr on pr.id = l.property_id
        left join person ow on ow.id = pr.owner_person_id
       where l.id = ${listingId}::uuid
       limit 1
    `);
    const listing = (
      listingResult as unknown as { rows: Array<Record<string, unknown>> }
    ).rows[0];
    if (!listing) return null;

    const propertyId = String(listing.propertyId);

    const contractResult = await tx.execute(sql`
      select k.id, k.start_date as "startDate", k.end_date as "endDate",
             k.rent_kurus as "rentKurus", k.deposit_kurus as "depositKurus",
             k.deposit_rent_count as "depositRentCount", k.due_day as "dueDay",
             k.utility_payer as "utilityPayer", k.status,
             tp.id as "tenantId", tp.full_name as "tenantName", tp.phone as "tenantPhone",
             tp.email as "tenantEmail"
        from contract k
        join person tp on tp.id = k.tenant_person_id
       where k.listing_id in (select id from listing where property_id = ${propertyId}::uuid)
       order by (k.status = 'active') desc, k.start_date desc
       limit 1
    `);
    const contract = (
      contractResult as unknown as { rows: Array<Record<string, unknown>> }
    ).rows[0];

    const charges = contract
      ? (
          (
            await tx.execute(sql`
              select ch.id, ch.period::text as period, ch.due_date::text as "dueDate",
                     ch.amount_kurus as "amountKurus", ch.status,
                     coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
                       as "paidKurus",
                     (ch.due_date < current_date and ch.status in ('open','partial')) as overdue
                from charge ch
               where ch.contract_id = ${String(contract.id)}::uuid
               order by ch.due_date desc
               limit 24
            `)
          ) as unknown as { rows: Array<Record<string, unknown>> }
        ).rows
      : [];

    const fixtures = await tx
      .select({
        id: schema.propertyFixtures.id,
        name: schema.propertyFixtures.name,
        quantity: schema.propertyFixtures.quantity,
        note: schema.propertyFixtures.note,
      })
      .from(schema.propertyFixtures)
      .where(eq(schema.propertyFixtures.propertyId, propertyId))
      .orderBy(schema.propertyFixtures.name);

    const media = await tx
      .select({
        id: schema.propertyMedia.id,
        kind: schema.propertyMedia.kind,
        title: schema.propertyMedia.title,
        createdAt: schema.propertyMedia.createdAt,
      })
      .from(schema.propertyMedia)
      .where(eq(schema.propertyMedia.propertyId, propertyId))
      .orderBy(desc(schema.propertyMedia.createdAt));

    // TUR:30 / Y-85 — poliçe özeti mülk dosyasında: DASK bitişi burada görünsün.
    const policiesResult = await tx.execute(sql`
      select p.id, p.kind, p.insurer, p.policy_no as "policyNo",
             p.end_date::text as "endDate", (p.end_date - current_date)::int as "daysLeft"
        from policy p
       where p.property_id = ${propertyId}::uuid
       order by p.end_date asc
    `);
    const policies = (
      policiesResult as unknown as { rows: Array<Record<string, unknown>> }
    ).rows;

    return { listing, contract, charges, fixtures, media, policies };
  });

  if (!data) throw new HttpError(404, "İlan bulunamadı");

  const priceKurus = Number(data.listing.priceKurus ?? 0);
  const contract = data.contract;
  const rentKurus = Number(contract?.rentKurus ?? 0);
  const depositKurus = Number(contract?.depositKurus ?? 0);

  const charges = data.charges.map((row) => {
    const amountKurus = Number(row.amountKurus ?? 0);
    const paidKurus = Number(row.paidKurus ?? 0);
    const remaining = Math.max(0, amountKurus - paidKurus);
    return {
      id: String(row.id),
      period: String(row.period),
      dueDate: String(row.dueDate),
      amountKurus,
      amountText: formatTry(amountKurus),
      paidKurus,
      paidText: formatTry(paidKurus),
      remainingKurus: remaining,
      remainingText: formatTry(remaining),
      status: String(row.status),
      overdue: Boolean(row.overdue),
    };
  });

  const openKurus = charges.reduce((sum, row) => sum + row.remainingKurus, 0);

  return c.json({
    listing: {
      id: String(data.listing.listingId),
      kind: String(data.listing.kind),
      status: String(data.listing.status),
      priceKurus,
      priceText: formatTry(priceKurus),
      enteredAt: String(data.listing.enteredAt),
      publishedAt: data.listing.publishedAt === null ? null : String(data.listing.publishedAt),
      authorityNo: data.listing.authorityNo === null ? null : String(data.listing.authorityNo),
    },
    property: {
      id: String(data.listing.propertyId),
      title: String(data.listing.title),
      address: data.listing.address === null ? null : String(data.listing.address),
      city: data.listing.city === null ? null : String(data.listing.city),
      district: data.listing.district === null ? null : String(data.listing.district),
      roomCount: data.listing.roomCount === null ? null : String(data.listing.roomCount),
      grossM2: data.listing.grossM2 === null ? null : Number(data.listing.grossM2),
      floor: data.listing.floor === null ? null : Number(data.listing.floor),
      block: data.listing.block === null ? null : String(data.listing.block),
      unitNo: data.listing.unitNo === null ? null : String(data.listing.unitNo),
      siteName: data.listing.siteName === null ? null : String(data.listing.siteName),
      buildingName:
        data.listing.buildingName === null ? null : String(data.listing.buildingName),
      type: String(data.listing.type),
      notes: data.listing.notes === null ? null : String(data.listing.notes),
    },
    owner: {
      name: data.listing.ownerName === null ? null : String(data.listing.ownerName),
      phone: data.listing.ownerPhone === null ? null : String(data.listing.ownerPhone),
    },
    tenant: contract
      ? {
          id: String(contract.tenantId),
          name: String(contract.tenantName),
          phone: contract.tenantPhone === null ? null : String(contract.tenantPhone),
          email: contract.tenantEmail === null ? null : String(contract.tenantEmail),
        }
      : null,
    contract: contract
      ? {
          id: String(contract.id),
          startDate: String(contract.startDate),
          endDate: contract.endDate === null ? null : String(contract.endDate),
          rentKurus,
          rentText: formatTry(rentKurus),
          depositKurus,
          depositText: formatTry(depositKurus),
          depositRentCount:
            contract.depositRentCount === null ? null : Number(contract.depositRentCount),
          dueDay: contract.dueDay === null ? null : Number(contract.dueDay),
          utilityPayer: contract.utilityPayer === null ? null : String(contract.utilityPayer),
          status: String(contract.status),
        }
      : null,
    charges,
    openKurus,
    openText: formatTry(openKurus),
    fixtures: data.fixtures.map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      note: row.note,
    })),
    media: data.media.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      url: `/api/v1/properties/${String(data.listing.propertyId)}/media/${row.id}/file`,
    })),
    policies: data.policies.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      insurer: row.insurer === null ? null : String(row.insurer),
      policyNo: row.policyNo === null ? null : String(row.policyNo),
      endDate: String(row.endDate),
      daysLeft: Number(row.daysLeft),
    })),
  });
});
