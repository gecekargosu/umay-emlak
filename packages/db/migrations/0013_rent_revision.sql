-- TUR:30 — TÜİK kira artış oranıyla yenileme (SIRA 4).
-- Oran otomatik uygulanmaz: taslak üretilir, yetkili onaylar (kullanıcı notu).
-- Kaynak ve oran saklanır: "hangi oranla, hangi tarihte" sonradan tartışılmasın.
create table if not exists rent_revision (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  contract_id        uuid not null references contract(id) on delete cascade,
  effective_period   date not null,
  old_rent_kurus     bigint not null,
  rate_bp            integer not null,
  new_rent_kurus     bigint not null,
  source             text not null default 'tuik'
                       check (source in ('tuik', 'manual', 'contract')),
  source_note        text,
  status             text not null default 'proposed'
                       check (status in ('proposed', 'approved', 'cancelled')),
  note               text,
  approved_by_user_id uuid references app_user(id) on delete set null,
  approved_at        timestamptz,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now()
);

create unique index if not exists rent_revision_contract_period_uidx
  on rent_revision (contract_id, effective_period);

create index if not exists rent_revision_tenant_idx on rent_revision (tenant_id, status);

alter table rent_revision enable row level security;
alter table rent_revision force row level security;

drop policy if exists rent_revision_tenant_isolation on rent_revision;
create policy rent_revision_tenant_isolation on rent_revision
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
