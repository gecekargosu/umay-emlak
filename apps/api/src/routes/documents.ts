/**
 * Belge uçları — K-18 (sha256 içerik adresi) ve K-32 (tür matrisi + onaylı eşleştirme).
 *
 * Akış: dosya → özet → depo → meta kaydı → (bağ yoksa) eşleştirme ÖNERİSİ.
 * Öneri hiçbir şeyi bağlamaz; bağ onaylandığında kurulur ve onaylayan saklanır.
 */
import { Hono } from "hono";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@umay/db";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_TR,
  missingRequirements,
  requiredForPerson,
  requiredForListing,
  type DocumentKind,
} from "@umay/shared";
import { HttpError, requireApproval, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";
import {
  MAX_DOCUMENT_BYTES,
  getObject,
  putObject,
  resolveMimeType,
  sha256Of,
} from "../storage.js";
import { autoLinkOrCreate, generateSuggestions } from "../documents/link.js";

export const documentRoutes = new Hono();

const kindSchema = z.enum(DOCUMENT_KINDS);

function optionalUuid(form: FormData, field: string): string | null {
  const raw = String(form.get(field) ?? "").trim();
  if (!raw) return null;
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new HttpError(400, `${field} geçersiz kimlik`);
  return parsed.data;
}


/** Yükleme — multipart: file, kind, title?, personId?, propertyId?, listingId? */
documentRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "belge yükleme");

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    throw new HttpError(400, "Dosya gerekli (form alanı: file)");
  }
  if (file.size === 0) throw new HttpError(400, "Dosya boş");
  if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(400, "Dosya 25 MB'dan büyük");

  const mimeType = resolveMimeType(file.name, file.type);
  if (!mimeType) {
    throw new HttpError(400, "Bu dosya türü desteklenmiyor (PDF, JPG, PNG, WEBP, DOC/DOCX, TXT)");
  }

  const parsedKind = kindSchema.safeParse(String(form.get("kind") ?? "diger"));
  if (!parsedKind.success) throw new HttpError(400, "Belge türü geçersiz");
  const kind = parsedKind.data;

  const personId = optionalUuid(form, "personId");
  const propertyId = optionalUuid(form, "propertyId");
  const listingId = optionalUuid(form, "listingId");
  const title = String(form.get("title") ?? "").trim() || null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256Of(bytes);
  await putObject(hash, bytes);

  const saved = await withTenant(session.tenantId, async (tx) => {
    const inserted = await tx
      .insert(schema.documents)
      .values({
        tenantId: session.tenantId,
        kind,
        sha256: hash,
        filename: file.name.slice(0, 240),
        mimeType,
        sizeBytes: bytes.length,
        personId,
        propertyId,
        listingId,
        uploadedByUserId: session.userId,
        title,
      })
      .onConflictDoNothing()
      .returning({ id: schema.documents.id });

    if (inserted[0]) return { id: inserted[0].id, duplicate: false };

    // İçerik zaten var: aynı dosyayı ikinci kez saklamıyoruz (K-18)
    const [existing] = await tx
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.tenantId, session.tenantId),
          eq(schema.documents.sha256, hash),
        ),
      )
      .limit(1);

    if (!existing) throw new HttpError(409, "Belge kaydedilemedi, tekrar deneyin");
    return { id: existing.id, duplicate: true };
  });

  const unlinked = !personId && !propertyId && !listingId;
  const auto =
    unlinked && !saved.duplicate
      ? await autoLinkOrCreate(session, saved.id, file.name, kind)
      : null;

  return c.json(
    {
      id: saved.id,
      duplicate: saved.duplicate,
      suggestions: auto?.suggestionCount ?? 0,
      linkedTo: auto?.linkedTo ?? null,
      linkedScore: auto?.linkedScore ?? null,
      createdPerson: auto?.createdPerson ?? null,
      message: saved.duplicate
        ? "Bu dosya arşivde zaten vardı; ikinci kopya oluşturulmadı."
        : undefined,
    },
    201,
  );
});

/** Raf: belge listesi (+ bağlı kişi/mülk adı, bekleyen öneri sayısı). */
documentRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const kindFilter = kindSchema.safeParse(c.req.query("kind") ?? undefined);
  const q = (c.req.query("q") ?? "").trim();

  const result = await withTenant(session.tenantId, async (tx) => {
    const conditions = [];
    if (kindFilter.success) conditions.push(eq(schema.documents.kind, kindFilter.data));
    if (q) {
      const like = `%${q.toLocaleLowerCase("tr")}%`;
      conditions.push(
        or(
          sql`lower(coalesce(${schema.documents.title}, ${schema.documents.filename})) like ${like}`,
          sql`lower(${schema.documents.filename}) like ${like}`,
        )!,
      );
    }

    const rows = await tx
      .select({
        id: schema.documents.id,
        kind: schema.documents.kind,
        filename: schema.documents.filename,
        title: schema.documents.title,
        mimeType: schema.documents.mimeType,
        sizeBytes: schema.documents.sizeBytes,
        personId: schema.documents.personId,
        propertyId: schema.documents.propertyId,
        listingId: schema.documents.listingId,
        verifiedAt: schema.documents.verifiedAt,
        createdAt: schema.documents.createdAt,
        personName: schema.persons.fullName,
        propertyTitle: schema.properties.title,
      })
      .from(schema.documents)
      .leftJoin(schema.persons, eq(schema.persons.id, schema.documents.personId))
      .leftJoin(schema.properties, eq(schema.properties.id, schema.documents.propertyId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.documents.createdAt))
      .limit(200);

    const pending = await tx
      .select({
        documentId: schema.documentSuggestions.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.documentSuggestions)
      .where(eq(schema.documentSuggestions.status, "pending"))
      .groupBy(schema.documentSuggestions.documentId);

    const pendingByDoc = new Map(pending.map((p) => [p.documentId, Number(p.count)]));

    return rows.map((row) => ({
      ...row,
      kindLabel: DOCUMENT_KIND_TR[row.kind as DocumentKind],
      pendingSuggestions: pendingByDoc.get(row.id) ?? 0,
    }));
  });

  return c.json({ count: result.length, items: result });
});

/** Tür matrisi: bu iş için hangi belgeler şart, hangisi eksik? */
documentRoutes.get("/requirements", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const listingId = c.req.query("listingId");
  const personId = c.req.query("personId");
  if (!listingId && !personId) {
    throw new HttpError(400, "listingId veya personId gerekli");
  }

  const data = await withTenant(session.tenantId, async (tx) => {
    if (listingId) {
      const [listing] = await tx
        .select({
          id: schema.listings.id,
          kind: schema.listings.kind,
          propertyId: schema.listings.propertyId,
        })
        .from(schema.listings)
        .where(eq(schema.listings.id, listingId))
        .limit(1);
      if (!listing) throw new HttpError(404, "İlan bulunamadı");

      const docs = await tx
        .select({ kind: schema.documents.kind })
        .from(schema.documents)
        .where(
          or(
            eq(schema.documents.listingId, listing.id),
            eq(schema.documents.propertyId, listing.propertyId),
          ),
        );

      const requirements = requiredForListing(listing.kind);
      const presentKinds = [...new Set(docs.map((d) => d.kind as DocumentKind))];
      const missing = missingRequirements(requirements, presentKinds);
      return {
        scope: "listing" as const,
        id: listing.id,
        requirements: requirements.map((r) => ({
          ...r,
          met: !missing.some((m) => m.key === r.key),
        })),
        presentKinds,
        missing: missing.map((m) => m.key),
      };
    }

    const [person] = await tx
      .select({ id: schema.persons.id, kind: schema.persons.kind })
      .from(schema.persons)
      .where(eq(schema.persons.id, personId!))
      .limit(1);
    if (!person) throw new HttpError(404, "Kişi bulunamadı");

    const docs = await tx
      .select({ kind: schema.documents.kind })
      .from(schema.documents)
      .where(eq(schema.documents.personId, person.id));

    const requirements = requiredForPerson(person.kind);
    const presentKinds = [...new Set(docs.map((d) => d.kind as DocumentKind))];
    const missing = missingRequirements(requirements, presentKinds);
    return {
      scope: "person" as const,
      id: person.id,
      requirements: requirements.map((r) => ({
        ...r,
        met: !missing.some((m) => m.key === r.key),
      })),
      presentKinds,
      missing: missing.map((m) => m.key),
    };
  });

  return c.json(data);
});

/** Belge türü listesi — arayüz kendi listesini uydurmasın (tek kaynak). */
documentRoutes.get("/kinds", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  return c.json({
    items: DOCUMENT_KINDS.map((kind) => ({ kind, label: DOCUMENT_KIND_TR[kind] })),
  });
});

/**
 * İnceleme kuyruğu — bekleyen TÜM eşleştirme önerileri tek listede (K-93 / Y-110).
 * Belge tek tek açılmadan karar verilebilsin diye belge + hedef adı birlikte döner.
 */
documentRoutes.get("/queue", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const items = await withTenant(session.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.documentSuggestions.id,
        documentId: schema.documentSuggestions.documentId,
        targetType: schema.documentSuggestions.targetType,
        score: schema.documentSuggestions.score,
        reasons: schema.documentSuggestions.reasons,
        createdAt: schema.documentSuggestions.createdAt,
        filename: schema.documents.filename,
        title: schema.documents.title,
        kind: schema.documents.kind,
        personName: schema.persons.fullName,
        propertyTitle: schema.properties.title,
      })
      .from(schema.documentSuggestions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentSuggestions.documentId))
      .leftJoin(schema.persons, eq(schema.persons.id, schema.documentSuggestions.targetId))
      .leftJoin(schema.properties, eq(schema.properties.id, schema.documentSuggestions.targetId))
      .where(eq(schema.documentSuggestions.status, "pending"))
      .orderBy(desc(schema.documentSuggestions.score))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      targetType: row.targetType,
      targetLabel:
        row.targetType === "person"
          ? (row.personName ?? "(kişi)")
          : row.targetType === "property"
            ? (row.propertyTitle ?? "(mülk)")
            : "(ilan)",
      score: row.score,
      reasons: row.reasons,
      createdAt: row.createdAt,
      filename: row.filename,
      title: row.title,
      kindLabel: DOCUMENT_KIND_TR[row.kind as DocumentKind],
    }));
  });

  return c.json({ count: items.length, items });
});

/** Belge detayı + öneriler (hedef adlarıyla). */
documentRoutes.get("/:id", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const detail = await withTenant(session.tenantId, async (tx) => {
    const [doc] = await tx
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!doc) return null;

    const suggestions = await tx
      .select()
      .from(schema.documentSuggestions)
      .where(eq(schema.documentSuggestions.documentId, id))
      .orderBy(desc(schema.documentSuggestions.score))
      .limit(20);

    const people = await tx
      .select({ id: schema.persons.id, fullName: schema.persons.fullName })
      .from(schema.persons)
      .limit(1000);
    const props = await tx
      .select({ id: schema.properties.id, title: schema.properties.title })
      .from(schema.properties)
      .limit(1000);
    const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
    const titleOf = new Map(props.map((p) => [p.id, p.title]));

    return {
      document: { ...doc, kindLabel: DOCUMENT_KIND_TR[doc.kind as DocumentKind] },
      suggestions: suggestions.map((s) => ({
        ...s,
        targetLabel:
          s.targetType === "person"
            ? (nameOf.get(s.targetId) ?? "(kişi)")
            : (titleOf.get(s.targetId) ?? "(mülk)"),
      })),
    };
  });

  if (!detail) throw new HttpError(404, "Belge bulunamadı");
  return c.json(detail);
});

/** Dosyanın kendisi. Yetki: kiracı bağlamı + RLS; çerez zorunlu. */
documentRoutes.get("/:id/file", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const id = c.req.param("id");

  const doc = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        sha256: schema.documents.sha256,
        filename: schema.documents.filename,
        mimeType: schema.documents.mimeType,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    return row;
  });

  if (!doc) throw new HttpError(404, "Belge bulunamadı");
  const bytes = await getObject(doc.sha256);
  if (!bytes) throw new HttpError(404, "Dosya depoda bulunamadı");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "cache-control": "private, no-store",
    },
  });
});

/** Öneriyi yeniden üret (dosya adı değişmediyse aynı sonucu verir). */
documentRoutes.post("/:id/suggest", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "eşleştirme önerisi");

  const id = c.req.param("id");
  const doc = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({ filename: schema.documents.filename, kind: schema.documents.kind })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    return row;
  });
  if (!doc) throw new HttpError(404, "Belge bulunamadı");

  const count = await generateSuggestions(
    session.tenantId,
    id,
    doc.filename,
    doc.kind as DocumentKind,
  );
  return c.json({ ok: true, suggestions: count });
});

/**
 * Öneriyi ONAYLA: bağ kurulur, onaylayan saklanır.
 * Aynı belge için aynı türdeki diğer bekleyen öneriler kapanır (tek bağ kuralı).
 */
documentRoutes.post("/suggestions/:id/approve", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireApproval(session, "belge eşleştirme onayı");

  const suggestionId = c.req.param("id");

  const applied = await withTenant(session.tenantId, async (tx) => {
    const [suggestion] = await tx
      .select()
      .from(schema.documentSuggestions)
      .where(eq(schema.documentSuggestions.id, suggestionId))
      .limit(1);
    if (!suggestion) throw new HttpError(404, "Öneri bulunamadı");
    if (suggestion.status !== "pending") throw new HttpError(409, "Bu öneri zaten karara bağlanmış");

    const patch =
      suggestion.targetType === "person"
        ? { personId: suggestion.targetId }
        : suggestion.targetType === "property"
          ? { propertyId: suggestion.targetId }
          : { listingId: suggestion.targetId };

    await tx
      .update(schema.documents)
      .set(patch)
      .where(eq(schema.documents.id, suggestion.documentId));

    await tx
      .update(schema.documentSuggestions)
      .set({
        status: "approved",
        decidedByUserId: session.userId,
        decidedAt: new Date(),
      })
      .where(eq(schema.documentSuggestions.id, suggestionId));

    await tx
      .update(schema.documentSuggestions)
      .set({
        status: "rejected",
        decidedByUserId: session.userId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(schema.documentSuggestions.documentId, suggestion.documentId),
          eq(schema.documentSuggestions.targetType, suggestion.targetType),
          eq(schema.documentSuggestions.status, "pending"),
        ),
      );

    return { documentId: suggestion.documentId, targetType: suggestion.targetType };
  });

  return c.json({ ok: true, ...applied });
});

documentRoutes.post("/suggestions/:id/reject", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "eşleştirme önerisi reddi");

  const suggestionId = c.req.param("id");

  const rejected = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.documentSuggestions)
      .set({ status: "rejected", decidedByUserId: session.userId, decidedAt: new Date() })
      .where(
        and(
          eq(schema.documentSuggestions.id, suggestionId),
          eq(schema.documentSuggestions.status, "pending"),
        ),
      )
      .returning({ id: schema.documentSuggestions.id });
    return row;
  });

  if (!rejected) throw new HttpError(404, "Bekleyen öneri bulunamadı");
  return c.json({ ok: true });
});
