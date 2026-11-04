/**
 * Belge → kişi/mülk eşleştirmesi (K-18, K-32, TUR:24).
 *
 * `routes/documents.ts` 700 satırı geçtiği için ayrıldı (K-1/K-2/K-3, TUR:49).
 * Davranış aynı: öneri üretimi + net örtüşmede otomatik bağ + belirsizde insan onayı.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@umay/db";
import type { DocumentKind } from "@umay/shared";
import { scoreDocument, tokensOf, type MatchTarget } from "../documents/match.js";

/**
 * Öneri üretimi. Yalnızca bağı olmayan belgeler için çalışır.
 * Aynı belge için tekrar üretilirse mevcut öneri korunur (unique index).
 */
export async function generateSuggestions(
  tenantId: string,
  documentId: string,
  filename: string,
  kind: DocumentKind,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const people = await tx
      .select({ id: schema.persons.id, fullName: schema.persons.fullName })
      .from(schema.persons)
      .limit(500);
    const props = await tx
      .select({
        id: schema.properties.id,
        title: schema.properties.title,
        unitNo: schema.properties.unitNo,
        block: schema.properties.block,
      })
      .from(schema.properties)
      .limit(500);

    const targets: MatchTarget[] = [
      ...people.map((p) => ({
        type: "person" as const,
        id: p.id,
        label: p.fullName,
      })),
      ...props.map((p) => ({
        type: "property" as const,
        id: p.id,
        label: p.title,
        extras: [p.block, p.unitNo].filter((v): v is string => Boolean(v)),
      })),
    ];

    const suggestions = scoreDocument(filename, kind, targets);
    if (suggestions.length === 0) return 0;

    await tx
      .insert(schema.documentSuggestions)
      .values(
        suggestions.map((s) => ({
          tenantId,
          documentId,
          targetType: s.targetType,
          targetId: s.targetId,
          score: s.score,
          reasons: s.reasons,
        })),
      )
      .onConflictDoNothing();

    return suggestions.length;
  });
}

/**
 * TUR:24 — kullanıcı isteği: "eşleşme varsa eşleşmeli, yoksa o isme giriş kayıt yapılmalı".
 *
 * Eskiden sistem yalnız öneri üretiyor, bağ için yetkili onayı bekliyordu. Artık:
 *  · Dosya adı bir kişi/mülkle NET örtüşüyorsa (puan >= 70) bağ kendiliğinden kurulur
 *    ve öneri "onaylandı" işaretlenir (kim kurdu: yükleyen kullanıcı).
 *  · Örtüşme yoksa dosya adından kişi kaydı açılır (aynı ad varsa o kişi kullanılır).
 *  · Belirsiz örtüşme (45-69) yine insan onayına kalır (K-32 korunur).
 */
const AUTO_LINK_SCORE = 70;

export async function autoLinkOrCreate(
  session: { tenantId: string; userId: string },
  documentId: string,
  filename: string,
  kind: DocumentKind,
): Promise<{
  linkedTo: string | null;
  linkedScore: number | null;
  createdPerson: string | null;
  suggestionCount: number;
}> {
  await generateSuggestions(session.tenantId, documentId, filename, kind);

  return withTenant(session.tenantId, async (tx) => {
    const [top] = await tx
      .select({
        id: schema.documentSuggestions.id,
        targetType: schema.documentSuggestions.targetType,
        targetId: schema.documentSuggestions.targetId,
        score: schema.documentSuggestions.score,
      })
      .from(schema.documentSuggestions)
      .where(
        and(
          eq(schema.documentSuggestions.documentId, documentId),
          eq(schema.documentSuggestions.status, "pending"),
        ),
      )
      .orderBy(desc(schema.documentSuggestions.score))
      .limit(1);

    if (top && top.score >= AUTO_LINK_SCORE) {
      const patch =
        top.targetType === "person"
          ? { personId: top.targetId }
          : top.targetType === "property"
            ? { propertyId: top.targetId }
            : { listingId: top.targetId };

      await tx.update(schema.documents).set(patch).where(eq(schema.documents.id, documentId));
      await tx
        .update(schema.documentSuggestions)
        .set({ status: "approved", decidedByUserId: session.userId, decidedAt: new Date() })
        .where(eq(schema.documentSuggestions.id, top.id));

      let label = "ilan";
      if (top.targetType === "person") {
        const [person] = await tx
          .select({ fullName: schema.persons.fullName })
          .from(schema.persons)
          .where(eq(schema.persons.id, top.targetId))
          .limit(1);
        label = person?.fullName ?? "(kişi)";
      } else if (top.targetType === "property") {
        const [property] = await tx
          .select({ title: schema.properties.title })
          .from(schema.properties)
          .where(eq(schema.properties.id, top.targetId))
          .limit(1);
        label = property?.title ?? "(mülk)";
      }

      const pending = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.documentSuggestions)
        .where(
          and(
            eq(schema.documentSuggestions.documentId, documentId),
            eq(schema.documentSuggestions.status, "pending"),
          ),
        );

      return {
        linkedTo: label,
        linkedScore: top.score,
        createdPerson: null,
        suggestionCount: Number(pending[0]?.count ?? 0),
      };
    }

    // Belirsiz örtüşme (45-69 puan): kullanıcıya "olabilir" demek insan kararıdır. Bu durumda
    // yeni kişi açmak yanlış olur (aynı kişi iki kayıt olur); bağ onaya kalır.
    if (top) {
      const pendingUnclear = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.documentSuggestions)
        .where(
          and(
            eq(schema.documentSuggestions.documentId, documentId),
            eq(schema.documentSuggestions.status, "pending"),
          ),
        );
      return {
        linkedTo: null,
        linkedScore: null,
        createdPerson: null,
        suggestionCount: Number(pendingUnclear[0]?.count ?? 0),
      };
    }

    // Eşleşme yok: dosya adını kişi adı kabul et ("Ayşe_Yıldız_tapu.pdf" → "Ayşe Yıldız tapu")
    const name = filename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_.\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    // "tapu.pdf", "kimlik.pdf" gibi yalnız tür adı taşıyan dosyadan kişi uydurulmaz.
    if (name.length < 3 || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(name) || tokensOf(name).length === 0) {
      const pendingAll = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.documentSuggestions)
        .where(
          and(
            eq(schema.documentSuggestions.documentId, documentId),
            eq(schema.documentSuggestions.status, "pending"),
          ),
        );
      return {
        linkedTo: null,
        linkedScore: null,
        createdPerson: null,
        suggestionCount: Number(pendingAll[0]?.count ?? 0),
      };
    }

    const [existing] = await tx
      .select({ id: schema.persons.id, fullName: schema.persons.fullName })
      .from(schema.persons)
      .where(sql`lower(${schema.persons.fullName}) = lower(${name})`)
      .limit(1);

    let personId = existing?.id;
    if (!personId) {
      const [createdPerson] = await tx
        .insert(schema.persons)
        .values({
          tenantId: session.tenantId,
          kind: "candidate",
          fullName: name,
          source: "document",
          notes: "Belgeden otomatik oluşturuldu: dosya adıyla eşleşen kişi yoktu.",
        })
        .returning({ id: schema.persons.id });
      personId = createdPerson!.id;
    }

    await tx.update(schema.documents).set({ personId }).where(eq(schema.documents.id, documentId));

    const pendingAfter = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.documentSuggestions)
      .where(
        and(
          eq(schema.documentSuggestions.documentId, documentId),
          eq(schema.documentSuggestions.status, "pending"),
        ),
      );

    return {
      linkedTo: existing?.fullName ?? name,
      linkedScore: null,
      createdPerson: existing ? null : name,
      suggestionCount: Number(pendingAfter[0]?.count ?? 0),
    };
  });
}
