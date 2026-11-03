/**
 * Gayrimenkul uçları.
 * K-17: gayrimenkul ≠ portföy. Bir daire hem satılık hem kiralık olabilir;
 * burada yalnız mülk ve malik bağları yönetilir, ilan ayrı tutulur.
 */
import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const propertyRoutes = new Hono();

const propertyTypes = z.enum(["apartment", "house", "land", "shop", "office"]);

propertyRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const q = (c.req.query("q") ?? "").trim();

  const rows = await withTenant(session.tenantId, async (tx) => {
    const base = tx
      .select({
        id: schema.properties.id,
        title: schema.properties.title,
        type: schema.properties.type,
        city: schema.properties.city,
        district: schema.properties.district,
        roomCount: schema.properties.roomCount,
        grossM2: schema.properties.grossM2,
        ownerName: schema.persons.fullName,
      })
      .from(schema.properties)
      .leftJoin(schema.persons, eq(schema.persons.id, schema.properties.ownerPersonId));

    if (q) {
      const like = `%${q.toLocaleLowerCase("tr")}%`;
      return base.where(sql`lower(${schema.properties.title}) like ${like}`).limit(200);
    }
    return base.limit(200);
  });

  return c.json({ count: rows.length, items: rows });
});

const createProperty = z.object({
  title: z.string().min(2).max(200),
  type: propertyTypes.default("apartment"),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  address: z.string().max(400).optional(),
  roomCount: z.string().max(20).optional(),
  grossM2: z.number().int().positive().max(100_000).optional(),
  unitNo: z.string().max(20).optional(),
  deedRef: z.string().max(80).optional(),
  /** Hisseli mülk: birden fazla malik ve isteğe bağlı hisse (baz puan) */
  owners: z
    .array(z.object({ personId: z.uuid(), shareBp: z.number().int().min(0).max(10_000).optional() }))
    .default([]),
});

propertyRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const parsed = createProperty.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz veri");
  }
  const input = parsed.data;

  const shareTotal = input.owners.reduce((sum, o) => sum + (o.shareBp ?? 0), 0);
  if (shareTotal > 10_000) {
    throw new HttpError(400, "Hisseler toplamı %100'ü geçemez");
  }

  const created = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .insert(schema.properties)
      .values({
        tenantId: session.tenantId,
        ownerPersonId: input.owners[0]?.personId ?? null,
        type: input.type,
        title: input.title,
        city: input.city ?? null,
        district: input.district ?? null,
        address: input.address ?? null,
        roomCount: input.roomCount ?? null,
        grossM2: input.grossM2 ?? null,
        unitNo: input.unitNo ?? null,
        deedRef: input.deedRef ?? null,
      })
      .returning({ id: schema.properties.id });

    if (input.owners.length > 0) {
      await tx.insert(schema.propertyOwners).values(
        input.owners.map((o) => ({
          tenantId: session.tenantId,
          propertyId: property!.id,
          personId: o.personId,
          shareBp: o.shareBp ?? null,
        })),
      );
    }

    return property!;
  });

  return c.json({ id: created.id }, 201);
});

propertyRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const [property] = await tx
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, id))
      .limit(1);
    if (!property) return null;

    const owners = await tx
      .select({
        personId: schema.propertyOwners.personId,
        shareBp: schema.propertyOwners.shareBp,
        fullName: schema.persons.fullName,
        phone: schema.persons.phone,
      })
      .from(schema.propertyOwners)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.propertyOwners.personId))
      .where(eq(schema.propertyOwners.propertyId, id));

    const listings = await tx
      .select({
        id: schema.listings.id,
        kind: schema.listings.kind,
        status: schema.listings.status,
        priceKurus: schema.listings.priceKurus,
      })
      .from(schema.listings)
      .where(eq(schema.listings.propertyId, id));

    return { property, owners, listings };
  });

  if (!detail) throw new HttpError(404, "Gayrimenkul bulunamadı");
  return c.json(detail);
});

/** Bir kişinin malik olduğu mülkler (kişi ekranındaki "mülkleri" sekmesi). */
propertyRoutes.get("/by-owner/:personId", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const personId = c.req.param("personId");

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.properties.id,
        title: schema.properties.title,
        city: schema.properties.city,
        district: schema.properties.district,
        shareBp: schema.propertyOwners.shareBp,
      })
      .from(schema.propertyOwners)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.propertyOwners.propertyId))
      .where(eq(schema.propertyOwners.personId, personId)),
  );

  return c.json({ count: rows.length, items: rows });
});

// inArray/and ileride filtre eklendiğinde kullanılacak; tip tarafında tutuluyor.
void and;
void inArray;
