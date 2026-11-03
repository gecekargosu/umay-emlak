-- TUR:27 — Mülk fotoğraf ve videoları.
-- Görseller/videolar içerik adresli depoda (sha256) durur; tablo yalnız meta tutar.
create table if not exists property_media (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  property_id        uuid not null references property(id) on delete cascade,
  kind               text not null default 'image' check (kind in ('image', 'video')),
  title              text,
  sha256             text not null,
  mime_type          text not null,
  size_bytes         integer not null,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists property_media_property_idx on property_media (tenant_id, property_id);

alter table property_media enable row level security;
alter table property_media force row level security;

drop policy if exists property_media_tenant_isolation on property_media;
create policy property_media_tenant_isolation on property_media
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
