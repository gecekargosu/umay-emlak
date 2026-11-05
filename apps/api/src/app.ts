/**
 * HTTP katmanı.
 * Sıra: oturum (imzalı çerez) → kiracı bağlamı (withTenant) → sorgu.
 * Kiracı kimliği istemciden alınmaz; oturumdan gelir (K-07).
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant, getPool } from "@umay/db";
import { formatTry } from "@umay/shared";
import {
  HttpError,
  requireApproval,
  requirePasswordChanged,
  resolveSession,
} from "./session.js";
import { authRoutes } from "./routes/auth.js";
import { teamRoutes } from "./routes/team.js";
import { peopleRoutes } from "./routes/people.js";
import { propertyRoutes } from "./routes/properties.js";
import { propertyAssetRoutes } from "./routes/property-assets.js";
import { importRoutes } from "./routes/import.js";
import { listingRoutes } from "./routes/listings.js";
import { documentRoutes } from "./routes/documents.js";
import { contractRoutes } from "./routes/contracts.js";
import { chargeRoutes } from "./routes/charges.js";
import { payoutRoutes } from "./routes/payouts.js";
import { todayRoutes } from "./routes/today.js";
import { ownerRoutes } from "./routes/owners.js";
import { tenantRoutes } from "./routes/tenants.js";
import { offerRoutes } from "./routes/offers.js";
import { commissionRoutes } from "./routes/commissions.js";
import { calendarRoutes } from "./routes/calendar.js";
import { mediaRoutes } from "./routes/media.js";
import { listingBoardRoutes } from "./routes/listing-board.js";
import { handoverRoutes } from "./routes/handovers.js";
import { tenantLinkRoutes } from "./routes/tenant-links.js";
import { publicTenantRoutes } from "./routes/public-tenant.js";
import { policyRoutes } from "./routes/policies.js";
import { rentRevisionRoutes } from "./routes/rent-revisions.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { suggestionRoutes } from "./routes/suggestions.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { auditMiddleware, logJson, makeRef, type AuditEnv } from "./audit.js";

export const app = new Hono<AuditEnv>();

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status);
  }
  // TUR:58 — denetimde görüldü: uuid yerine düz metin gelen yolda Postgres
  // "invalid input syntax for type uuid" (22P02) fırlatıyor ve 500 dönüyordu.
  // Var olmayan kayıt gibi davran: 404. Teknik ayrıntı log'a gitmez.
  const pgCode =
    (error as { code?: string; cause?: { code?: string } }).code ??
    (error as { cause?: { code?: string } }).cause?.code;
  if (pgCode === "22P02") {
    return c.json({ error: "Kayıt bulunamadı" }, 404);
  }
  // K-9: kullanıcıya sade cümle + kayıt numarası; teknik ayrıntı yalnız log'a.
  const ref = c.get("ref") ?? makeRef();
  logJson({
    level: "error",
    ref,
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
  return c.json(
    { error: `Beklenmeyen bir hata oldu. Bu numarayla bildirin: ${ref}`, ref },
    500,
  );
});

// Her isteğe numara + JSON log; yazma istekleri ayrıca audit_log'a düşer (K-6).
app.use("*", auditMiddleware);

app.get("/health", async (c) => {
  const { rows } = await getPool().query<{ count: number }>(
    "select count(*)::int as count from _migration",
  );
  return c.json({ ok: true, migrations: rows[0]?.count ?? 0 });
});

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/team", teamRoutes);
app.route("/api/v1/people", peopleRoutes);
app.route("/api/v1/properties", propertyRoutes);
app.route("/api/v1/properties", propertyAssetRoutes);
app.route("/api/v1/import", importRoutes);
app.route("/api/v1/listings", listingRoutes);
app.route("/api/v1/documents", documentRoutes);
app.route("/api/v1/contracts", contractRoutes);
app.route("/api/v1/charges", chargeRoutes);
app.route("/api/v1/payouts", payoutRoutes);
app.route("/api/v1/today", todayRoutes);
app.route("/api/v1/owners", ownerRoutes);
app.route("/api/v1/tenants", tenantRoutes);
app.route("/api/v1/offers", offerRoutes);
app.route("/api/v1/listings", commissionRoutes);
app.route("/api/v1/calendar", calendarRoutes);
app.route("/api/v1/properties", mediaRoutes);
app.route("/api/v1/listings", listingBoardRoutes);
app.route("/api/v1/contracts", handoverRoutes);
app.route("/api/v1/contracts", tenantLinkRoutes);
app.route("/api/v1/public/tenant", publicTenantRoutes);
app.route("/api/v1/policies", policyRoutes);
app.route("/api/v1/contracts", rentRevisionRoutes);
app.route("/api/v1/rent-revisions", rentRevisionRoutes);
app.route("/api/v1/appointments", appointmentRoutes);
app.route("/api/v1/people", suggestionRoutes);
app.route("/api/v1/maintenance", maintenanceRoutes);

/**
 * Denetim kaydı — "kim ne yaptı" (K-6). Yalnız okuma; kayıt silinmez.
 *
 * TUR:53 — ekran için süzgeçler: kişi (userId), tarih aralığı (from/to), serbest
 * arama (q: işlem, yol, kişi adı, kayıt no). Toplam sayı limit dışında ayrıca döner.
 */
app.get("/api/v1/audit", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const asked = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 50;

  const q = (c.req.query("q") ?? "").trim();
  const userId = (c.req.query("userId") ?? "").trim();
  const from = (c.req.query("from") ?? "").trim();
  const to = (c.req.query("to") ?? "").trim();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  const conditions = [sql`1 = 1`];
  if (q) {
    const like = `%${q.toLocaleLowerCase("tr")}%`;
    conditions.push(sql`(
      lower(a.action) like ${like}
      or lower(a.path) like ${like}
      or lower(coalesce(a.request_ref, '')) like ${like}
      or lower(coalesce(u.full_name, '')) like ${like}
    )`);
  }
  if (uuidRe.test(userId)) conditions.push(sql`a.user_id = ${userId}::uuid`);
  if (dateRe.test(from)) conditions.push(sql`a.created_at >= ${from}::date`);
  if (dateRe.test(to)) conditions.push(sql`a.created_at < (${to}::date + interval '1 day')`);
  const where = sql.join(conditions, sql` and `);

  const data = await withTenant(session.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      select a.id, a.request_ref as "ref", a.method, a.path, a.action,
             a.entity_type as "entityType", a.entity_id as "entityId", a.status,
             a.user_id as "userId", u.full_name as "userName", a.created_at as "createdAt"
        from audit_log a
        left join app_user u on u.id = a.user_id
       where ${where}
       order by a.created_at desc
       limit ${limit}
    `);

    const totals = await tx.execute(sql`
      select count(*)::int as "total"
        from audit_log a
        left join app_user u on u.id = a.user_id
       where ${where}
    `);

    // Kişi süzgeci: yalnız kaydı olan personel (boş seçenek listesi olmasın).
    const users = await tx.execute(sql`
      select distinct u.id, u.full_name as "name"
        from audit_log a
        join app_user u on u.id = a.user_id
       order by u.full_name
    `);

    return {
      items: (rows as unknown as { rows: unknown[] }).rows,
      users: (users as unknown as { rows: unknown[] }).rows,
      total: Number((totals as unknown as { rows: Array<{ total: number }> }).rows[0]?.total ?? 0),
    };
  });

  return c.json(data);
});

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
        (select count(*)::int from charge where status in ('open','partial') and due_date < current_date) as overdue_count,
        (select count(*)::int from document)                                   as documents,
        (select count(*)::int from document_suggestion where status = 'pending') as pending_matches
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
    documents: Number(summary.documents ?? 0),
    pendingMatches: Number(summary.pending_matches ?? 0),
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
