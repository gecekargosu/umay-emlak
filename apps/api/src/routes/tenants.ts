/**
 * Kiracılar uçları — TUR:22.
 *
 * Bilgi bankası: "Kiracılar modülü ile mal sahibinin altındaki kiracı bilgisi
 * AYNI veri kaynağından gelir" (tek merkez) ve kiracı profilinde "aktif ve
 * geçmiş kiracılıklar" bulunur. Bu yüzden burada kişi kaydı person tablosundan,
 * kiracılık dönemi contract tablosundan okunur — kopya veri tutulmaz.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { requirePasswordChanged, resolveSession } from "../session.js";

export const tenantRoutes = new Hono();

type Row = Record<string, unknown>;
const rowsOf = (result: unknown) => (result as { rows: Row[] }).rows ?? [];
const num = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

/** Kiracı listesi: aktif sözleşme, mülk, mal sahibi, kira ve açık borç. */
tenantRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.toLocaleLowerCase("tr")}%`;

  const result = await withTenant(session.tenantId, async (tx) =>
    tx.execute(sql`
      select p.id,
             p.full_name as "fullName",
             p.phone,
             p.email,
             p.notes,
             ct.id as "contractId",
             ct.start_date as "startDate",
             ct.end_date as "endDate",
             ct.due_day as "dueDay",
             ct.rent_kurus as "rentKurus",
             pr.id as "propertyId",
             pr.title as "propertyTitle",
             pr.district,
             pr.city,
             pr.address,
             pr.unit_no as "unitNo",
             pr.site_name as "siteName",
             pr.building_name as "buildingName",
             ow.full_name as "ownerName",
             (select count(*)::int from contract c2
               where c2.tenant_person_id = p.id and c2.status = 'active') as "activeContracts",
             (select count(*)::int from contract c3
               where c3.tenant_person_id = p.id and c3.status = 'ended') as "pastContracts",
             coalesce((select sum(ch.amount_kurus) from charge ch
               where ch.contract_id = ct.id and ch.status in ('open','partial')), 0)::bigint as "openKurus",
             (select count(*)::int from charge ch
               where ch.contract_id = ct.id and ch.status in ('open','partial')
                 and ch.due_date < current_date) as "overdueCount",
             (select min(ch.due_date) from charge ch
               where ch.contract_id = ct.id and ch.status in ('open','partial')) as "nextDueDate"
        from person p
        left join contract ct on ct.tenant_person_id = p.id and ct.status = 'active'
        left join listing l on l.id = ct.listing_id
        left join property pr on pr.id = l.property_id
        left join person ow on ow.id = pr.owner_person_id
       where p.kind = 'tenant'
         and p.merged_into_id is null
         and (${q}::text = '' or lower(p.full_name) like ${like})
       order by p.full_name
       limit 500
    `),
  );

  const items = rowsOf(result).map((row) => ({
    id: String(row.id),
    fullName: String(row.fullName),
    phone: text(row.phone),
    email: text(row.email),
    phoneDigits: text(row.phone)?.replace(/\D/g, "") ?? null,
    contractId: row.contractId === null ? null : String(row.contractId),
    startDate: text(row.startDate),
    endDate: text(row.endDate),
    dueDay: row.dueDay === null ? null : num(row.dueDay),
    rentKurus: row.rentKurus === null ? null : num(row.rentKurus),
    rentText: row.rentKurus === null ? null : formatTry(num(row.rentKurus)),
    propertyId: row.propertyId === null ? null : String(row.propertyId),
    propertyTitle: text(row.propertyTitle),
    district: text(row.district),
    city: text(row.city),
    address: text(row.address),
    unitNo: text(row.unitNo),
    siteName: text(row.siteName),
    buildingName: text(row.buildingName),
    ownerName: text(row.ownerName),
    activeContracts: num(row.activeContracts),
    pastContracts: num(row.pastContracts),
    openKurus: num(row.openKurus),
    openText: formatTry(num(row.openKurus)),
    overdueCount: num(row.overdueCount),
    nextDueDate: text(row.nextDueDate),
  }));

  return c.json({ count: items.length, items });
});

/** Kiracı dosyası: profil, aktif/geçmiş kiracılıklar, tahakkuk ve ödeme dökümü. */
tenantRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const result = await withTenant(session.tenantId, async (tx) => {
    const personResult = await tx.execute(sql`
      select p.id, p.full_name as "fullName", p.phone, p.email, p.notes,
             p.contact_permission as "contactPermission", p.created_at as "createdAt"
        from person p
       where p.id = ${id} and p.kind = 'tenant' and p.merged_into_id is null
       limit 1
    `);
    const person = rowsOf(personResult)[0];
    if (!person) return null;

    const contractsResult = await tx.execute(sql`
      select ct.id, ct.start_date as "startDate", ct.end_date as "endDate",
             ct.status, ct.rent_kurus as "rentKurus", ct.deposit_kurus as "depositKurus",
             ct.deposit_rent_count as "depositRentCount", ct.due_day as "dueDay",
             ct.utility_payer as "utilityPayer", ct.end_reason as "endReason",
             pr.id as "propertyId", pr.title as "propertyTitle", pr.district, pr.city,
             pr.address, pr.unit_no as "unitNo", pr.site_name as "siteName",
             pr.building_name as "buildingName", pr.room_count as "roomCount",
             pr.gross_m2 as "grossM2", pr.floor,
             ow.id as "ownerId", ow.full_name as "ownerName", ow.phone as "ownerPhone",
             coalesce((select sum(ch.amount_kurus) from charge ch
               where ch.contract_id = ct.id and ch.status = 'paid'), 0)::bigint as "paidKurus",
             coalesce((select sum(ch.amount_kurus) from charge ch
               where ch.contract_id = ct.id and ch.status in ('open','partial')), 0)::bigint as "openKurus"
        from contract ct
        left join listing l on l.id = ct.listing_id
        left join property pr on pr.id = l.property_id
        left join person ow on ow.id = pr.owner_person_id
       where ct.tenant_person_id = ${id}
       order by (ct.status = 'active') desc, ct.start_date desc
    `);

    const active = rowsOf(contractsResult).find((row) => row.status === "active");
    const chargesResult = active
      ? await tx.execute(sql`
          select ch.id, ch.period, ch.due_date as "dueDate", ch.amount_kurus as "amountKurus",
                 coalesce((select sum(p.amount_kurus) from payment p
                   where p.charge_id = ch.id), 0)::bigint as "paidKurus",
                 ch.status,
                 (ch.due_date < current_date and ch.status in ('open','partial')) as "overdue"
            from charge ch
           where ch.contract_id = ${String(active.id)}
           order by ch.period desc
           limit 24
        `)
      : { rows: [] as Row[] };

    const contracts = rowsOf(contractsResult).map((row) => ({
      id: String(row.id),
      startDate: text(row.startDate),
      endDate: text(row.endDate),
      status: String(row.status),
      rentKurus: num(row.rentKurus),
      rentText: formatTry(num(row.rentKurus)),
      depositKurus: num(row.depositKurus),
      depositText: formatTry(num(row.depositKurus)),
      depositRentCount: row.depositRentCount === null ? null : num(row.depositRentCount),
      dueDay: row.dueDay === null ? null : num(row.dueDay),
      utilityPayer: text(row.utilityPayer),
      endReason: text(row.endReason),
      propertyId: row.propertyId === null ? null : String(row.propertyId),
      propertyTitle: text(row.propertyTitle),
      district: text(row.district),
      city: text(row.city),
      address: text(row.address),
      unitNo: text(row.unitNo),
      siteName: text(row.siteName),
      buildingName: text(row.buildingName),
      roomCount: text(row.roomCount),
      grossM2: row.grossM2 === null ? null : num(row.grossM2),
      floor: row.floor === null ? null : num(row.floor),
      ownerId: row.ownerId === null ? null : String(row.ownerId),
      ownerName: text(row.ownerName),
      ownerPhone: text(row.ownerPhone),
      paidKurus: num(row.paidKurus),
      paidText: formatTry(num(row.paidKurus)),
      openKurus: num(row.openKurus),
      openText: formatTry(num(row.openKurus)),
    }));

    const charges = rowsOf(chargesResult).map((row) => ({
      id: String(row.id),
      period: String(row.period),
      dueDate: String(row.dueDate),
      status: String(row.status),
      amountKurus: num(row.amountKurus),
      amountText: formatTry(num(row.amountKurus)),
      paidKurus: num(row.paidKurus),
      paidText: formatTry(num(row.paidKurus)),
      overdue: Boolean(row.overdue),
    }));

    const totals = charges.reduce(
      (acc, charge) => {
        acc.charged += charge.amountKurus;
        acc.paid += charge.paidKurus;
        return acc;
      },
      { charged: 0, paid: 0 },
    );

    return {
      person: {
        id: String(person.id),
        fullName: String(person.fullName),
        phone: text(person.phone),
        email: text(person.email),
        notes: text(person.notes),
        contactPermission: text(person.contactPermission),
        createdAt: text(person.createdAt),
      },
      contracts,
      charges,
      totals: {
        chargedKurus: totals.charged,
        chargedText: formatTry(totals.charged),
        paidKurus: totals.paid,
        paidText: formatTry(totals.paid),
        openKurus: totals.charged - totals.paid,
        openText: formatTry(totals.charged - totals.paid),
      },
    };
  });

  if (!result) return c.json({ error: "Kiracı bulunamadı" }, 404);
  return c.json(result);
});
