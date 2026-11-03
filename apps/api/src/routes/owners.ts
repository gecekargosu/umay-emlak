/**
 * Mal sahipleri uçları — TUR:21.
 *
 * Bilgi bankası (kaynak dosya, mal sahibi klasörü): "mal sahipleri rafında
 * alfabetik sırayla sağa sola kaydırılabilen raf; bir sahibi tıkladığında
 * tüm mülkleri satılık/kiralık raflarında; her mülkün kiracısı ve borcu".
 * Bu uç yalnız okuma yapar; mülk/ilan değişiklikleri kendi uçlarından geçer.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { requirePasswordChanged, resolveSession } from "../session.js";

export const ownerRoutes = new Hono();

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows ?? [];
}

const num = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** Portföy listesi: alfabetik sıra, mülk/ilan/sözleşme sayıları ve toplamlar. */
ownerRoutes.get("/", async (c) => {
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
             (select count(*)::int from property pr where pr.owner_person_id = p.id) as "propertyCount",
             (select count(*)::int from listing l join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and l.status = 'active' and l.kind = 'sale') as "saleCount",
             (select count(*)::int from listing l join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and l.status = 'active' and l.kind = 'rent') as "rentCount",
             (select count(*)::int from contract ct join listing l on l.id = ct.listing_id
               join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and ct.status = 'active') as "contractCount",
             (select coalesce(sum(l.price_kurus), 0)::bigint from listing l join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and l.status = 'active' and l.kind = 'sale') as "saleKurus",
             (select coalesce(sum(l.price_kurus), 0)::bigint from listing l join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and l.status = 'active' and l.kind = 'rent') as "rentKurus",
             (select coalesce(sum(ct.rent_kurus), 0)::bigint from contract ct join listing l on l.id = ct.listing_id
               join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and ct.status = 'active') as "monthlyRentKurus",
             (select coalesce(sum(ch.amount_kurus), 0)::bigint from charge ch
               join contract ct on ct.id = ch.contract_id
               join listing l on l.id = ct.listing_id
               join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and ch.status in ('open','partial')) as "openKurus"
        from person p
       where p.kind = 'owner'
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
    propertyCount: num(row.propertyCount),
    saleCount: num(row.saleCount),
    rentCount: num(row.rentCount),
    contractCount: num(row.contractCount),
    saleKurus: num(row.saleKurus),
    saleText: formatTry(num(row.saleKurus)),
    rentKurus: num(row.rentKurus),
    rentText: formatTry(num(row.rentKurus)),
    monthlyRentKurus: num(row.monthlyRentKurus),
    monthlyRentText: formatTry(num(row.monthlyRentKurus)),
    openKurus: num(row.openKurus),
    openText: formatTry(num(row.openKurus)),
  }));

  return c.json({ count: items.length, items });
});

/** Bir mal sahibinin klasörü: mülkleri, ilanları, kiracıları ve açık borcu. */
ownerRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const result = await withTenant(session.tenantId, async (tx) => {
    const personResult = await tx.execute(sql`
      select p.id, p.full_name as "fullName", p.phone, p.email, p.notes,
             p.created_at as "createdAt",
             (select count(*)::int from property pr where pr.owner_person_id = p.id) as "propertyCount",
             (select coalesce(sum(l.price_kurus), 0)::bigint from listing l join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and l.status = 'active') as "portfolioKurus",
             (select coalesce(sum(ct.rent_kurus), 0)::bigint from contract ct join listing l on l.id = ct.listing_id
               join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and ct.status = 'active') as "monthlyRentKurus",
             (select coalesce(sum(ch.amount_kurus), 0)::bigint from charge ch
               join contract ct on ct.id = ch.contract_id
               join listing l on l.id = ct.listing_id
               join property pr on pr.id = l.property_id
               where pr.owner_person_id = p.id and ch.status in ('open','partial')) as "openKurus"
        from person p
       where p.id = ${id} and p.kind = 'owner' and p.merged_into_id is null
       limit 1
    `);

    const person = rowsOf(personResult)[0];
    if (!person) return null;

    const propertyResult = await tx.execute(sql`
      select pr.id, pr.title, pr.type, pr.city, pr.district, pr.address,
             pr.room_count as "roomCount", pr.gross_m2 as "grossM2",
             pr.site_name as "siteName", pr.building_name as "buildingName",
             pr.unit_no as "unitNo", pr.block, pr.notes,
             l.id as "listingId", l.kind, l.status,
             l.price_kurus as "priceKurus", l.authority_no as "authorityNo",
             ct.id as "contractId", ct.rent_kurus as "rentKurus",
             ct.due_day as "dueDay", ct.start_date as "startDate",
             t.full_name as "tenantName", t.phone as "tenantPhone",
             coalesce((select sum(ch.amount_kurus) from charge ch
               where ch.contract_id = ct.id and ch.status in ('open','partial')), 0)::bigint as "openKurus",
             (select count(*)::int from document d where d.property_id = pr.id) as "documentCount"
        from property pr
        left join listing l on l.property_id = pr.id
        left join contract ct on ct.listing_id = l.id and ct.status = 'active'
        left join person t on t.id = ct.tenant_person_id
       where pr.owner_person_id = ${id}
       order by pr.title, l.kind
    `);

    const properties = rowsOf(propertyResult).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      type: String(row.type),
      city: text(row.city),
      district: text(row.district),
      address: text(row.address),
      roomCount: text(row.roomCount),
      grossM2: row.grossM2 === null ? null : num(row.grossM2),
      siteName: text(row.siteName),
      buildingName: text(row.buildingName),
      unitNo: text(row.unitNo),
      block: text(row.block),
      listingId: row.listingId === null ? null : String(row.listingId),
      kind: text(row.kind),
      status: text(row.status),
      priceKurus: num(row.priceKurus),
      priceText: row.priceKurus === null ? null : formatTry(num(row.priceKurus)),
      authorityNo: text(row.authorityNo),
      contractId: row.contractId === null ? null : String(row.contractId),
      rentKurus: row.rentKurus === null ? null : num(row.rentKurus),
      rentText: row.rentKurus === null ? null : formatTry(num(row.rentKurus)),
      dueDay: row.dueDay === null ? null : num(row.dueDay),
      startDate: text(row.startDate),
      tenantName: text(row.tenantName),
      tenantPhone: text(row.tenantPhone),
      openKurus: num(row.openKurus),
      openText: formatTry(num(row.openKurus)),
      documentCount: num(row.documentCount),
    }));

    return {
      person: {
        id: String(person.id),
        fullName: String(person.fullName),
        phone: text(person.phone),
        email: text(person.email),
        notes: text(person.notes),
        createdAt: text(person.createdAt),
        propertyCount: num(person.propertyCount),
        portfolioKurus: num(person.portfolioKurus),
        portfolioText: formatTry(num(person.portfolioKurus)),
        monthlyRentKurus: num(person.monthlyRentKurus),
        monthlyRentText: formatTry(num(person.monthlyRentKurus)),
        openKurus: num(person.openKurus),
        openText: formatTry(num(person.openKurus)),
      },
      properties,
    };
  });

  if (!result) {
    return c.json({ error: "Mal sahibi bulunamadı" }, 404);
  }
  return c.json(result);
});
