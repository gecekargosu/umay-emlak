/**
 * Dosyadan içe aktarma (Excel/CSV).
 *
 * Aysan'ın kayıtları dağınık: bir kısmı Excel, bir kısmı telefon notu.
 * Akış: dosya → sütun eşleme → satır satır karar (yeni / birleş / hatalı)
 * → kuru çalıştırma (dryRun) → onay → yaz.
 *
 * İdempotent: aynı dosya iki kez aktarılırsa mükerrer açılmaz (import_key).
 * Kural: tek hatalı satır tüm dosyayı reddettirmez; satır raporlanır, kalanı geçer.
 */
import { Hono } from "hono";
import { isNull, sql } from "drizzle-orm";
import { schema, sha256Hex, withTenant } from "@umay/db";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";
import {
  guessDealKind,
  guessPersonKind,
  mapColumns,
  normalizeKey,
  parseMoneyToKurus,
  parsePhoneDigits,
  parseTable,
  type Field,
  type Table,
} from "../import/parse.js";

export const importRoutes = new Hono();

const MAX_BYTES = 8 * 1024 * 1024;

type RowPlan =
  | { kind: "error"; row: number; reason: string }
  | {
      kind: "ok";
      row: number;
      person: {
        mode: "create" | "merge";
        personId?: string;
        fullName: string;
        kind: "owner" | "tenant" | "candidate";
        phone: string | null;
        phoneDigits: string | null;
        importKey: string;
      };
      property?: {
        title: string;
        city: string | null;
        district: string | null;
        address: string | null;
        roomCount: string | null;
        grossM2: number | null;
        unitNo: string | null;
        deedRef: string | null;
        importKey: string;
        priceKurus: number | null;
        deal: "sale" | "rent";
      };
    };

importRoutes.post("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const dryRun = c.req.query("dryRun") === "1";

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    throw new HttpError(400, "Dosya gerekli (form alanı: file)");
  }
  if (file.size === 0) throw new HttpError(400, "Dosya boş");
  if (file.size > MAX_BYTES) throw new HttpError(400, "Dosya 8 MB'dan büyük");

  const table: Table = await parseTable(Buffer.from(await file.arrayBuffer()), file.name);
  if (table.rows.length === 0) throw new HttpError(400, "Dosyada veri satırı yok");

  const mapping = mapColumns(table.headers);
  if (mapping.fullName === undefined) {
    throw new HttpError(
      400,
      `"Ad Soyad" sütunu bulunamadı. Dosyadaki başlıklar: ${table.headers.join(" | ") || "(boş)"}`,
    );
  }

  const cell = (row: string[], field: Field): string => {
    const index = mapping[field];
    if (index === undefined) return "";
    return (row[index] ?? "").trim();
  };

  const result = await withTenant(session.tenantId, async (tx) => {
    const existing = await tx
      .select({
        id: schema.persons.id,
        fullName: schema.persons.fullName,
        phoneDigits: schema.persons.phoneDigits,
      })
      .from(schema.persons)
      .where(isNull(schema.persons.mergedIntoId))
      .limit(5000);

    const byPhone = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of existing) {
      if (p.phoneDigits) byPhone.set(p.phoneDigits, p.id);
      byName.set(normalizeKey(p.fullName), p.id);
    }

    // ---------------------------------------------------------- 1) PLANLAMA
    const plans: RowPlan[] = [];

    table.rows.forEach((row, index) => {
      const rowNo = index + 2; // başlık 1. satır
      const fullName = cell(row, "fullName");
      if (!fullName) {
        plans.push({ kind: "error", row: rowNo, reason: "Ad soyad boş" });
        return;
      }

      const rawPhone = cell(row, "phone");
      const digits = parsePhoneDigits(rawPhone);
      const nameKey = normalizeKey(fullName);
      const knownId = (digits ? byPhone.get(digits) : undefined) ?? byName.get(nameKey);

      // Aynı dosya içindeki tekrarlar PLAN aşamasında yakalanır; yoksa önizleme
      // "3 yeni kişi" der, gerçekte 2 kişi oluşur.
      if (!knownId) {
        const placeholder = `plan-${rowNo}`;
        if (digits) byPhone.set(digits, placeholder);
        byName.set(nameKey, placeholder);
      }

      const plan: RowPlan = {
        kind: "ok",
        row: rowNo,
        person: {
          mode: knownId ? "merge" : "create",
          ...(knownId && !knownId.startsWith("plan-") ? { personId: knownId } : {}),
          fullName,
          kind: guessPersonKind(cell(row, "kind")),
          phone: rawPhone || null,
          phoneDigits: digits,
          importKey: sha256Hex(`person|${nameKey}|${digits ?? ""}`).slice(0, 40),
        },
      };

      const title = cell(row, "propertyTitle");
      if (title) {
        const m2 = Number(cell(row, "grossM2").replace(/[^\d]/g, ""));
        plan.property = {
          title,
          city: cell(row, "city") || null,
          district: cell(row, "district") || null,
          address: cell(row, "address") || null,
          roomCount: cell(row, "roomCount") || null,
          grossM2: Number.isFinite(m2) && m2 > 0 ? m2 : null,
          unitNo: cell(row, "unitNo") || null,
          deedRef: cell(row, "deedRef") || null,
          importKey: sha256Hex(`property|${nameKey}|${normalizeKey(title)}`).slice(0, 40),
          priceKurus: parseMoneyToKurus(cell(row, "price")),
          deal: guessDealKind(cell(row, "deal")),
        };
      }

      plans.push(plan);
    });

    // ---------------------------------------------------------- 2) UYGULAMA
    const counts = {
      totalRows: table.rows.length,
      personsCreated: 0,
      personsMerged: 0,
      personsSkipped: 0,
      propertiesCreated: 0,
      listingsCreated: 0,
      errors: [] as Array<{ row: number; reason: string }>,
    };

    const resolvePersonId = (person: Extract<RowPlan, { kind: "ok" }>["person"]): string | undefined =>
      person.personId ??
      (person.phoneDigits ? byPhone.get(person.phoneDigits) : undefined) ??
      byName.get(normalizeKey(person.fullName));

    for (const plan of plans) {
      if (plan.kind === "error") {
        counts.errors.push({ row: plan.row, reason: plan.reason });
        continue;
      }

      if (plan.person.mode === "merge") {
        counts.personsMerged += 1;
        if (!dryRun) {
          const targetId = resolvePersonId(plan.person);
          if (
            targetId &&
            !targetId.startsWith("plan-") &&
            (plan.person.phone || plan.person.phoneDigits)
          ) {
            // Eksik alanları tamamla; dolu alanı ezme
            await tx.execute(sql`
              update person
                 set phone = coalesce(phone, ${plan.person.phone}),
                     phone_digits = coalesce(phone_digits, ${plan.person.phoneDigits})
               where id = ${targetId}::uuid
            `);
          }
        }
      } else {
        counts.personsCreated += 1;
        if (!dryRun) {
          const inserted = await tx
            .insert(schema.persons)
            .values({
              tenantId: session.tenantId,
              kind: plan.person.kind,
              fullName: plan.person.fullName,
              phone: plan.person.phone,
              phoneDigits: plan.person.phoneDigits,
              importKey: plan.person.importKey,
              source: `import:${file.name}`,
            })
            .onConflictDoNothing()
            .returning({ id: schema.persons.id });

          if (!inserted[0]) {
            counts.personsCreated -= 1;
            counts.personsSkipped += 1;
            continue;
          }
          if (plan.person.phoneDigits) byPhone.set(plan.person.phoneDigits, inserted[0].id);
          byName.set(normalizeKey(plan.person.fullName), inserted[0].id);
        }
      }

      if (!plan.property) continue;

      const ownerId = resolvePersonId(plan.person);
      if (!ownerId) continue;

      counts.propertiesCreated += 1;
      if (dryRun) {
        if (plan.property.priceKurus) counts.listingsCreated += 1;
        continue;
      }

      const [property] = await tx
        .insert(schema.properties)
        .values({
          tenantId: session.tenantId,
          ownerPersonId: ownerId.startsWith("plan-") ? null : ownerId,
          title: plan.property.title,
          city: plan.property.city,
          district: plan.property.district,
          address: plan.property.address,
          roomCount: plan.property.roomCount,
          grossM2: plan.property.grossM2,
          unitNo: plan.property.unitNo,
          deedRef: plan.property.deedRef,
          importKey: plan.property.importKey,
        })
        .onConflictDoNothing()
        .returning({ id: schema.properties.id });

      if (!property) {
        counts.propertiesCreated -= 1;
        continue;
      }

      if (!ownerId.startsWith("plan-")) {
        await tx
          .insert(schema.propertyOwners)
          .values({ tenantId: session.tenantId, propertyId: property.id, personId: ownerId })
          .onConflictDoNothing();
      }

      if (plan.property.priceKurus) {
        await tx.insert(schema.listings).values({
          tenantId: session.tenantId,
          propertyId: property.id,
          kind: plan.property.deal,
          status: "active",
          priceKurus: plan.property.priceKurus,
          responsibleUserId: session.userId,
        });
        counts.listingsCreated += 1;
      }
    }

    if (!dryRun) {
      await tx.insert(schema.importBatches).values({
        tenantId: session.tenantId,
        filename: file.name,
        dryRun: false,
        totalRows: counts.totalRows,
        personsCreated: counts.personsCreated,
        personsMerged: counts.personsMerged,
        personsSkipped: counts.personsSkipped,
        propertiesCreated: counts.propertiesCreated,
        listingsCreated: counts.listingsCreated,
        errors: counts.errors,
        createdBy: session.userId,
      });
    }

    return counts;
  });

  return c.json({ dryRun, filename: file.name, mapping, ...result });
});

/** Geçmiş aktarımlar — denetim izi. */
importRoutes.get("/batches", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select()
      .from(schema.importBatches)
      .orderBy(schema.importBatches.createdAt)
      .limit(50),
  );

  return c.json({ count: rows.length, items: rows });
});
