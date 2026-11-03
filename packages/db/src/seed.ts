/**
 * Tohum verisi — SADECE GELİŞTİRME.
 * İki ayrı ofis + giriş yapılabilir demo hesapları.
 * Gerçek müşteri verisi buraya girmez (00 kırmızı çizgi 5).
 * Tekrar çalıştırılabilir: slug/e-posta üzerinden atlar, şifreyi tazeler.
 */
import { Client } from "pg";
import { withTenant, closePool } from "./client.js";
import { hashPassword } from "./auth.js";
import { memberships, persons, properties, listings, contracts, charges } from "./schema.js";
import { loadEnv, requireEnv } from "./env.js";

loadEnv();

/** Demo şifresi — yalnız geliştirme. Üretimde asla kullanılmaz. */
export const DEMO_PASSWORD = "Umay!2026";

type TenantSeed = { slug: string; name: string; people: [string, string][]; rent: number };

const TENANTS: TenantSeed[] = [
  {
    slug: "umay-emlak",
    name: "Umay Emlak (pilot)",
    people: [
      ["Aysan Kılıç", "owner"],
      ["Mehmet Kaya", "partner"],
      ["Elif Demir", "agent"],
    ],
    rent: 1_850_000,
  },
  {
    slug: "test-ofis-b",
    name: "Test Ofis B",
    people: [["B Ofis Sahibi", "owner"]],
    rent: 1_200_000,
  },
];

async function main(): Promise<void> {
  const client = new Client({ connectionString: requireEnv("MIGRATE_DATABASE_URL") });
  await client.connect();
  const passwordHash = hashPassword(DEMO_PASSWORD);

  try {
    for (const t of TENANTS) {
      const existing = await client.query<{ id: string }>("select id from tenant where slug = $1", [
        t.slug,
      ]);
      let tenantId = existing.rows[0]?.id;
      if (!tenantId) {
        const created = await client.query<{ id: string }>(
          "insert into tenant (name, slug, settings) values ($1, $2, $3) returning id",
          [
            t.name,
            t.slug,
            JSON.stringify({
              maskTenantInfoForOwners: false,
              overdueReminderDays: 3,
              overdueFormalNoticeDays: 15,
            }),
          ],
        );
        tenantId = created.rows[0]!.id;
        console.log(`ofis eklendi: ${t.name}`);
      } else {
        console.log(`ofis zaten var: ${t.name}`);
      }

      for (const [fullName, role] of t.people) {
        const email = `${slugify(fullName)}@${t.slug}.local`;
        const user = await client.query<{ id: string }>(
          `insert into app_user (email, full_name, password_hash, must_change_password)
             values ($1, $2, $3, false)
             on conflict (email) do update
               set full_name = excluded.full_name,
                   password_hash = excluded.password_hash,
                   must_change_password = false
             returning id`,
          [email, fullName, passwordHash],
        );
        const userId = user.rows[0]!.id;
        const canApprove = role === "owner" || role === "partner";

        await withTenant(tenantId, async (tx) => {
          await tx
            .insert(memberships)
            .values({ tenantId, userId, role: role as never, canApprove })
            .onConflictDoNothing();
        });
        console.log(`  kullanıcı: ${email} (${role})`);
      }

      // Demo portföy (yalnız ilk kurulumda)
      await withTenant(tenantId, async (tx) => {
        const count = await tx.select({ id: persons.id }).from(persons).limit(1);
        if (count.length > 0) return;

        const [owner] = await tx
          .insert(persons)
          .values({
            tenantId,
            kind: "owner",
            fullName: `${t.name} Mal Sahibi`,
            phone: "0555 000 00 00",
          })
          .returning({ id: persons.id });

        const [tenantPerson] = await tx
          .insert(persons)
          .values({ tenantId, kind: "tenant", fullName: "Demo Kiracı", phone: "0555 111 11 11" })
          .returning({ id: persons.id });

        const [property] = await tx
          .insert(properties)
          .values({
            tenantId,
            ownerPersonId: owner!.id,
            type: "apartment",
            title: "Demo Daire 3+1",
            city: "İstanbul",
            district: "Kadıköy",
            grossM2: 120,
          })
          .returning({ id: properties.id });

        const [listing] = await tx
          .insert(listings)
          .values({
            tenantId,
            propertyId: property!.id,
            kind: "rent",
            status: "active",
            priceKurus: t.rent,
          })
          .returning({ id: listings.id });

        const [contract] = await tx
          .insert(contracts)
          .values({
            tenantId,
            listingId: listing!.id,
            tenantPersonId: tenantPerson!.id,
            startDate: "2026-01-01",
            rentKurus: t.rent,
            depositKurus: t.rent * 2, // K-23: 2 kira depozito (elle değişebilir)
            depositRentCount: 2,
            dueDay: 5,
            utilityPayer: "tenant",
          })
          .returning({ id: contracts.id });

        await tx.insert(charges).values({
          tenantId,
          contractId: contract!.id,
          period: "2026-11-01",
          kind: "rent",
          amountKurus: t.rent,
          dueDate: "2026-11-05",
          status: "open",
        });
      });
    }

    console.log(`\n tohum verisi hazır. demo şifre: ${DEMO_PASSWORD}`);
  } finally {
    await client.end();
    await closePool();
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

main().catch((error) => {
  console.error("tohum verisi başarısız:", error);
  process.exit(1);
});
