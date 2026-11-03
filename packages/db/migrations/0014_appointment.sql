-- TUR:31 — Randevu / yer gösterme (SIRA 5).
-- Aday + (varsa) portföy + personel + zaman + yer; sonuç: geldi / gelmedi / iptal.
-- Sonuçtan teklife bağlantı kurulabilir (offer_id). Randevu silinmez, durumu değişir.
create table if not exists appointment (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  person_id         uuid not null references person(id) on delete cascade,
  listing_id        uuid references listing(id) on delete set null,
  staff_user_id     uuid references app_user(id) on delete set null,
  scheduled_at      timestamptz not null,
  duration_min      integer not null default 30,
  place             text,
  status            text not null default 'planned'
                      check (status in ('planned', 'done', 'no_show', 'cancelled')),
  result_note       text,
  offer_id          uuid references offer(id) on delete set null,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists appointment_tenant_time_idx on appointment (tenant_id, scheduled_at);
create index if not exists appointment_person_idx on appointment (tenant_id, person_id);

alter table appointment enable row level security;
alter table appointment force row level security;

drop policy if exists appointment_tenant_isolation on appointment;
create policy appointment_tenant_isolation on appointment
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
