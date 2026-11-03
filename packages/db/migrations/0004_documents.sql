-- UMAY EMLAK · Migration 0004 — Dilim 3: belge deposu, eşleştirme, ilan geçmişi
-- K-18: belge içeriği sha256 ile adreslenir, aynı dosya iki kez saklanmaz.
-- K-32: belge türü matrisi + ONAYLI otomatik eşleştirme (öneri insan onayıyla bağlanır).
-- K-29: onay yetkisi olmayan kullanıcı eşleştirmeyi kesinleştiremez.

alter table document add column if not exists title text;
alter table document add column if not exists notes text;
alter table document add column if not exists verified_at timestamptz;
alter table document add column if not exists verified_by_user_id uuid
  references app_user(id) on delete set null;
create index if not exists document_tenant_kind_idx
  on document (tenant_id, kind, created_at desc);

-- Eşleştirme önerisi: "bu belge şu kişiye/mülke ait olabilir" fikri.
-- Bağ KURMAZ; yalnız öneri tutar. Bağ, onaylandığında document satırına yazılır.
create table if not exists document_suggestion (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  document_id        uuid not null references document(id) on delete cascade,
  target_type        text not null check (target_type in ('person', 'property', 'listing')),
  target_id          uuid not null,
  score              integer not null check (score between 0 and 100),
  reasons            jsonb not null default '[]'::jsonb,
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  decided_by_user_id uuid references app_user(id) on delete set null,
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index if not exists document_suggestion_uidx
  on document_suggestion (document_id, target_type, target_id);
create index if not exists document_suggestion_tenant_status_idx
  on document_suggestion (tenant_id, status);

-- Fiyat geçmişi: pazarlık yazılı kalsın, "neden düştü" sorusu cevaplanabilsin.
create table if not exists listing_price_change (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  listing_id         uuid not null references listing(id) on delete cascade,
  old_kurus          bigint not null,
  new_kurus          bigint not null,
  note               text,
  changed_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists listing_price_change_listing_idx
  on listing_price_change (tenant_id, listing_id, created_at desc);

-- Durum geçmişi: yayına alma belge şartıyla mı, yetkiyle mi geçildi?
create table if not exists listing_status_change (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  listing_id         uuid not null references listing(id) on delete cascade,
  from_status        listing_status not null,
  to_status          listing_status not null,
  forced             boolean not null default false,
  note               text,
  changed_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists listing_status_change_listing_idx
  on listing_status_change (tenant_id, listing_id, created_at desc);

-- RLS: yeni kiracı tabloları (0001 ile aynı desen, FORCE dahil)
do $$
declare
  t text;
begin
  foreach t in array array['document_suggestion', 'listing_price_change', 'listing_status_change']
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
