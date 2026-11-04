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
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { loadEnv, requireEnv } from "./env.js";
import {
  fallbackScene,
  fetchPhoto,
  kimlikPdf,
  sozlesmePdf,
  tapuPdf,
  yetkiPdf,
  type DemoAsset,
} from "./demo-media.js";

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

/** Demo kişileri gerçek isim taşır (başında DEMO var) — alfabetik raf anlamlı olsun. */
const FIRST_NAMES = [
  "Ayşe",
  "Mehmet",
  "Zeynep",
  "Ali",
  "Fatma",
  "Mustafa",
  "Elif",
  "Hasan",
  "Emine",
  "Hüseyin",
  "Merve",
  "Ahmet",
  "Selin",
  "Burak",
  "Deniz",
  "Cem",
  "Gizem",
  "Onur",
  "Pınar",
  "Serkan",
  "Yasemin",
  "Kemal",
  "Ebru",
  "Tolga",
  "Nazlı",
  "Barış",
  "Ceren",
  "Umut",
  "Sevgi",
  "Volkan",
];

const LAST_NAMES = [
  "Yıldız",
  "Kaya",
  "Demir",
  "Şahin",
  "Çelik",
  "Yılmaz",
  "Aydın",
  "Öztürk",
  "Arslan",
  "Doğan",
  "Kılıç",
  "Aslan",
  "Çetin",
  "Kara",
  "Koç",
  "Kurt",
  "Özdemir",
  "Şimşek",
  "Polat",
  "Erdoğan",
];

function personName(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const last = LAST_NAMES[(index * 7) % LAST_NAMES.length]!;
  return `${first} ${last}`;
}

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

/** Depo kökü: API ile aynı yeri kullanmalı (yoksa belge açılmaz). */
function storageRoot(): string {
  const configured = process.env.UMAY_STORAGE_DIR?.trim();
  if (configured) return resolve(configured);
  return join(resolve(fileURLToPath(new URL("../../../", import.meta.url))), "apps", "api", ".data", "documents");
}

/** İçerik adresli yazma (sha256) — API'nin storage.ts'iyle aynı yerleşim. */
function saveAsset(asset: DemoAsset): string {
  const hash = createHash("sha256").update(asset.bytes).digest("hex");
  const path = join(storageRoot(), hash.slice(0, 2), hash.slice(2, 4), hash);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, asset.bytes);
  return hash;
}

const TYPE_TR: Record<string, string> = {
  apartment: "Mesken (Daire)",
  house: "Mustakil Ev",
  land: "Arsa",
  shop: "Dukkan",
  office: "Ofis",
};

function moneyText(kurus: number): string {
  return `${(kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`;
}

/** Fotoğraflar: 16 kare indirilir, mülke göre dağıtılır (aynı bayt tek kopya). */
async function loadPhotos(): Promise<DemoAsset[]> {
  const assets: DemoAsset[] = [];
  for (let i = 0; i < 16; i++) {
    const remote = await fetchPhoto(`umay-emlak-demo-${i + 1}`);
    assets.push(remote ?? fallbackScene(i));
  }
  return assets;
}

async function clean(client: Client, tenantId: string): Promise<string> {
  const steps: Array<[string, string]> = [
    [
      "belge",
      `delete from document where tenant_id = $1 and (
         property_id in (select id from property where tenant_id = $1 and title like 'DEMO %')
         or person_id in (select id from person where tenant_id = $1 and full_name like 'DEMO %'))`,
    ],
    [
      "komisyon",
      `delete from commission where listing_id in (
         select l.id from listing l join property p on p.id = l.property_id
          where p.tenant_id = $1 and p.title like 'DEMO %')`,
    ],
    [
      "teklif",
      `delete from offer where listing_id in (
         select l.id from listing l join property p on p.id = l.property_id
          where p.tenant_id = $1 and p.title like 'DEMO %')`,
    ],
    [
      "randevu",
      `delete from appointment where listing_id in (
         select l.id from listing l join property p on p.id = l.property_id
          where p.tenant_id = $1 and p.title like 'DEMO %')
         or person_id in (select id from person where tenant_id = $1 and full_name like 'DEMO %')`,
    ],
    [
      "görev",
      `delete from maintenance_request where tenant_id = $1 and (
         property_id in (select id from property where tenant_id = $1 and title like 'DEMO %')
         or person_id in (select id from person where tenant_id = $1 and full_name like 'DEMO %'))`,
    ],
    [
      "poliçe",
      `delete from policy where property_id in (
         select id from property where tenant_id = $1 and title like 'DEMO %')`,
    ],
    [
      "geçmiş",
      `delete from listing_status_change where listing_id in (
         select l.id from listing l join property p on p.id = l.property_id
          where p.tenant_id = $1 and p.title like 'DEMO %')`,
    ],
    [
      "fiyat geçmişi",
      `delete from listing_price_change where listing_id in (
         select l.id from listing l join property p on p.id = l.property_id
          where p.tenant_id = $1 and p.title like 'DEMO %')`,
    ],
    [
      "kişi notu",
      `delete from person_note where person_id in (
         select id from person where tenant_id = $1 and full_name like 'DEMO %')`,
    ],
    [
      "demirbaş",
      `delete from property_fixture where property_id in (
         select id from property where tenant_id = $1 and title like 'DEMO %')`,
    ],
    [
      "abonelik",
      `delete from property_subscription where property_id in (
         select id from property where tenant_id = $1 and title like 'DEMO %')`,
    ],
    [
      "hisse",
      `delete from property_owner where property_id in (
         select id from property where tenant_id = $1 and title like 'DEMO %')`,
    ],
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
      [tenantId, `${PREFIX}${personName(i - 1)}`, phone, phone.replace(/\D/g, "")],
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
      [tenantId, `${PREFIX}${personName(i + 14)}`, phone, phone.replace(/\D/g, "")],
    );
    tenantIds.push(rows[0]!.id);
  }

  // --- Mülkler + ilanlar ---------------------------------------------------
  // 90 mülkün 40'ı satılık, 50'si kiralık: i % 9 < 4 → satılık.
  const members = await client.query<{ id: string }>(
    `select user_id as id from membership
      where tenant_id = $1 and status = 'active'
      order by created_at`,
    [tenantId],
  );
  const responsibleIds = members.rows.map((row) => row.id);
  const allListings: Array<{ id: string; kind: string; priceKurus: number; status: string }> = [];
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
          responsibleIds.length > 0 ? responsibleIds[idx % responsibleIds.length]! : responsibleUserId,
          status === "draft" ? null : new Date(),
        ],
      );
      allListings.push({ id: listingRows[0]!.id, kind, priceKurus, status });

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

  // --- Alınan teklifler (her 7. ilana) --------------------------------------
  let offerCount = 0;
  for (let i = 0; i < allListings.length; i++) {
    const listing = allListings[i]!;
    if (i % 7 !== 0) continue;
    const discount = listing.kind === "sale" ? 0.93 : 0.97;
    const amount = Math.round(listing.priceKurus * discount);
    await client.query(
      `insert into offer
         (tenant_id, listing_id, bidder_name, bidder_phone, amount_kurus, status, note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        listing.id,
        `${PREFIX}${personName(i + 3)}`,
        phoneFor(600, i),
        amount,
        i % 21 === 0 ? "negotiating" : "received",
        `${PREFIX}telefonla gelen teklif`,
      ],
    );
    offerCount++;
  }

  // --- Fotoğraflar ve dolu belgeler (TUR:48) -------------------------------
  // Raf kartında harf yerine mülk fotoğrafı, kişi kartında dolu kimlik/sözleşme.
  const photos = await loadPhotos();

  await client.query(
    `update person
        set email = lower(replace(replace(full_name, 'DEMO ', ''), ' ', '.')) || '@ornek.local',
            national_id = '123' || lpad((abs(hashtext(id::text)) % 1000000)::text, 6, '0') || '45',
            contact_permission = 'allowed'
      where tenant_id = $1 and full_name like 'DEMO %'`,
    [tenantId],
  );

  const props = await client.query<{
    id: string;
    title: string;
    district: string | null;
    address: string | null;
    type: string;
    room_count: string | null;
    gross_m2: number | null;
    block: string | null;
    unit_no: string | null;
    deed_ref: string | null;
    owner_name: string | null;
  }>(
    `select p.id, p.title, p.district, p.address, p.type::text as type, p.room_count, p.gross_m2,
            p.block, p.unit_no, p.deed_ref, o.full_name as owner_name
       from property p
       left join person o on o.id = p.owner_person_id
      where p.tenant_id = $1 and p.title like 'DEMO %'
      order by p.title`,
    [tenantId],
  );

  let mediaCount = 0;
  for (let i = 0; i < props.rows.length; i++) {
    const row = props.rows[i]!;
    const asset = photos[i % photos.length]!;
    const hash = saveAsset(asset);
    await client.query(
      `insert into property_media
         (tenant_id, property_id, kind, title, sha256, mime_type, size_bytes, created_by_user_id)
       values ($1, $2, 'image', $3, $4, $5, $6, $7)`,
      [
        tenantId,
        row.id,
        i % 3 === 0 ? "Salon" : "Ön cephe",
        hash,
        asset.mimeType,
        asset.bytes.length,
        responsibleUserId,
      ],
    );
    mediaCount++;
  }

  let docCount = 0;
  async function insertDoc(opts: {
    kind: string;
    asset: DemoAsset;
    filename: string;
    title: string;
    personId?: string | null;
    propertyId?: string | null;
    listingId?: string | null;
  }): Promise<void> {
    const hash = saveAsset(opts.asset);
    await client.query(
      `insert into document
         (tenant_id, kind, sha256, filename, mime_type, size_bytes,
          person_id, property_id, listing_id, uploaded_by_user_id, title)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (tenant_id, sha256) do nothing`,
      [
        tenantId,
        opts.kind,
        hash,
        opts.filename,
        opts.asset.mimeType,
        opts.asset.bytes.length,
        opts.personId ?? null,
        opts.propertyId ?? null,
        opts.listingId ?? null,
        responsibleUserId,
        opts.title,
      ],
    );
    docCount++;
  }

  for (let i = 0; i < props.rows.length; i++) {
    const row = props.rows[i]!;
    const listing = await client.query<{ id: string; authority_no: string | null; price_kurus: string; kind: string }>(
      `select id, authority_no, price_kurus::text as price_kurus, kind::text as kind
         from listing where tenant_id = $1 and property_id = $2 limit 1`,
      [tenantId, row.id],
    );
    const listingRow = listing.rows[0];

    await insertDoc({
      kind: "tapu",
      asset: tapuPdf({
        title: row.title,
        district: row.district ?? "Konak",
        block: row.block,
        unitNo: row.unit_no,
        grossM2: row.gross_m2,
        deedRef: row.deed_ref,
        ownerName: row.owner_name ?? "-",
        roomCount: row.room_count,
        typeLabel: TYPE_TR[row.type] ?? "Mesken",
      }),
      filename: `Tapu-${String(i + 1).padStart(4, "0")}.pdf`,
      title: `Tapu kayıt örneği · ${row.title}`,
      propertyId: row.id,
      listingId: listingRow?.id ?? null,
    });

    if (listingRow) {
      await insertDoc({
        kind: "yetki_belgesi",
        asset: yetkiPdf({
          title: row.title,
          ownerName: row.owner_name ?? "-",
          authorityNo: listingRow.authority_no,
          priceText: moneyText(Number(listingRow.price_kurus)),
          district: row.district ?? "Konak",
        }),
        filename: `Yetki-${String(i + 1).padStart(4, "0")}.pdf`,
        title: `Yetki belgesi · ${row.title}`,
        propertyId: row.id,
        listingId: listingRow.id,
      });
    }
  }

  const people = await client.query<{
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    kind: string;
  }>(
    `select id, full_name, phone, email, national_id, kind::text as kind
       from person where tenant_id = $1 and full_name like 'DEMO %' order by full_name`,
    [tenantId],
  );

  for (let i = 0; i < people.rows.length; i++) {
    const person = people.rows[i]!;
    await insertDoc({
      kind: "kimlik",
      asset: kimlikPdf({
        fullName: person.full_name,
        phone: person.phone,
        email: person.email,
        nationalId: person.national_id,
      }),
      filename: `Kimlik-${String(i + 1).padStart(3, "0")}.pdf`,
      title: "Kimlik fotokopisi",
      personId: person.id,
    });
  }

  const contractRows = await client.query<{
    tenant_id_person: string;
    tenant_name: string;
    owner_name: string | null;
    title: string;
    address: string | null;
    start_date: string;
    rent_kurus: string;
    deposit_kurus: string;
    due_day: number;
    listing_id: string;
  }>(
    `select c.tenant_person_id as tenant_id_person, tp.full_name as tenant_name,
            op.full_name as owner_name, pr.title, pr.address,
            c.start_date::text as start_date, c.rent_kurus::text as rent_kurus,
            c.deposit_kurus::text as deposit_kurus, c.due_day, l.id as listing_id
       from contract c
       join person tp on tp.id = c.tenant_person_id
       join listing l on l.id = c.listing_id
       join property pr on pr.id = l.property_id
       left join person op on op.id = pr.owner_person_id
      where c.tenant_id = $1 and tp.full_name like 'DEMO %'
      order by tp.full_name`,
    [tenantId],
  );

  for (let i = 0; i < contractRows.rows.length; i++) {
    const row = contractRows.rows[i]!;
    await insertDoc({
      kind: "sozlesme",
      asset: sozlesmePdf({
        tenantName: row.tenant_name,
        ownerName: row.owner_name ?? "-",
        propertyTitle: row.title,
        address: row.address,
        startDate: row.start_date,
        rentText: moneyText(Number(row.rent_kurus)),
        depositText: moneyText(Number(row.deposit_kurus)),
        dueDay: row.due_day,
      }),
      filename: `Kira-Sozlesmesi-${String(i + 1).padStart(3, "0")}.pdf`,
      title: `Kira sözleşmesi · ${row.title}`,
      personId: row.tenant_id_person,
      listingId: row.listing_id,
    });
  }

  const statusText = Object.entries(statusCounts)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

  return [
    `${PREFIX}kayıtlar eklendi`,
    `mal sahibi ${ownerIds.length}`,
    `mülk ${idx} (satılık ${sale} / kiralık ${rent})`,
    `kiracı ${tenantIds.length} (sözleşmeli ${rentActive.length})`,
    `teklif ${offerCount}`,
    `fotoğraf ${mediaCount}`,
    `belge ${docCount} (tapu/yetki/kimlik/sözleşme)`,
    `personel dağıtımı ${responsibleIds.length} kişi`,
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
