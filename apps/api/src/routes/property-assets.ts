/**
 * Y-55: mülk abonelikleri ve demirbaş listesi.
 * Kayıt amaçlıdır: program fatura ödemez, tahsilat yapmaz (S-04 ruhu).
 */
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { formatTry, parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";

export const propertyAssetRoutes = new Hono();

function monthly(text: string | undefined | null): number | null {
  if (!text || text.trim() === "") return null;
  try {
    return parseTryToKurus(text);
  } catch (error) {
    throw new HttpError(400, `Aylık tutar: ${(error as Error).message}`);
  }
}

propertyAssetRoutes.get("/:id/assets", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const data = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .select({ id: schema.properties.id, title: schema.properties.title })
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!property) return null;

    const subscriptions = await tx
      .select()
      .from(schema.propertySubscriptions)
      .where(eq(schema.propertySubscriptions.propertyId, id))
      .orderBy(desc(schema.propertySubscriptions.createdAt));

    const fixtures = await tx
      .select()
      .from(schema.propertyFixtures)
      .where(eq(schema.propertyFixtures.propertyId, id))
      .orderBy(schema.propertyFixtures.name);

    return {
      property,
      subscriptions: subscriptions.map((s) => ({
        ...s,
        monthly: s.monthlyKurus === null ? null : formatTry(s.monthlyKurus),
      })),
      fixtures,
    };
  });

  if (!data) throw new HttpError(404, "Gayrimenkul bulunamadı");
  return c.json(data);
});

propertyAssetRoutes.post("/:id/subscriptions", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "abonelik ekleme");
  const id = c.req.param("id");

  const parsed = z
    .object({
      kind: z.string().min(2).max(40),
      provider: z.string().max(80).optional(),
      subscriberNo: z.string().max(60).optional(),
      monthlyText: z.string().max(40).optional(),
      note: z.string().max(300).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz veri");

  const [created] = await withTenant(session.tenantId, async (tx) =>
    tx
      .insert(schema.propertySubscriptions)
      .values({
        tenantId: session.tenantId,
        propertyId: id,
        kind: parsed.data.kind.trim(),
        provider: parsed.data.provider?.trim() || null,
        subscriberNo: parsed.data.subscriberNo?.trim() || null,
        monthlyKurus: monthly(parsed.data.monthlyText),
        note: parsed.data.note?.trim() || null,
      })
      .returning({ id: schema.propertySubscriptions.id }),
  );

  return c.json({ id: created!.id }, 201);
});

propertyAssetRoutes.delete("/:id/subscriptions/:subId", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "abonelik silme");

  const deleted = await withTenant(session.tenantId, async (tx) =>
    tx
      .delete(schema.propertySubscriptions)
      .where(eq(schema.propertySubscriptions.id, c.req.param("subId")))
      .returning({ id: schema.propertySubscriptions.id }),
  );
  if (!deleted[0]) throw new HttpError(404, "Abonelik bulunamadı");
  return c.json({ ok: true });
});

propertyAssetRoutes.post("/:id/fixtures", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "demirbaş ekleme");
  const id = c.req.param("id");

  const parsed = z
    .object({
      name: z.string().min(2).max(80),
      quantity: z.number().int().positive().max(999).default(1),
      note: z.string().max(300).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz veri");

  const [created] = await withTenant(session.tenantId, async (tx) =>
    tx
      .insert(schema.propertyFixtures)
      .values({
        tenantId: session.tenantId,
        propertyId: id,
        name: parsed.data.name.trim(),
        quantity: parsed.data.quantity,
        note: parsed.data.note?.trim() || null,
      })
      .returning({ id: schema.propertyFixtures.id }),
  );

  return c.json({ id: created!.id }, 201);
});

propertyAssetRoutes.delete("/:id/fixtures/:fixtureId", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "demirbaş silme");

  const deleted = await withTenant(session.tenantId, async (tx) =>
    tx
      .delete(schema.propertyFixtures)
      .where(eq(schema.propertyFixtures.id, c.req.param("fixtureId")))
      .returning({ id: schema.propertyFixtures.id }),
  );
  if (!deleted[0]) throw new HttpError(404, "Demirbaş bulunamadı");
  return c.json({ ok: true });
});
