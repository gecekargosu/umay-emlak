-- TUR:35 — Arıza / bakım talebi (SIRA 7).
-- Talep mülke bağlıdır; kiracı/sahip bildirir, ofis durumu ilerletir.
-- Talep silinmez: açık → işlemde → bitti / iptal. Fotoğraf aynı içerik adresli
-- depoda durur; property_media satırı talebe bağlanır (maintenance_id).
create table if not exists maintenance_request (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  property_id        uuid not null references property(id) on delete cascade,
  listing_id         uuid references listing(id) on delete set null,
  person_id          uuid references person(id) on delete set null,
  title              text not null,
  description        text,
  category           text not null default 'other'
                       check (category in ('electrical', 'plumbing', 'heating', 'elevator', 'appliance', 'other')),
  priority           text not null default 'normal'
                       check (priority in ('low', 'normal', 'urgent')),
  status             text not null default 'open'
                       check (status in ('open', 'in_progress', 'done', 'cancelled')),
  reported_at        date not null default current_date,
  cost_kurus         bigint,
  note               text,
  resolved_at        timestamptz,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists maintenance_tenant_status_idx on maintenance_request (tenant_id, status);
create index if not exists maintenance_property_idx on maintenance_request (tenant_id, property_id);

alter table maintenance_request enable row level security;
alter table maintenance_request force row level security;

drop policy if exists maintenance_tenant_isolation on maintenance_request;
create policy maintenance_tenant_isolation on maintenance_request
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Talep fotoğrafları: mülk medyası altyapısı kullanılır, talep bağlantısı eklenir.
alter table property_media
  add column if not exists maintenance_id uuid references maintenance_request(id) on delete cascade;

create index if not exists property_media_maintenance_idx
  on property_media (tenant_id, maintenance_id);
