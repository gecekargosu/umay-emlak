/**
 * Kiracının giriş yapmadan kullandığı uçlar — TUR:55.
 *
 * Tek yetki aracı bağlantı jetonu: ofis, kiralık sözleşme için süreli jeton üretir.
 * Jeton yalnız sha256 özetiyle aranır; süresi dolmuş veya iptal edilmiş jeton 404.
 *
 * Bu uçlar oturum çerezi istemez; bu yüzden ofis kimliği jetonun kendisinden gelir
 * (tenant_link_lookup → withTenant). İstemciden ofis kimliği ASLA alınmaz.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getPool, sha256Hex, withTenant } from "@umay/db";
import { HttpError } from "../session.js";

export const publicTenantRoutes = new Hono();

type LinkRow = {
  id: string;
  tenant_id: string;
  contract_id: string;
  expires_on: string | Date;
  revoked_at: string | null;
};

/** Aynı bağlantıdan dakikada 5 bildirim; bellek içi (tek süreç) yeterli. */
const POST_LIMIT = 5;
const POST_WINDOW_MS = 10 * 60_000;
const posts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): void {
  const now = Date.now();
  const entry = posts.get(key);
  if (!entry || entry.resetAt <= now) {
    posts.set(key, { count: 1, resetAt: now + POST_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > POST_LIMIT) {
    throw new HttpError(429, "Çok fazla bildirim gönderildi. Biraz sonra tekrar deneyin.");
  }
}

async function resolveLink(token: string): Promise<LinkRow> {
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(token)) throw new HttpError(404, "Bağlantı bulunamadı");
  const { rows } = await getPool().query<LinkRow>("select * from tenant_link_lookup($1)", [
    sha256Hex(token),
  ]);
  const link = rows[0];
  if (!link) throw new HttpError(404, "Bağlantı bulunamadı");
  if (link.revoked_at) throw new HttpError(404, "Bu bağlantı iptal edilmiş");
  const expiresIso =
    link.expires_on instanceof Date
      ? link.expires_on.toISOString().slice(0, 10)
      : String(link.expires_on).slice(0, 10);
  const expires = new Date(`${expiresIso}T23:59:59`);
  if (Number.isNaN(expires.getTime()) || expires.getTime() < Date.now()) {
    throw new HttpError(404, "Bağlantının süresi dolmuş");
  }
  return link;
}

/** Bağlantı sahibi: hangi mülk, hangi kiracı — form bunu gösterir. */
publicTenantRoutes.get("/:token", async (c) => {
  const link = await resolveLink(c.req.param("token"));

  const info = await withTenant(link.tenant_id, async (tx) => {
    const result = await tx.execute(sql`
      select p.title, p.district, p.city, per.full_name as "tenantName",
             t.name as "officeName",
             (select count(*)::int from maintenance_request m
               where m.property_id = p.id and m.status in ('open', 'in_progress'))
               as "openCount"
        from contract c
        join listing l on l.id = c.listing_id
        join property p on p.id = l.property_id
        join person per on per.id = c.tenant_person_id
        join tenant t on t.id = c.tenant_id
       where c.id = ${link.contract_id}::uuid
    `);
    return (result as unknown as {
      rows: Array<{
        title: string;
        district: string | null;
        city: string | null;
        tenantName: string;
        officeName: string;
        openCount: number;
      }>;
    }).rows[0];
  });

  if (!info) throw new HttpError(404, "Bağlantı bulunamadı");
  return c.json({ ...info, openCount: Number(info.openCount) });
});

const requestSchema = z.object({
  title: z.string().trim().min(3, "Konu en az 3 harf olmalı").max(160),
  description: z.string().trim().max(1000).optional(),
  category: z
    .enum(["electrical", "plumbing", "heating", "elevator", "appliance", "other"])
    .default("other"),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  phone: z.string().trim().max(30).optional(),
});

publicTenantRoutes.post("/:token/maintenance", async (c) => {
  const token = c.req.param("token");
  throttle(sha256Hex(token).slice(0, 16));
  const link = await resolveLink(token);

  const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Bildirim geçersiz");
  }
  const input = parsed.data;

  const created = await withTenant(link.tenant_id, async (tx) => {
    const note = input.phone
      ? `Kiracı bağlantısından bildirildi · kiracının verdiği telefon: ${input.phone}`
      : "Kiracı bağlantısından bildirildi";

    const result = await tx.execute(sql`
      insert into maintenance_request
        (tenant_id, property_id, listing_id, person_id, title, description,
         category, priority, reported_at, note)
      select c.tenant_id, l.property_id, c.listing_id, c.tenant_person_id,
             ${input.title}, ${input.description?.trim() || null},
             ${input.category}, ${input.priority}, current_date, ${note}
        from contract c
        join listing l on l.id = c.listing_id
       where c.id = ${link.contract_id}::uuid
      returning id, title
    `);
    const row = (result as unknown as { rows: Array<{ id: string; title: string }> }).rows[0];
    if (!row) throw new HttpError(409, "Talep kaydedilemedi");

    await tx.execute(sql`
      update tenant_access_link
         set last_used_at = now(), use_count = use_count + 1
       where id = ${link.id}::uuid
    `);
    return row;
  });

  return c.json({ ok: true, id: created.id, title: created.title }, 201);
});
