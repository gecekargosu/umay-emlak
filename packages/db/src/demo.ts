/**
 * DEMO VERİSİ — yalnız geliştirme (00 kırmızı çizgi 5: gerçek müşteri verisi girmez).
 *
 * Kullanıcı isteği (TUR:20): her türde demo gayrimenkul — İzmir'de 40 satılık,
 * 50 kiralık, 30 mal sahibi (bazısında 2, bazısında 8, bazısında 10 mülk).
 * Her kayıt "DEMO " ile başlar; `pnpm demo:clean` hepsini tek seferde siler,
 * böylece gerçek veriye karışmaz.
 *
 *   pnpm demo:seed    → ekle (varsa dokunmaz)
 *   pnpm demo:clean   → yalnız "DEMO " kayıtlarını sil
 */
import { Client } from "pg";
import { loadEnv, requireEnv } from "./env.js";

loadEnv();

const PREFIX = "DEMO ";
const TENANT_SLUG = "umay-emlak";

const DISTRICTS = [
  "Karşıyaka",
  "Bornova",
  "Buca",
  "Gaziemir",
  "Çiğli",
  "Balçova",
  "Narlıdere",
  "Konak",
  "Bayraklı",
  "Karabağlar",
  "Güzelbahçe",
  "Urla",
];

const SITES = [
  "Deniz Sitesi",
  "Güneş Sitesi",
  "Mavi Vadi Sitesi",
  "Zeytin Sitesi",
  "Lale Sitesi",
  "Park Sitesi",
  "Umay Sitesi",
  "Sahil Sitesi",
];

const BUILDINGS = [
  "A Blok",
  "B Blok",
  "C Blok",
  "D Blok",
  "Deniz Apartmanı",
  "Gül Apartmanı",
  "Çınar Apartmanı",
  "Palmiye Apartmanı",
];

const STREETS = [
  "Atatürk Caddesi",
  "Cumhuriyet Bulvarı",
  "İnönü Caddesi",
  "Sahil Yolu",
  "Menekşe Sokak",
  "Zambak Sokak",
  "Mithatpaşa Caddesi",
  "Gazi Bulvarı",
];

const ROOMS = ["1+1", "2+1", "2+1", "3+1", "3+1", "4+1"];

/** Her türde gayrimenkul olsun: daire, dükkan, ofis, müstakil ev, arsa. */
const TYPES: Array<{ type: string; label: string }> = [
  { type: "apartment", label: "Daire" },
  { type: "apartment", label: "Daire" },
  { type: "shop", label: "Dükkan" },
  { type: "office", label: "Ofis" },
  { type: "house", label: "Müstakil Ev" },
  { type: "land", label: "Arsa" },
];

/** 30 mal sahibi / 90 mülk: 7×2 + 5×8 + 2×10 + 16×1 = 90 */
const OWNER_PROPERTY_COUNTS: number[] = [
  ...Array<number>(7).fill(2),
  ...Array<number>(5).fill(8),
  ...Array<number>(2).fill(10),
  ...Array<number>(16).fill(1),
];

const OWNER_COUNT = OWNER_PROPERTY_COUNTS.length; // 30
const TENANT_COUNT = 30;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function phoneFor(base: number, i: number): string {
  return `0532 ${String(base + Math.floor(i / 100)).padStart(3, "0")} ${pad(i % 100)} ${pad((i * 7) % 100)}`;
}

async function clean(client: Client, tenantId: string): Promise<string> {
  const steps: Array<[string, string]> = [
    [
      "tahsilat",
      `delete from payment where charge_id in (
         select ch.id from charge ch
           join contract ct on ct.id = ch.contract_id
           join person p on p.id = ct.tenant_person_id
          where ch.tenant_id = $1 and p.full_name like 'DEMO %')`,
    ],
    [
      "tahakkuk",
      `delete from charge where tenant_id = $1 and contract_id in (
         select ct.id from contract ct
           join person p on p.id = ct.tenant_person_id
          where ct.tenant_id = $1 and p.full_name like 'DEMO %')`,
    ],
    [
      "sözleşme",
      `delete from contract where tenant_id = $1 and tenant_person_id in (
         select id from person where tenant_id = $1 and full_name like 'DEMO %')`,
    ],
    [
      "ilan",
      `delete from listing where tenant_id = $1 and property_id in (
         select id from property where tenant_id = $1 and title like 'DEMO %')`,
    ],
    ["mülk", `delete from property where tenant_id = $1 and title like 'DEMO %'`],
    ["kişi", `delete from person where tenant_id = $1 and full_name like 'DEMO %'`],
  ];

  const parts: string[] = [];
  for (const [label, sql] of steps) {
    const result = await client.query(sql, [tenantId]);
    if (result.rowCount) parts.push(`${label} ${result.rowCount}`);
  }
  return parts.length > 0 ? parts.join(", ") : "silinecek demo kayıt yok";
}

async function seed(
  client: Client,
  tenantId: string,
  responsibleUserId: string | null,
): Promise<string> {
  // --- Mal sahipleri -------------------------------------------------------
  const ownerIds: string[] = [];
  for (let i = 1; i <= OWNER_COUNT; i++) {
    const phone = phoneFor(300, i);
    const { rows } = await client.query<{ id: string }>(
      `insert into person (tenant_id, kind, full_name, phone, phone_digits)
       values ($1, 'owner', $2, $3, $4) returning id`,
      [tenantId, `${PREFIX}Mal Sahibi ${pad(i)}`, phone, phone.replace(/\D/g, "")],
    );
    ownerIds.push(rows[0]!.id);
  }

  // --- Kiracılar (kiralık sözleşmeleri için) -------------------------------
  const tenantIds: string[] = [];
  for (let i = 1; i <= TENANT_COUNT; i++) {
    const phone = phoneFor(500, i);
    const { rows } = await client.query<{ id: string }>(
      `insert into person (tenant_id, kind, full_name, phone, phone_digits)
       values ($1, 'tenant', $2, $3, $4) returning id`,
      [tenantId, `${PREFIX}Kiracı ${pad(i)}`, phone, phone.replace(/\D/g, "")],
    );
    tenantIds.push(rows[0]!.id);
  }

  // --- Mülkler + ilanlar ---------------------------------------------------
  // 90 mülkün 40'ı satılık, 50'si kiralık: i % 9 < 4 → satılık.
  const rentActive: Array<{ listingId: string; rentKurus: number }> = [];
  let idx = 0;
  let sale = 0;
  let rent = 0;
  const statusCounts: Record<string, number> = {};

  for (let ownerIndex = 0; ownerIndex < OWNER_COUNT; ownerIndex++) {
    const count = OWNER_PROPERTY_COUNTS[ownerIndex]!;
    for (let k = 0; k < count; k++) {
      const type = TYPES[idx % TYPES.length]!;
      const district = DISTRICTS[idx % DISTRICTS.length]!;
      const street = STREETS[idx % STREETS.length]!;
      const siteName = type.type === "apartment" ? `${PREFIX}${SITES[idx % SITES.length]!}` : null;
      const buildingName =
        type.type === "apartment"
          ? `${PREFIX}${BUILDINGS[idx % BUILDINGS.length]!}`
          : type.type === "shop" || type.type === "office"
            ? `${PREFIX}İş Hanı`
            : null;
      const unitNo =
        type.type === "apartment" || type.type === "shop" || type.type === "office"
          ? String((idx % 24) + 1)
          : null;
      const block = type.type === "apartment" ? BUILDINGS[idx % 4]!.charAt(0) : null;
      const roomCount = type.type === "land" ? null : ROOMS[idx % ROOMS.length]!;
      const grossM2 = 55 + ((idx * 7) % 170);
      const title = `${PREFIX}${type.label} ${idx + 1} · ${district}`;
      const address = `${PREFIX}${street} No:${((idx * 3) % 90) + 1}, ${district}/İzmir`;

      const { rows: propRows } = await client.query<{ id: string }>(
        `insert into property
           (tenant_id, owner_person_id, type, title, city, district, address, gross_m2,
            block, unit_no, floor, room_count, site_name, building_name, deed_ref)
         values ($1, $2, $3, $4, 'İzmir', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning id`,
        [
          tenantId,
          ownerIds[ownerIndex]!,
          type.type,
          title,
          district,
          address,
          grossM2,
          block,
          unitNo,
          idx % 8,
          roomCount,
          siteName,
          buildingName,
          `${PREFIX}TAPU-${String(idx + 1).padStart(4, "0")}`,
        ],
      );
      const propertyId = propRows[0]!.id;

      const kind = idx % 9 < 4 ? "sale" : "rent";
      const status = idx % 13 === 0 ? "draft" : idx % 17 === 0 ? "reserved" : idx % 29 === 0 ? "closed" : "active";
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;

      const priceKurus =
        kind === "sale" ? (1_750_000 + (idx % 40) * 210_000) * 100 : (11_500 + (idx % 30) * 900) * 100;

      const { rows: listingRows } = await client.query<{ id: string }>(
        `insert into listing
           (tenant_id, property_id, kind, status, price_kurus, authority_no,
            responsible_user_id, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          tenantId,
          propertyId,
          kind,
          status,
          priceKurus,
          `${PREFIX}YETKİ-${String(idx + 1).padStart(4, "0")}`,
          responsibleUserId,
          status === "draft" ? null : new Date(),
        ],
      );

      if (kind === "sale") sale++;
      else rent++;

      if (kind === "rent" && status === "active" && rentActive.length < tenantIds.length) {
        rentActive.push({ listingId: listingRows[0]!.id, rentKurus: priceKurus });
      }

      idx++;
    }
  }

  // --- Kiralık sözleşmeleri (kiracı adı araması için) ----------------------
  for (let i = 0; i < rentActive.length; i++) {
    const entry = rentActive[i]!;
    await client.query(
      `insert into contract
         (tenant_id, listing_id, tenant_person_id, start_date, rent_kurus,
          deposit_kurus, deposit_rent_count, due_day, utility_payer)
       values ($1, $2, $3, $4, $5, $6, 2, $7, 'tenant')`,
      [
        tenantId,
        entry.listingId,
        tenantIds[i]!,
        `2025-${pad((i % 12) + 1)}-01`,
        entry.rentKurus,
        entry.rentKurus * 2,
        (i % 5) + 1,
      ],
    );
  }

  const statusText = Object.entries(statusCounts)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

  return [
    `${PREFIX}kayıtlar eklendi`,
    `mal sahibi ${ownerIds.length}`,
    `mülk ${idx} (satılık ${sale} / kiralık ${rent})`,
    `kiracı ${tenantIds.length} (sözleşmeli ${rentActive.length})`,
    `durum: ${statusText}`,
  ].join(" | ");
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "seed";
  const client = new Client({ connectionString: requireEnv("MIGRATE_DATABASE_URL") });
  await client.connect();

  try {
    const tenant = await client.query<{ id: string }>("select id from tenant where slug = $1", [
      TENANT_SLUG,
    ]);
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error(`ofis bulunamadı: ${TENANT_SLUG} (önce: pnpm db:seed)`);

    if (mode === "clean") {
      console.log(`DEMO temizlik → ${await clean(client, tenantId)}`);
      return;
    }

    const existing = await client.query<{ n: string }>(
      "select count(*)::text as n from person where tenant_id = $1 and full_name like 'DEMO %'",
      [tenantId],
    );
    if (Number(existing.rows[0]!.n) > 0) {
      console.log("DEMO verisi zaten var. Yeniden kurmak için: pnpm demo:clean && pnpm demo:seed");
      return;
    }

    const user = await client.query<{ id: string }>(
      `select u.id from app_user u
         join membership m on m.user_id = u.id
        where m.tenant_id = $1 and m.status = 'active'
        order by m.can_approve desc, m.created_at
        limit 1`,
      [tenantId],
    );

    console.log(await seed(client, tenantId, user.rows[0]?.id ?? null));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("demo verisi başarısız:", error);
  process.exit(1);
});
