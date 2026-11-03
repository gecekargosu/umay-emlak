-- UMAY EMLAK · Migration 0006 — MülkPro devir belgesinde olup bizde olmayanlar
-- Y-53: sözleşme anlık görüntüsü (imza anındaki kişi/mülk/kira donar)
alter table contract add column if not exists snapshot jsonb;
-- Y-60: EİDS / ilan yetki numarası (kayıt alanı; resmî doğrulama değil)
alter table listing add column if not exists authority_no text;
-- Y-54: aday CRM'i
alter table person add column if not exists candidate_stage text;
alter table person add column if not exists follow_up_date date;
alter table person add column if not exists budget_kurus bigint;
alter table person add column if not exists wants_district text;
alter table person add column if not exists wants_room_count text;
-- Y-59: iletişim izni / ret geçmişi (KVKK)
alter table person add column if not exists contact_permission text not null default 'unknown';
alter table person add column if not exists contact_permission_at timestamptz;
alter table person add column if not exists contact_permission_note text;

do $$
begin
  alter table person add constraint person_contact_permission_chk
    check (contact_permission in ('unknown', 'allowed', 'denied'));
exception
  when duplicate_object then null;
end $$;

-- Görüşme notları (aday CRM'i)
create table if not exists person_note (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  person_id          uuid not null references person(id) on delete cascade,
  body               text not null,
  created_by_user_id uuid references app_user(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists person_note_person_idx
  on person_note (tenant_id, person_id, created_at desc);

-- Y-55: mülk abonelikleri (elektrik/su/internet — yalnız kayıt)
create table if not exists property_subscription (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  property_id    uuid not null references property(id) on delete cascade,
  kind           text not null,
  provider       text,
  subscriber_no  text,
  monthly_kurus  bigint,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists property_subscription_property_idx
  on property_subscription (tenant_id, property_id);

-- Y-55: demirbaş listesi
create table if not exists property_fixture (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  property_id uuid not null references property(id) on delete cascade,
  name        text not null,
  quantity    integer not null default 1,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists property_fixture_property_idx
  on property_fixture (tenant_id, property_id);

-- RLS: yeni kiracı tabloları (0001/0005 ile aynı desen, FORCE dahil)
do $$
declare
  t text;
begin
  foreach t in array array['person_note', 'property_subscription', 'property_fixture']
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
