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
