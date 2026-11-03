-- UMAY EMLAK · Migration 0001 — Dilim 0 iskeleti
-- Elle yazıldı: drizzle-kit RLS politikalarını üretmez (K-07).
-- Geri alınamaz: üretimde her değişiklik YENİ migration dosyasıdır.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tipler
create type tenant_status as enum ('active', 'suspended');
create type member_role as enum ('owner', 'partner', 'manager', 'agent', 'finance', 'viewer');
create type member_status as enum ('active', 'left');
create type person_kind as enum ('owner', 'tenant', 'candidate');
create type property_type as enum ('apartment', 'house', 'land', 'shop', 'office');
create type listing_kind as enum ('sale', 'rent');
create type listing_status as enum ('draft', 'active', 'reserved', 'closed', 'archived');
create type contract_status as enum ('active', 'ended', 'cancelled');
create type charge_kind as enum ('rent', 'aidat', 'utility', 'fee', 'other');
create type charge_status as enum ('open', 'partial', 'paid', 'cancelled');
create type payment_method as enum ('transfer', 'office_account', 'cash_office', 'card', 'offset');
create type commission_status as enum ('proposed', 'approved', 'paid', 'cancelled');
create type utility_payer as enum ('tenant', 'office', 'owner');
create type document_kind as enum (
  'tapu', 'kimlik', 'yetki_belgesi', 'satis_yetki', 'sozlesme',
  'bordro', 'kefil', 'findex', 'imar', 'dekont', 'diger'
);

-- ------------------------------------------------------- kiracı ve kimlik
create table tenant (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  status      tenant_status not null default 'active',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table app_user (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  full_name      text not null,
  phone          text,
  password_hash  text,
  created_at     timestamptz not null default now()
);

create table membership (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  user_id       uuid not null references app_user(id) on delete cascade,
  role          member_role not null default 'agent',
  status        member_status not null default 'active',
  can_approve   boolean not null default false,   -- K-29: yalnız owner/partner
  created_at    timestamptz not null default now()
);
create unique index membership_tenant_user_uidx on membership (tenant_id, user_id);
create index membership_tenant_idx on membership (tenant_id);

-- ---------------------------------------------------------------- iş verisi
create table person (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  kind        person_kind not null,
  full_name   text not null,
  phone       text,
  email       text,
  national_id text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index person_tenant_kind_idx on person (tenant_id, kind);

create table property (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  owner_person_id uuid references person(id) on delete set null,
  type            property_type not null default 'apartment',
  title           text not null,
  city            text,
  district        text,
  address         text,
  gross_m2        integer,
  notes           text,
  created_at      timestamptz not null default now()
);
create index property_tenant_idx on property (tenant_id);

create table listing (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  property_id         uuid not null references property(id) on delete cascade,
  kind                listing_kind not null,
  status              listing_status not null default 'draft',
  price_kurus         bigint not null,
  responsible_user_id uuid references app_user(id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint listing_price_positive check (price_kurus >= 0)
);
create index listing_tenant_status_idx on listing (tenant_id, status);
create index listing_property_idx on listing (property_id);

create table contract (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  listing_id          uuid not null references listing(id) on delete restrict,
  tenant_person_id    uuid not null references person(id) on delete restrict,
  start_date          date not null,
  end_date            date,
  rent_kurus          bigint not null,
  deposit_kurus       bigint not null default 0,
  deposit_rent_count  integer,
  due_day             integer not null default 1,
  utility_payer       utility_payer not null default 'tenant',
  status              contract_status not null default 'active',
  created_at          timestamptz not null default now(),
  constraint contract_due_day_range check (due_day between 1 and 28),
  constraint contract_dates check (end_date is null or end_date > start_date)
);
create index contract_tenant_status_idx on contract (tenant_id, status);

create table charge (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  contract_id   uuid not null references contract(id) on delete restrict,
  period        date not null,                 -- ayın 1'i
  kind          charge_kind not null default 'rent',
  amount_kurus  bigint not null,
  due_date      date not null,
  status        charge_status not null default 'open',
  created_at    timestamptz not null default now(),
  constraint charge_amount_positive check (amount_kurus >= 0)
);
create unique index charge_contract_period_kind_uidx on charge (contract_id, period, kind);
create index charge_tenant_period_idx on charge (tenant_id, period);

create table payment (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  charge_id           uuid not null references charge(id) on delete restrict,
  amount_kurus        bigint not null,
  method              payment_method not null,
  paid_at             timestamptz not null default now(),
  received_by_user_id uuid references app_user(id) on delete set null,
  received_by_name    text,                    -- K-21: elden teslim alan
  note                text,
  created_at          timestamptz not null default now(),
  constraint payment_amount_positive check (amount_kurus > 0)
);
create index payment_tenant_idx on payment (tenant_id);
create index payment_charge_idx on payment (charge_id);

create table commission (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  listing_id          uuid not null references listing(id) on delete restrict,
  rate_bp             integer,                 -- 300 = %3
  amount_kurus        bigint not null,
  discount_reason     text,                    -- K-24: indirimde zorunlu (uygulama katmanı)
  status              commission_status not null default 'proposed',
  approved_by_user_id uuid references app_user(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index commission_tenant_idx on commission (tenant_id);

create table document (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  kind                document_kind not null default 'diger',
  sha256              text not null,           -- K-18: içerik adresli
  filename            text not null,
  mime_type           text not null,
  size_bytes          integer not null,
  person_id           uuid references person(id) on delete set null,
  property_id         uuid references property(id) on delete set null,
  listing_id          uuid references listing(id) on delete set null,
  uploaded_by_user_id uuid references app_user(id) on delete set null,
  created_at          timestamptz not null default now()
);
create unique index document_tenant_sha_uidx on document (tenant_id, sha256);
create index document_tenant_person_idx on document (tenant_id, person_id);

-- ------------------------------------------------------------- RLS (K-07)
-- Her kiracı tablosunda: RLS açık + FORCE (tablo sahibi de atlayamaz).
-- Bağlam yoksa current_setting NULL olur → karşılaştırma NULL → 0 satır.
do $$
declare
  t text;
begin
  foreach t in array array[
    'membership', 'person', 'property', 'listing',
    'contract', 'charge', 'payment', 'commission', 'document'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I
         using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------- oturum açma (login) yolu
-- Kiracı bağlamı yokken "bu e-posta hangi ofislerde üye?" sorusu gerekir.
-- Bu fonksiyon RLS'i aşan sahibiyle çalışır; yalnız üyelik listesi döndürür.
-- ÜRETİM NOTU: fonksiyon sahibi BYPASSRLS olan bir rol olmalı, uygulama rolü değil.
create or replace function auth_lookup(p_email text)
returns table (
  user_id       uuid,
  tenant_id     uuid,
  role          member_role,
  can_approve   boolean,
  full_name     text,
  tenant_name   text,
  tenant_status tenant_status
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select u.id, m.tenant_id, m.role, m.can_approve, u.full_name, t.name, t.status
  from app_user u
  join membership m on m.user_id = u.id
  join tenant t on t.id = m.tenant_id
  where lower(u.email) = lower(p_email)
    and m.status = 'active';
$$;

revoke all on function auth_lookup(text) from public;
grant execute on function auth_lookup(text) to umay_app;
