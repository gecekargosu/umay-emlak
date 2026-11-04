/**
 * Kişi (mal sahibi / kiracı / aday) uçları.
 * Aynı kişi iki kez girilirse uyarı verilir; birleştirme silmez, işaretler (K-16).
 */
import { Hono } from "hono";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import type { Tx } from "@umay/db";
import { parseTryToKurus } from "@umay/shared";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const peopleRoutes = new Hono();

const personKind = z.enum(["owner", "tenant", "candidate"]);

function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

peopleRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const kind = personKind.safeParse(c.req.query("kind") ?? undefined);
  const q = (c.req.query("q") ?? "").trim();

  const rows = await withTenant(session.tenantId, async (tx) => {
    const conditions = [isNull(schema.persons.mergedIntoId)];
    if (kind.success) conditions.push(eq(schema.persons.kind, kind.data));
    if (q) {
      const like = `%${q.toLocaleLowerCase("tr")}%`;
      const digits = q.replace(/\D/g, "");
      // HATA DÜZELTMESİ (TUR:16): eskiden telefon koşulu her aramada ekleniyordu;
      // "ayşe" gibi rakamsız aramada desen '%%' olup TELEFONU OLAN TÜM kişileri
      // döndürüyordu. Artık telefon yalnız en az 3 rakam varsa aranır.
      conditions.push(
        digits.length >= 3
          ? or(
              sql`lower(${schema.persons.fullName}) like ${like}`,
              sql`${schema.persons.phoneDigits} like ${`%${digits}%`}`,
            )!
          : sql`lower(${schema.persons.fullName}) like ${like}`,
      );
    }

    return tx
      .select({
        id: schema.persons.id,
        kind: schema.persons.kind,
        fullName: schema.persons.fullName,
        phone: schema.persons.phone,
        email: schema.persons.email,
        createdAt: schema.persons.createdAt,
        candidateStage: schema.persons.candidateStage,
        followUpDate: schema.persons.followUpDate,
        budgetKurus: schema.persons.budgetKurus,
        wantsDistrict: schema.persons.wantsDistrict,
        wantsRoomCount: schema.persons.wantsRoomCount,
        contactPermission: schema.persons.contactPermission,
        contactPermissionAt: schema.persons.contactPermissionAt,
      })
      .from(schema.persons)
      .where(and(...conditions))
      .orderBy(schema.persons.fullName)
      .limit(200);
  });

  return c.json({ count: rows.length, items: rows });
});

function parseBudget(text: string | null | undefined): number | null {
  if (text === null || text === undefined || text.trim() === "") return null;
  try {
    return parseTryToKurus(text);
  } catch (error) {
    throw new HttpError(400, `Bütçe: ${(error as Error).message}`);
  }
}

const permission = z.enum(["unknown", "allowed", "denied"]);

const createPerson = z.object({
  fullName: z.string().min(2).max(160),
  kind: personKind,
  phone: z.string().max(40).optional(),
  email: z.string().max(160).optional(),
  nationalId: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  /** Y-54: aday CRM'i */
  candidateStage: z.string().max(40).optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budgetText: z.string().max(40).optional(),
  wantsDistrict: z.string().max(80).optional(),
  wantsRoomCount: z.string().max(20).optional(),
  /** Y-59: KVKK iletişim izni */
  contactPermission: permission.optional(),
  contactPermissionNote: z.string().max(500).optional(),
});

peopleRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const parsed = createPerson.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Geçersiz veri");
  }
  const input = parsed.data;
  const digits = phoneDigits(input.phone);
  const force = c.req.query("force") === "1";

  const result = await withTenant(session.tenantId, async (tx) => {
    // Mükerrer uyarısı: aynı telefon veya aynı ad soyad
    if (!force) {
      const existing = await tx
        .select({ id: schema.persons.id, fullName: schema.persons.fullName })
        .from(schema.persons)
        .where(
          and(
            isNull(schema.persons.mergedIntoId),
            or(
              digits ? eq(schema.persons.phoneDigits, digits) : sql`false`,
              sql`lower(${schema.persons.fullName}) = lower(${input.fullName})`,
            ),
          ),
        )
        .limit(1);

      if (existing[0]) return { duplicate: existing[0] as { id: string; fullName: string } };
    }

    const [created] = await tx
      .insert(schema.persons)
      .values({
        tenantId: session.tenantId,
        kind: input.kind,
        fullName: input.fullName,
        phone: input.phone ?? null,
        phoneDigits: digits,
        email: input.email ?? null,
        nationalId: input.nationalId ?? null,
        notes: input.notes ?? null,
        source: "manual",
        candidateStage: input.candidateStage ?? null,
        followUpDate: input.followUpDate ?? null,
        budgetKurus: parseBudget(input.budgetText),
        wantsDistrict: input.wantsDistrict ?? null,
        wantsRoomCount: input.wantsRoomCount ?? null,
        contactPermission: input.contactPermission ?? "unknown",
        contactPermissionAt: input.contactPermission ? new Date() : null,
        contactPermissionNote: input.contactPermissionNote ?? null,
      })
      .returning({ id: schema.persons.id, fullName: schema.persons.fullName });

    return { created: created! };
  });

  if ("duplicate" in result) {
    return c.json(
      {
        error: "Bu kişi zaten kayıtlı olabilir. Birleştir veya yine de ekle (?force=1).",
        duplicate: result.duplicate,
      },
      409,
    );
  }

  return c.json(result.created, 201);
});

peopleRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const [person] = await tx
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, id))
      .limit(1);
    if (!person) return null;

    // HATA DÜZELTMESİ (TUR:23): mülk sahibi yalnız property_owner (hisse) tablosundan
    // okunuyordu; normal kayıtta sahiplik property.owner_person_id alanında durduğu için
    // kişi kartı "0 mülk" diyor, mal sahibi klasörü ise 8 mülk gösteriyordu. Artık ikisi
    // birlikte okunuyor (aynı mülk iki yoldan da gelirse tek satır).
    const owned = await tx
      .selectDistinct({
        id: schema.properties.id,
        title: schema.properties.title,
        city: schema.properties.city,
        district: schema.properties.district,
        shareBp: schema.propertyOwners.shareBp,
      })
      .from(schema.properties)
      .leftJoin(
        schema.propertyOwners,
        and(
          eq(schema.propertyOwners.propertyId, schema.properties.id),
          eq(schema.propertyOwners.personId, id),
        ),
      )
      .where(or(eq(schema.properties.ownerPersonId, id), eq(schema.propertyOwners.personId, id)));

    const contracts = await tx
      .select({
        id: schema.contracts.id,
        startDate: schema.contracts.startDate,
        rentKurus: schema.contracts.rentKurus,
        status: schema.contracts.status,
      })
      .from(schema.contracts)
      .where(eq(schema.contracts.tenantPersonId, id));

    // TUR:48 — kişi kartında belgeler görünsün (kimlik, sözleşme, tapu…).
    const documents = await tx
      .select({
        id: schema.documents.id,
        kind: schema.documents.kind,
        title: schema.documents.title,
        filename: schema.documents.filename,
        sizeBytes: schema.documents.sizeBytes,
        createdAt: schema.documents.createdAt,
      })
      .from(schema.documents)
      .where(eq(schema.documents.personId, id));

    return { person, properties: owned, contracts, documents };
  });

  if (!detail) throw new HttpError(404, "Kişi bulunamadı");
  return c.json(detail);
});

const updatePerson = z.object({
  fullName: z.string().min(2).max(160).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  kind: personKind.optional(),
  candidateStage: z.string().max(40).nullable().optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  budgetText: z.string().max(40).nullable().optional(),
  wantsDistrict: z.string().max(80).nullable().optional(),
  wantsRoomCount: z.string().max(20).nullable().optional(),
  contactPermission: permission.optional(),
  contactPermissionNote: z.string().max(500).nullable().optional(),
});

peopleRoutes.patch("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const parsed = updatePerson.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Geçersiz veri");
  const input = parsed.data;

  const updated = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.persons)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined
          ? { phone: input.phone, phoneDigits: phoneDigits(input.phone) }
          : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.candidateStage !== undefined ? { candidateStage: input.candidateStage } : {}),
        ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
        ...(input.budgetText !== undefined ? { budgetKurus: parseBudget(input.budgetText) } : {}),
        ...(input.wantsDistrict !== undefined ? { wantsDistrict: input.wantsDistrict } : {}),
        ...(input.wantsRoomCount !== undefined ? { wantsRoomCount: input.wantsRoomCount } : {}),
        ...(input.contactPermission !== undefined
          ? { contactPermission: input.contactPermission, contactPermissionAt: new Date() }
          : {}),
        ...(input.contactPermissionNote !== undefined
          ? { contactPermissionNote: input.contactPermissionNote }
          : {}),
      })
      .where(eq(schema.persons.id, id))
      .returning({ id: schema.persons.id });
    return row;
  });

  if (!updated) throw new HttpError(404, "Kişi bulunamadı");
  return c.json({ ok: true });
});

/** Y-54: görüşme notları (aday CRM'i). */
peopleRoutes.get("/:id/notes", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const result = await withTenant(session.tenantId, async (tx) =>
    tx.execute(sql`
      select n.id, n.body, n.created_at, coalesce(u.full_name, '—') as author
        from person_note n
        left join app_user u on u.id = n.created_by_user_id
       where n.person_id = ${id}::uuid
       order by n.created_at desc
       limit 100
    `),
  );

  const rows = (
    result as unknown as { rows: Array<{ id: string; body: string; created_at: string; author: string }> }
  ).rows;
  return c.json({ items: rows.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.created_at })) });
});

peopleRoutes.post("/:id/notes", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const parsed = z
    .object({ body: z.string().min(1).max(2000) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Not metni gerekli");

  const [created] = await withTenant(session.tenantId, async (tx) =>
    tx
      .insert(schema.personNotes)
      .values({
        tenantId: session.tenantId,
        personId: id,
        body: parsed.data.body.trim(),
        createdByUserId: session.userId,
      })
      .returning({ id: schema.personNotes.id }),
  );

  return c.json({ id: created!.id }, 201);
});

/**
 * Mükerrer birleştirme.
 * Kaybeden kişi SİLİNMEZ: merged_into_id ile kazanana bağlanır, listelerde
 * görünmez, belgeleri ve geçmişi durur. Taşınan bağlar: mülk sahipliği,
 * hisse, sözleşme (kiracı), belgeler.
 */
peopleRoutes.post("/:id/merge", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const loserId = c.req.param("id");

  const parsed = z.object({ intoId: z.uuid() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "intoId gerekli");
  const winnerId = parsed.data.intoId;
  if (loserId === winnerId) throw new HttpError(400, "Bir kişi kendisiyle birleştirilemez");

  const moved = await withTenant(session.tenantId, async (tx) => {
    const [loser] = await tx
      .select({ id: schema.persons.id, mergedIntoId: schema.persons.mergedIntoId })
      .from(schema.persons)
      .where(eq(schema.persons.id, loserId))
      .limit(1);
    const [winner] = await tx
      .select({ id: schema.persons.id, mergedIntoId: schema.persons.mergedIntoId })
      .from(schema.persons)
      .where(eq(schema.persons.id, winnerId))
      .limit(1);

    if (!loser || !winner) throw new HttpError(404, "Kişilerden biri bulunamadı");
    if (loser.mergedIntoId) throw new HttpError(400, "Bu kişi zaten birleştirilmiş");
    if (winner.mergedIntoId) throw new HttpError(400, "Hedef kişi birleştirilmiş bir kayıt");

    const counts = await moveRelations(tx, loserId, winnerId);

    await tx
      .update(schema.persons)
      .set({ mergedIntoId: winnerId })
      .where(eq(schema.persons.id, loserId));

    return counts;
  });

  return c.json({ ok: true, moved });
});

async function moveRelations(tx: Tx, from: string, to: string) {
  const properties = await tx
    .update(schema.properties)
    .set({ ownerPersonId: to })
    .where(eq(schema.properties.ownerPersonId, from))
    .returning({ id: schema.properties.id });

  // Hisseli malik bağı: çakışan kaydı sil, kalanı taşı
  await tx.execute(sql`
    delete from property_owner po
     where po.person_id = ${from}::uuid
       and exists (select 1 from property_owner x
                    where x.property_id = po.property_id and x.person_id = ${to}::uuid)
  `);
  const owners = await tx
    .update(schema.propertyOwners)
    .set({ personId: to })
    .where(eq(schema.propertyOwners.personId, from))
    .returning({ id: schema.propertyOwners.id });

  const contracts = await tx
    .update(schema.contracts)
    .set({ tenantPersonId: to })
    .where(eq(schema.contracts.tenantPersonId, from))
    .returning({ id: schema.contracts.id });

  const documents = await tx
    .update(schema.documents)
    .set({ personId: to })
    .where(eq(schema.documents.personId, from))
    .returning({ id: schema.documents.id });

  return {
    properties: properties.length,
    propertyOwners: owners.length,
    contracts: contracts.length,
    documents: documents.length,
  };
}
