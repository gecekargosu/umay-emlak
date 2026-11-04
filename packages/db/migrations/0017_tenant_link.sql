-- TUR:55 — Kiracı talep bağlantısı (yol haritası: kiracı kendi arızasını açsın).
--
-- Ofis, kiralık dosyadan süreli bir bağlantı üretir; kiracı giriş yapmadan arıza
-- bildirir. Jetonun kendisi saklanmaz: yalnız sha256 özeti (K-18 ile aynı mantık).
-- Bağlantı iptal edilebilir (revoked_at) ve süresi dolabilir (expires_on).
create table if not exists tenant_access_link (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  contract_id        uuid not null references contract(id) on delete cascade,
  token_hash         text not null unique,
  created_by_user_id uuid references app_user(id) on delete set null,
  expires_on         date not null,
  revoked_at         timestamptz,
  last_used_at       timestamptz,
  use_count          integer not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists tenant_access_link_contract_idx
  on tenant_access_link (tenant_id, contract_id);

alter table tenant_access_link enable row level security;
alter table tenant_access_link force row level security;

drop policy if exists tenant_access_link_isolation on tenant_access_link;
create policy tenant_access_link_isolation on tenant_access_link
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update on tenant_access_link to umay_app;

-- Jetonla ofis bağlamı bulma: oturum yokken çalışır, yalnız bağlantı satırını döner.
-- RLS'i aşan sahibiyle çalışır (auth_lookup ile aynı desen).
create or replace function tenant_link_lookup(p_token text)
returns table (
  id         uuid,
  tenant_id  uuid,
  contract_id uuid,
  expires_on date,
  revoked_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select l.id, l.tenant_id, l.contract_id, l.expires_on, l.revoked_at
    from tenant_access_link l
   where l.token_hash = p_token
   limit 1;
$$;

revoke all on function tenant_link_lookup(text) from public;
grant execute on function tenant_link_lookup(text) to umay_app;
