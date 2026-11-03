-- UMAY EMLAK · Migration 0003 — Dilim 2: kişi, gayrimenkul, içe aktarma
-- K-16: birleştirme SİLMEZ. Kaybeden kayıt merged_into_id ile işaretlenir,
--       geçmişi ve belgeleri korunur.

alter table person add column if not exists phone_digits text;
alter table person add column if not exists merged_into_id uuid references person(id) on delete set null;
alter table person add column if not exists import_key text;
alter table person add column if not exists source text;
create index if not exists person_tenant_phone_idx on person (tenant_id, phone_digits);
create unique index if not exists person_tenant_import_uidx
  on person (tenant_id, import_key) where import_key is not null;

alter table property add column if not exists block text;
alter table property add column if not exists unit_no text;
alter table property add column if not exists floor integer;
alter table property add column if not exists room_count text;
alter table property add column if not exists deed_ref text;
alter table property add column if not exists import_key text;
create unique index if not exists property_tenant_import_uidx
  on property (tenant_id, import_key) where import_key is not null;

-- Hisseli mülk / çoklu malik (K-17). share_bp: 10000 = tam hisse.
create table if not exists property_owner (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  property_id uuid not null references property(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  share_bp    integer,
  created_at  timestamptz not null default now()
);
create unique index if not exists property_owner_uidx on property_owner (property_id, person_id);
create index if not exists property_owner_person_idx on property_owner (tenant_id, person_id);

-- İçe aktarma defteri: hangi dosya, kaç satır, ne oldu (denetim izi)
create table if not exists import_batch (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  filename            text not null,
  dry_run             boolean not null default false,
  total_rows          integer not null default 0,
  persons_created     integer not null default 0,
  persons_merged      integer not null default 0,
  persons_skipped     integer not null default 0,
  properties_created  integer not null default 0,
  listings_created    integer not null default 0,
  errors              jsonb not null default '[]'::jsonb,
  created_by          uuid references app_user(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists import_batch_tenant_idx on import_batch (tenant_id, created_at desc);

-- RLS: yeni kiracı tabloları (0001 ile aynı desen)
do $$
declare
  t text;
begin
  foreach t in array array['property_owner', 'import_batch']
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
