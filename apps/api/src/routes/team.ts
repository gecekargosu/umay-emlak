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
