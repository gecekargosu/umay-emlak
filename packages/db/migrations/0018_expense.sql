-- TUR:60 — Gider kalemleri (yol haritası 2. madde: gider + mal sahibi ekstresi).
--
-- Gider mülke bağlıdır: tamir, aidat, temizlik, sigorta, vergi, komisyon...
-- Kural: kayıt silinmez. Yanlış giriş düzeltilir (update) veya iptal edilir
-- (status = 'iptal'); ekstre yalnız 'aktif' giderleri düşer, iptal iz bırakır.
-- Para kuruş tam sayı (K-1/K-3 ile aynı kural).
create table if not exists expense (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  property_id        uuid not null references property(id) on delete cascade,
  category           text not null default 'diger',
  amount_kurus       bigint not null check (amount_kurus > 0),
  spent_on           date not null,
  vendor             text,
  note               text,
  status             text not null default 'aktif',
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint expense_status_check check (status in ('aktif', 'iptal'))
);

create index if not exists expense_tenant_property_idx
  on expense (tenant_id, property_id, spent_on desc);

create index if not exists expense_tenant_date_idx
  on expense (tenant_id, spent_on desc);

alter table expense enable row level security;
alter table expense force row level security;

drop policy if exists expense_isolation on expense;
create policy expense_isolation on expense
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update on expense to umay_app;
