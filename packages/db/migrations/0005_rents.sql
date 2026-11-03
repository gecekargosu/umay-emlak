-- UMAY EMLAK · Migration 0005 — Dilim 4: kira hattı
-- K-21: tahsilat yöntemi ve elden teslim alan kayda geçer (payment tablosu hazır).
-- K-22: kira takip bedeli ELLE girilir; oran zorlanmaz.
-- K-25: mal sahibine dönem aktarımı ayrı kayıttır, tahsilatla karışmaz.

alter table contract add column if not exists ended_at timestamptz;
alter table contract add column if not exists end_reason text;

-- Gecikme kademeleri: hatırlatma ve ihtarname tarihleri (K-28)
alter table charge add column if not exists reminded_at timestamptz;
alter table charge add column if not exists notice_sent_at timestamptz;

create table if not exists charge_notice (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  charge_id          uuid not null references charge(id) on delete cascade,
  level              text not null check (level in ('reminder', 'formal')),
  channel            text not null default 'phone',
  note               text,
  sent_by_user_id    uuid references app_user(id) on delete set null,
  sent_at            timestamptz not null default now()
);
create index if not exists charge_notice_tenant_idx
  on charge_notice (tenant_id, charge_id, sent_at desc);

-- Mal sahibine dönem aktarımı: tahsil edilen - takip bedeli - masraf = net
create table if not exists owner_payout (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  contract_id        uuid not null references contract(id) on delete restrict,
  period             date not null,
  gross_kurus        bigint not null,
  fee_kurus          bigint not null default 0,
  expense_kurus      bigint not null default 0,
  net_kurus          bigint not null,
  status             text not null default 'draft' check (status in ('draft', 'paid')),
  paid_at            timestamptz,
  method             payment_method,
  note               text,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint owner_payout_net_nonnegative check (net_kurus >= 0)
);
create unique index if not exists owner_payout_contract_period_uidx
  on owner_payout (contract_id, period);
create index if not exists owner_payout_tenant_period_idx
  on owner_payout (tenant_id, period desc);

-- RLS: yeni kiracı tabloları (0001 ile aynı desen, FORCE dahil)
do $$
declare
  t text;
begin
  foreach t in array array['charge_notice', 'owner_payout']
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
