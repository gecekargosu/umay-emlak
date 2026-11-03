-- TUR:25 — Komisyon ve kapora (bilgi bankası 9-C / Y-79).
-- Komisyon tablosu 0005'te kuruldu; burada RLS'i garantiye alıyoruz.
-- Kapora: ilan üzerinde tutulur; alınınca ilan "kaporalı"ya düşer.
alter table listing add column if not exists deposit_kurus bigint not null default 0;
alter table listing add column if not exists deposit_received_at date;

alter table commission enable row level security;
alter table commission force row level security;

drop policy if exists commission_tenant_isolation on commission;
create policy commission_tenant_isolation on commission
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
