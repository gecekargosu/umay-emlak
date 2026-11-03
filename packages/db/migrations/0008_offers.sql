-- TUR:23 — Alınan teklifler (satılık/kiralık ilan başına).
-- Personel portföyünde "bu mülk için alınan teklifler" gösterilecek.
-- Para K-13: kuruş, tam sayı. Teklif silinmez, durumu değişir.
create table if not exists offer (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  listing_id         uuid not null references listing(id) on delete cascade,
  bidder_name        text not null,
  bidder_phone       text,
  amount_kurus       bigint not null check (amount_kurus >= 0),
  status             text not null default 'received',  -- received | negotiating | accepted | rejected
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists offer_tenant_listing_idx on offer (tenant_id, listing_id);

alter table offer enable row level security;
alter table offer force row level security;

drop policy if exists offer_tenant_isolation on offer;
create policy offer_tenant_isolation on offer
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
