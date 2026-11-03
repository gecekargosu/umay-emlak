-- TUR:28 — Teslim tutanağı (SIRA 2).
-- Giriş/çıkışta demirbaş durumu ve depozito hesabı kayda geçer.
-- Tutanak silinmez; düzeltme yeni tutanakla yapılır.
create table if not exists handover_protocol (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  contract_id      uuid not null references contract(id) on delete cascade,
  kind             text not null check (kind in ('move_in', 'move_out')),
  happened_on      date not null,
  items            jsonb not null default '[]'::jsonb,
  deposit_kurus    bigint not null default 0,
  deduction_kurus  bigint not null default 0,
  deduction_note   text,
  refund_kurus     bigint not null default 0,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists handover_contract_idx on handover_protocol (tenant_id, contract_id);

alter table handover_protocol enable row level security;
alter table handover_protocol force row level security;

drop policy if exists handover_tenant_isolation on handover_protocol;
create policy handover_tenant_isolation on handover_protocol
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
