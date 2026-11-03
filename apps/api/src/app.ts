/**
 * HTTP katmanı.
 * Sıra: oturum (imzalı çerez) → kiracı bağlamı (withTenant) → sorgu.
 * Kiracı kimliği istemciden alınmaz; oturumdan gelir (K-07).
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant, getPool, schema } from "@umay/db";
import { formatTry } from "@umay/shared";
import { z } from "zod";
import {
  HttpError,
  requireApproval,
  requirePasswordChanged,
  resolveSession,
} from "./session.js";
import { authRoutes } from "./routes/auth.js";
import { teamRoutes } from "./routes/team.js";

export const app = new Hono();

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status);
  }
  console.error("beklenmeyen hata:", error);
  return c.json({ error: "Sunucu hatası" }, 500);
});

app.get("/health", async (c) => {
  const { rows } = await getPool().query<{ count: number }>(
    "select count(*)::int as count from _migration",
  );
  return c.json({ ok: true, migrations: rows[0]?.count ?? 0 });
});

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/team", teamRoutes);

app.get("/api/v1/me", async (c) => {
  const session = await resolveSession(c);
  return c.json({
    user: { id: session.userId, name: session.fullName, email: session.email },
    tenant: { id: session.tenantId, name: session.tenantName },
    role: session.role,
    canApprove: session.canApprove,
    mustChangePassword: session.mustChangePassword,
  });
});

/** Portföy listesi — kiracı bağlamı zorunlu. */
app.get("/api/v1/listings", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) => {
    return tx
      .select({
        id: schema.listings.id,
        kind: schema.listings.kind,
        status: schema.listings.status,
        priceKurus: schema.listings.priceKurus,
        title: schema.properties.title,
        district: schema.properties.district,
        city: schema.properties.city,
      })
      .from(schema.listings)
      .innerJoin(schema.properties, sql`${schema.properties.id} = ${schema.listings.propertyId}`)
      .orderBy(sql`${schema.listings.createdAt} desc`)
      .limit(100);
  });

  return c.json({
    count: rows.length,
    items: rows.map((r) => ({ ...r, price: formatTry(r.priceKurus) })),
  });
});

const newListing = z.object({
  propertyTitle: z.string().min(2).max(200),
  ownerPersonId: z.uuid(),
  kind: z.enum(["sale", "rent"]),
  priceKurus: z.number().int().nonnegative(),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
});

app.post("/api/v1/listings", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const parsed = newListing.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HttpError(400, `Geçersiz veri: ${parsed.error.issues[0]?.message ?? "bilinmiyor"}`);
  }
  const input = parsed.data;

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .insert(schema.properties)
      .values({
        tenantId: session.tenantId,
        ownerPersonId: input.ownerPersonId,
        title: input.propertyTitle,
        city: input.city ?? null,
        district: input.district ?? null,
      })
      .returning({ id: schema.properties.id });

    const [listing] = await tx
      .insert(schema.listings)
      .values({
        tenantId: session.tenantId,
        propertyId: property!.id,
        kind: input.kind,
        status: "draft",
        priceKurus: input.priceKurus,
        responsibleUserId: session.userId,
      })
      .returning({ id: schema.listings.id });

    return listing!;
  });

  return c.json({ id: created.id }, 201);
});

/** Pano özeti — para toplamı kuruş, gösterim biçimlendirilmiş. */
app.get("/api/v1/summary", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const summary = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select
        (select count(*)::int from listing where status = 'active')            as active_listings,
        (select count(*)::int from contract where status = 'active')           as active_contracts,
        (select count(*)::int from property)                                   as properties,
        (select coalesce(sum(amount_kurus), 0)::bigint from charge where status in ('open','partial')) as open_kurus,
        (select count(*)::int from charge where status in ('open','partial') and due_date < current_date) as overdue_count
    `);
    return (result as unknown as { rows: Array<Record<string, number | string>> }).rows[0]!;
  });

  const openKurus = Number(summary.open_kurus ?? 0);
  return c.json({
    activeListings: Number(summary.active_listings ?? 0),
    activeContracts: Number(summary.active_contracts ?? 0),
    properties: Number(summary.properties ?? 0),
    openKurus,
    openFormatted: formatTry(openKurus),
    overdueCount: Number(summary.overdue_count ?? 0),
  });
});

/** K-29 örneği: komisyon onayı yalnız yetkilide. */
app.post("/api/v1/commissions/:id/approve", async (c) => {
  const session = await resolveSession(c);
  requireApproval(session, "komisyon onayı");
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const updated = await withTenant(session.tenantId, async (tx) =>
    tx.execute(sql`
      update commission
         set status = 'approved', approved_by_user_id = ${session.userId}
       where id = ${id} and status = 'proposed'
      returning id
    `),
  );

  const rows = (updated as unknown as { rows: unknown[] }).rows;
  if (rows.length === 0) throw new HttpError(404, "Komisyon bulunamadı veya zaten onaylı");
  return c.json({ ok: true });
});
