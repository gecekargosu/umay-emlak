/**
 * Kiracı talep bağlantıları — TUR:55.
 *
 * Ofis, kiralık sözleşme için süreli bir bağlantı üretir. Jetonun kendisi
 * veritabanına yazılmaz; yalnız sha256 özeti saklanır ve üretildiği anda bir kez
 * gösterilir. Bağlantı iptal edilir (revoked_at) ama satır silinmez: kim ne zaman
 * üretti/iptal etti kaydı kalır.
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { generateToken, schema, sha256Hex, withTenant } from "@umay/db";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const tenantLinkRoutes = new Hono();

type LinkRow = {
  id: string;
  createdAt: string;
  expiresOn: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdBy: string | null;
};

const createSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

tenantLinkRoutes.get("/:id/tenant-links", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const contractId = c.req.param("id");

  const rows = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      select l.id, l.created_at as "createdAt", l.expires_on::text as "expiresOn",
             l.revoked_at as "revokedAt", l.last_used_at as "lastUsedAt",
             l.use_count as "useCount", u.full_name as "createdBy"
        from tenant_access_link l
        left join app_user u on u.id = l.created_by_user_id
       where l.contract_id = ${contractId}::uuid
       order by l.created_at desc
    `);
    return (result as unknown as { rows: LinkRow[] }).rows;
  });

  return c.json({
    items: rows.map((row) => ({
      ...row,
      useCount: Number(row.useCount),
      active: !row.revokedAt && row.expiresOn >= new Date().toISOString().slice(0, 10),
    })),
  });
});

tenantLinkRoutes.post("/:id/tenant-links", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kiracı bağlantısı");
  const contractId = c.req.param("id");

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçerlilik süresi geçersiz");
  const days = parsed.data.days ?? 90;

  const [contract] = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, contractId))
      .limit(1),
  );
  if (!contract) throw new HttpError(404, "Sözleşme bulunamadı");

  const token = generateToken(24);
  const hash = sha256Hex(token);

  const created = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      insert into tenant_access_link
        (tenant_id, contract_id, token_hash, created_by_user_id, expires_on)
      values (${session.tenantId}::uuid, ${contractId}::uuid, ${hash},
              ${session.userId}::uuid, (current_date + ${days}::int))
      returning id, expires_on::text as "expiresOn"
    `);
    return (result as unknown as { rows: Array<{ id: string; expiresOn: string }> }).rows[0];
  });
  if (!created) throw new HttpError(409, "Bağlantı oluşturulamadı");

  // Jeton yalnız bu yanıtta görünür; veritabanında özeti durur.
  return c.json({ id: created.id, token, expiresOn: created.expiresOn, days }, 201);
});

tenantLinkRoutes.delete("/:id/tenant-links/:linkId", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "kiracı bağlantısı iptali");
  const contractId = c.req.param("id");
  const linkId = c.req.param("linkId");

  const revoked = await withTenant(session.tenantId, async (tx) => {
    const result = await tx.execute(sql`
      update tenant_access_link
         set revoked_at = now()
       where id = ${linkId}::uuid and contract_id = ${contractId}::uuid
         and revoked_at is null
      returning id
    `);
    return (result as unknown as { rows: Array<{ id: string }> }).rows[0] ?? null;
  });

  if (!revoked) throw new HttpError(404, "Bağlantı bulunamadı veya zaten iptal");
  return c.json({ ok: true });
});
