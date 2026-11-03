/**
 * Ekip ve yetki — K-29.
 * Onay yetkisi (canApprove) yalnız ofis sahibi tarafından verilir/alınır.
 * Aysan'ın ofisinde pratikte 2 kişide: Aysan (owner) + Mehmet (partner).
 * Tüm sorgular parametrelidir; dize birleştirme ile SQL kurulmaz.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { generateToken, getPool, hashPassword, withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { HttpError, requireApproval, requireOwner, resolveSession } from "../session.js";

export const teamRoutes = new Hono();

const roleEnum = z.enum(["owner", "partner", "manager", "agent", "finance", "viewer"]);

teamRoutes.get("/", async (c) => {
  const session = await resolveSession(c);

  const members = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select m.user_id, m.role, m.status, m.can_approve,
             u.full_name, u.email, u.is_active, u.must_change_password
        from membership m
        join app_user u on u.id = m.user_id
       order by m.can_approve desc, u.full_name
    `);
    return (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  });

  return c.json({
    tenant: { id: session.tenantId, name: session.tenantName },
    members: members.map((m) => ({
      id: m.user_id,
      name: m.full_name,
      email: m.email,
      role: m.role,
      status: m.status,
      canApprove: m.can_approve,
      isActive: m.is_active,
      mustChangePassword: m.must_change_password,
    })),
  });
});

teamRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requireApproval(session, "ekip üyesi ekleme");

  const body = z
    .object({
      fullName: z.string().min(2).max(120),
      email: z.string().min(5).max(200),
      role: roleEnum.default("agent"),
      canApprove: z.boolean().default(false),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HttpError(400, body.error.issues[0]?.message ?? "Geçersiz veri");
  }

  const { fullName, email, role, canApprove } = body.data;
  if ((role === "owner" || canApprove) && session.role !== "owner") {
    throw new HttpError(403, "Sahip/ortak rolü ve onay yetkisi yalnız ofis sahibince verilir");
  }

  const existing = await getPool().query<{ id: string }>(
    "select id from app_user where lower(email) = lower($1)",
    [email],
  );

  let userId = existing.rows[0]?.id;
  let tempPassword: string | undefined;

  if (!userId) {
    tempPassword = generateToken(9).replaceAll("-", "").replaceAll("_", "").slice(0, 12);
    const created = await getPool().query<{ id: string }>(
      `insert into app_user (email, full_name, password_hash, must_change_password)
       values ($1, $2, $3, true) returning id`,
      [email, fullName, hashPassword(tempPassword)],
    );
    userId = created.rows[0]!.id;
  }

  try {
    await withTenant(session.tenantId, async (tx) => {
      await tx.execute(sql`
        insert into membership (tenant_id, user_id, role, can_approve)
        values (${session.tenantId}::uuid, ${userId}::uuid, ${role}::member_role, ${canApprove})
        on conflict (tenant_id, user_id)
        do update set role = excluded.role, can_approve = excluded.can_approve, status = 'active'
      `);
    });
  } catch (error) {
    // Yeni kullanıcı açıldıysa ve üyelik yazılamadıysa yetim kayıt bırakma
    if (tempPassword) {
      await getPool().query("delete from app_user where id = $1", [userId]);
    }
    throw error;
  }

  return c.json(
    {
      ok: true,
      userId,
      // Şifre yalnız bir kez, oluşturma yanıtında görünür.
      ...(tempPassword ? { tempPassword, note: "İlk girişte şifre değiştirilecek" } : {}),
    },
    201,
  );
});

teamRoutes.patch("/:userId", async (c) => {
  const session = await resolveSession(c);
  requireApproval(session, "yetki değiştirme");

  const userId = c.req.param("userId");
  const body = z
    .object({
      role: roleEnum.optional(),
      status: z.enum(["active", "left"]).optional(),
      canApprove: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Geçersiz veri");

  if (body.data.canApprove !== undefined) requireOwner(session, "onay yetkisi verme");
  if (body.data.role === "owner") requireOwner(session, "sahip rolü verme");
  if (userId === session.userId && body.data.status === "left") {
    throw new HttpError(400, "Kendi üyeliğinizi kapatamazsınız");
  }

  const role = body.data.role ?? null;
  const status = body.data.status ?? null;
  const canApprove = body.data.canApprove ?? null;

  const updated = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update membership
         set role = coalesce(${role}::member_role, role),
             status = coalesce(${status}::member_status, status),
             can_approve = coalesce(${canApprove}::boolean, can_approve)
       where user_id = ${userId}::uuid
       returning user_id, role, status, can_approve
    `);
    return (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  });

  if (updated.length === 0) throw new HttpError(404, "Bu ofiste böyle bir üye yok");
  return c.json({ ok: true, member: updated[0] });
});

/**
 * Personel portföyü — TUR:23 kullanıcı isteği.
 * "Personeller tıklandığında o personelin portföyü satılıkları kiralıkları çıksın,
 *  alınan teklifler altında belirtilsin, mülk tıklanınca detayı açılsın."
 * Yetki: her personel yalnız kendi portföyünü görür; yönetici/ortak/ofis sahibi
 * herkesinkini görür (kaynak dosya: "personel yalnız kendi portföyünü görür").
 */
teamRoutes.get("/:memberId/portfolio", async (c) => {
  const session = await resolveSession(c);
  const memberId = c.req.param("memberId");
  const self = memberId === session.userId;
  if (!self && !session.canApprove) {
    throw new HttpError(403, "Başka personelin portföyünü görmek için onay yetkisi gerekir");
  }

  const data = await withTenant(session.tenantId, async (tx) => {
    const memberResult = await tx.execute(sql`
      select u.id, u.full_name as "fullName", u.email, u.phone,
             m.role, m.status, m.can_approve as "canApprove"
        from membership m join app_user u on u.id = m.user_id
       where m.user_id = ${memberId}::uuid
       limit 1
    `);
    const member = (memberResult as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!member) return null;

    const listingResult = await tx.execute(sql`
      select l.id as "listingId", l.kind, l.status, l.price_kurus as "priceKurus",
             l.created_at as "listingCreatedAt", l.published_at as "publishedAt",
             pr.id as "propertyId", pr.title, pr.address, pr.district, pr.city,
             pr.room_count as "roomCount", pr.gross_m2 as "grossM2", pr.floor,
             pr.site_name as "siteName", pr.building_name as "buildingName",
             pr.unit_no as "unitNo", pr.block, pr.type, pr.created_at as "enteredAt",
             ow.full_name as "ownerName", ow.phone as "ownerPhone"
        from listing l
        join property pr on pr.id = l.property_id
        left join person ow on ow.id = pr.owner_person_id
       where l.responsible_user_id = ${memberId}::uuid
       order by l.kind, pr.district, pr.title
    `);
    const listings = (listingResult as unknown as { rows: Array<Record<string, unknown>> }).rows;

    const offerResult = await tx.execute(sql`
      select o.id, o.listing_id as "listingId", o.bidder_name as "bidderName",
             o.bidder_phone as "bidderPhone", o.amount_kurus as "amountKurus",
             o.status, o.note, o.created_at as "createdAt"
        from offer o
        join listing l on l.id = o.listing_id
       where l.responsible_user_id = ${memberId}::uuid
       order by o.created_at desc
    `);
    const offers = (offerResult as unknown as { rows: Array<Record<string, unknown>> }).rows;

    const averageResult = await tx.execute(sql`
      select pr.district,
             count(*) filter (where l.kind = 'rent')::int as "rentCount",
             count(*) filter (where l.kind = 'sale')::int as "saleCount",
             coalesce(avg(l.price_kurus) filter (where l.kind = 'rent'), 0)::bigint as "avgRentKurus",
             coalesce(avg(l.price_kurus) filter (where l.kind = 'sale'), 0)::bigint as "avgSaleKurus"
        from listing l
        join property pr on pr.id = l.property_id
       where l.status = 'active' and pr.district is not null
       group by pr.district
    `);
    const averages = (averageResult as unknown as { rows: Array<Record<string, unknown>> }).rows;

    return { member, listings, offers, averages };
  });

  if (!data) throw new HttpError(404, "Personel bulunamadı");

  const offersByListing = new Map<string, Array<Record<string, unknown>>>();
  for (const offer of data.offers) {
    const key = String(offer.listingId);
    const list = offersByListing.get(key) ?? [];
    list.push(offer);
    offersByListing.set(key, list);
  }

  return c.json({
    member: {
      id: String(data.member.id),
      fullName: String(data.member.fullName),
      email: String(data.member.email),
      phone: data.member.phone === null ? null : String(data.member.phone),
      role: String(data.member.role),
      status: String(data.member.status),
      canApprove: Boolean(data.member.canApprove),
    },
    listings: data.listings.map((row) => {
      const priceKurus = Number(row.priceKurus ?? 0);
      return {
        listingId: String(row.listingId),
        propertyId: String(row.propertyId),
        kind: String(row.kind),
        status: String(row.status),
        priceKurus,
        priceText: formatTry(priceKurus),
        title: String(row.title),
        address: row.address === null ? null : String(row.address),
        district: row.district === null ? null : String(row.district),
        city: row.city === null ? null : String(row.city),
        roomCount: row.roomCount === null ? null : String(row.roomCount),
        grossM2: row.grossM2 === null ? null : Number(row.grossM2),
        floor: row.floor === null ? null : Number(row.floor),
        siteName: row.siteName === null ? null : String(row.siteName),
        buildingName: row.buildingName === null ? null : String(row.buildingName),
        unitNo: row.unitNo === null ? null : String(row.unitNo),
        block: row.block === null ? null : String(row.block),
        type: String(row.type),
        enteredAt: String(row.enteredAt),
        publishedAt: row.publishedAt === null ? null : String(row.publishedAt),
        ownerName: row.ownerName === null ? null : String(row.ownerName),
        ownerPhone: row.ownerPhone === null ? null : String(row.ownerPhone),
        offers: (offersByListing.get(String(row.listingId)) ?? []).map((offer) => ({
          id: String(offer.id),
          bidderName: String(offer.bidderName),
          bidderPhone: offer.bidderPhone === null ? null : String(offer.bidderPhone),
          amountKurus: Number(offer.amountKurus ?? 0),
          amountText: formatTry(Number(offer.amountKurus ?? 0)),
          status: String(offer.status),
          note: offer.note === null ? null : String(offer.note),
          createdAt: String(offer.createdAt),
        })),
      };
    }),
    averages: data.averages.map((row) => ({
      district: String(row.district),
      rentCount: Number(row.rentCount ?? 0),
      saleCount: Number(row.saleCount ?? 0),
      avgRentKurus: Number(row.avgRentKurus ?? 0),
      avgRentText: formatTry(Number(row.avgRentKurus ?? 0)),
      avgSaleKurus: Number(row.avgSaleKurus ?? 0),
      avgSaleText: formatTry(Number(row.avgSaleKurus ?? 0)),
    })),
  });
});
