/**
 * Şema — Drizzle. SQL karşılığı migrations/0001_init.sql'tir.
 * Kural (K-02/K-07): üyelik dahil her iş tablosunda tenant_id vardır ve RLS zorunludur.
 * Para (K-13): tüm tutarlar *_kurus, bigint, tam sayı. Float yok.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);
export const memberRole = pgEnum("member_role", [
  "owner",
  "partner",
  "manager",
  "agent",
  "finance",
  "viewer",
]);
export const memberStatus = pgEnum("member_status", ["active", "left"]);
export const personKind = pgEnum("person_kind", ["owner", "tenant", "candidate"]);
export const propertyType = pgEnum("property_type", [
  "apartment",
  "house",
  "land",
  "shop",
  "office",
]);
export const listingKind = pgEnum("listing_kind", ["sale", "rent"]);
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "active",
  "reserved",
  "closed",
  "archived",
]);
export const contractStatus = pgEnum("contract_status", ["active", "ended", "cancelled"]);
export const chargeKind = pgEnum("charge_kind", ["rent", "aidat", "utility", "fee", "other"]);
export const chargeStatus = pgEnum("charge_status", ["open", "partial", "paid", "cancelled"]);
/** K-21: elden/nakit tahsilat ayrı yöntemdir, banka hareketi yoktur. */
export const paymentMethod = pgEnum("payment_method", [
  "transfer",
  "office_account",
  "cash_office",
  "card",
  "offset",
]);
export const commissionStatus = pgEnum("commission_status", [
  "proposed",
  "approved",
  "paid",
  "cancelled",
]);
/** K-27: aidat/fatura/sigorta sorumluluğu sözleşmede seçilir. */
export const utilityPayer = pgEnum("utility_payer", ["tenant", "office", "owner"]);
/** K-32: belge matrisi. */
export const documentKind = pgEnum("document_kind", [
  "tapu",
  "kimlik",
  "yetki_belgesi",
  "satis_yetki",
  "sozlesme",
  "bordro",
  "kefil",
  "findex",
  "imar",
  "dekont",
  "diger",
]);

export type TenantSettings = {
  /** K-30: mal sahibi kiracı bilgilerini maskeli görsün mü (KVKK) */
  maskTenantInfoForOwners?: boolean;
  /** K-28: gecikme kademeleri (gün) */
  overdueReminderDays?: number;
  overdueFormalNoticeDays?: number;
};

/** Kiracı (ofis). RLS yok — bu tablo kiracıların kendisini tutar. */
export const tenants = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: tenantStatus("status").notNull().default("active"),
  settings: jsonb("settings").$type<TenantSettings>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Global kimlik. Ofise bağlı değil; bağ üyelik üzerinden kurulur (K-02). */
export const appUsers = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** K-29: rol/onay yetkisi ofis bazlıdır. */
export const memberships = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("agent"),
    status: memberStatus("status").notNull().default("active"),
    /** Onay yetkisi: yalnız owner ve partner (K-29) */
    canApprove: boolean("can_approve").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_tenant_user_uidx").on(t.tenantId, t.userId),
    index("membership_tenant_idx").on(t.tenantId),
  ],
);

/** Mal sahibi / kiracı / aday. Ofis bazlı; global kişi havuzu YOK (K-02). */
export const persons = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: personKind("kind").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    /** TCKN — maskelenerek saklanır, düz metin aramada kullanılmaz */
    nationalId: text("national_id"),
    notes: text("notes"),
    /** Mükerrer tespiti için normalize edilmiş telefon (yalnız rakam) */
    phoneDigits: text("phone_digits"),
    /** K-16: birleştirmede kaybeden kayıt silinmez, buraya bağlanır */
    mergedIntoId: uuid("merged_into_id"),
    /** Aynı dosya iki kez aktarılınca mükerrer açılmasın */
    importKey: text("import_key"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("person_tenant_kind_idx").on(t.tenantId, t.kind),
    index("person_tenant_phone_idx").on(t.tenantId, t.phoneDigits),
  ],
);

/** Gayrimenkul ≠ portföy (K-17): aynı daire hem satılık hem kiralık olabilir. */
export const properties = pgTable(
  "property",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerPersonId: uuid("owner_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    type: propertyType("type").notNull().default("apartment"),
    title: text("title").notNull(),
    city: text("city"),
    district: text("district"),
    address: text("address"),
    grossM2: integer("gross_m2"),
    notes: text("notes"),
    block: text("block"),
    unitNo: text("unit_no"),
    floor: integer("floor"),
    /** "3+1" gibi serbest metin: daire tipleri standart değil */
    roomCount: text("room_count"),
    deedRef: text("deed_ref"),
    importKey: text("import_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("property_tenant_idx").on(t.tenantId)],
);

export const listings = pgTable(
  "listing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    kind: listingKind("kind").notNull(),
    status: listingStatus("status").notNull().default("draft"),
    priceKurus: bigint("price_kurus", { mode: "number" }).notNull(),
    responsibleUserId: uuid("responsible_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listing_tenant_status_idx").on(t.tenantId, t.status),
    index("listing_property_idx").on(t.propertyId),
  ],
);

/** K-23: depozito ayrı alan, gelir değil. K-27: masraf sorumluluğu seçilir. */
export const contracts = pgTable(
  "contract",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    tenantPersonId: uuid("tenant_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    rentKurus: bigint("rent_kurus", { mode: "number" }).notNull(),
    depositKurus: bigint("deposit_kurus", { mode: "number" }).notNull().default(0),
    /** Depozito kaç kira karşılığı — bilgi amaçlı, tutar esastır */
    depositRentCount: integer("deposit_rent_count"),
    dueDay: integer("due_day").notNull().default(1),
    utilityPayer: utilityPayer("utility_payer").notNull().default("tenant"),
    status: contractStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contract_tenant_status_idx").on(t.tenantId, t.status)],
);

/** Tahakkuk (K-13): borç doğar, ödeme mahsup eder. */
export const charges = pgTable(
  "charge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "restrict" }),
    period: date("period", { mode: "string" }).notNull(),
    kind: chargeKind("kind").notNull().default("rent"),
    amountKurus: bigint("amount_kurus", { mode: "number" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    status: chargeStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("charge_contract_period_kind_uidx").on(t.contractId, t.period, t.kind),
    index("charge_tenant_period_idx").on(t.tenantId, t.period),
  ],
);

/** Tahsilat (K-21): yöntem + teslim alan zorunlu; elden nakit ayrı izlenir. */
export const payments = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "restrict" }),
    amountKurus: bigint("amount_kurus", { mode: "number" }).notNull(),
    method: paymentMethod("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    receivedByUserId: uuid("received_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Elden tahsilatta kim teslim aldı — kayıt zorunluluğu */
    receivedByName: text("received_by_name"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_tenant_idx").on(t.tenantId), index("payment_charge_idx").on(t.chargeId)],
);

/** Komisyon (K-24): %3 varsayılan ama oran/tutar elle; indirim gerekçesi zorunlu. */
export const commissions = pgTable(
  "commission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    /** 300 = %3, baz puan. Tutar ayrıca saklanır (pazarlık sonucu) */
    rateBp: integer("rate_bp"),
    amountKurus: bigint("amount_kurus", { mode: "number" }).notNull(),
    discountReason: text("discount_reason"),
    status: commissionStatus("status").notNull().default("proposed"),
    approvedByUserId: uuid("approved_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("commission_tenant_idx").on(t.tenantId)],
);

/** K-18/K-32: içerik adresli belge deposu (sha256). Aynı dosya iki kez saklanmaz. */
export const documents = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: documentKind("kind").notNull().default("diger"),
    sha256: text("sha256").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Dosyanın kendi adından farklı, insanın verdiği ad ("Aysan Bey tapu") */
    title: text("title"),
    notes: text("notes"),
    /** "Gördüm, doğru belge" işareti — onaylayan ve zamanı saklanır */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: uuid("verified_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_tenant_sha_uidx").on(t.tenantId, t.sha256),
    index("document_tenant_person_idx").on(t.tenantId, t.personId),
    index("document_tenant_kind_idx").on(t.tenantId, t.kind),
  ],
);

/**
 * K-32: otomatik eşleştirme ÖNERİR, bağlamaz.
 * Bağ, onaylandığında document satırına yazılır; öneri kendi başına yetki vermez.
 */
export const documentSuggestions = pgTable(
  "document_suggestion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"person" | "property" | "listing">().notNull(),
    targetId: uuid("target_id").notNull(),
    score: integer("score").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    decidedByUserId: uuid("decided_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_suggestion_uidx").on(t.documentId, t.targetType, t.targetId),
    index("document_suggestion_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/** Fiyat geçmişi: pazarlık yazılı kalsın. */
export const listingPriceChanges = pgTable(
  "listing_price_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    oldKurus: bigint("old_kurus", { mode: "number" }).notNull(),
    newKurus: bigint("new_kurus", { mode: "number" }).notNull(),
    note: text("note"),
    changedByUserId: uuid("changed_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_price_change_listing_idx").on(t.tenantId, t.listingId)],
);

/** Durum geçmişi: yayına alma belge şartıyla mı, yetkiyle mi geçildi? */
export const listingStatusChanges = pgTable(
  "listing_status_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    fromStatus: listingStatus("from_status").notNull(),
    toStatus: listingStatus("to_status").notNull(),
    forced: boolean("forced").notNull().default(false),
    note: text("note"),
    changedByUserId: uuid("changed_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_status_change_listing_idx").on(t.tenantId, t.listingId)],
);

/** Hisseli mülk: bir gayrimenkulde birden fazla malik (K-17). */
export const propertyOwners = pgTable(
  "property_owner",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /** 10000 = tam hisse; null = belirtilmedi */
    shareBp: integer("share_bp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("property_owner_uidx").on(t.propertyId, t.personId),
    index("property_owner_person_idx").on(t.tenantId, t.personId),
  ],
);

/** İçe aktarma defteri — denetim izi (hangi dosya, ne oldu). */
export const importBatches = pgTable(
  "import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    dryRun: boolean("dry_run").notNull().default(false),
    totalRows: integer("total_rows").notNull().default(0),
    personsCreated: integer("persons_created").notNull().default(0),
    personsMerged: integer("persons_merged").notNull().default(0),
    personsSkipped: integer("persons_skipped").notNull().default(0),
    propertiesCreated: integer("properties_created").notNull().default(0),
    listingsCreated: integer("listings_created").notNull().default(0),
    errors: jsonb("errors").$type<unknown[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batch_tenant_idx").on(t.tenantId, t.createdAt)],
);

export type Tenant = typeof tenants.$inferSelect;
export type Person = typeof persons.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
