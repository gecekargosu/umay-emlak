-- TUR:29 — DASK / poliçe bitiş takibi (SIRA 3).
-- Poliçe mülke bağlıdır: aynı daire için DASK + konut + sorumluluk ayrı satır.
-- Poliçe silinmez; yanlış giriş düzeltilir (updated_at), bitiş tarihi değişir.
create table if not exists policy (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  property_id      uuid not null references property(id) on delete cascade,
  kind             text not null default 'dask'
                     check (kind in ('dask', 'konut', 'sorumluluk', 'isyeri', 'hayat', 'diger')),
  insurer          text,
  policy_no        text,
  start_date       date,
  end_date         date not null,
  premium_kurus    bigint,
  note             text,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists policy_tenant_end_idx on policy (tenant_id, end_date);
create index if not exists policy_property_idx on policy (tenant_id, property_id);

alter table policy enable row level security;
alter table policy force row level security;

drop policy if exists policy_tenant_isolation on policy;
create policy policy_tenant_isolation on policy
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
