-- TUR:46 — Denetim kaydı (K-6 / SIRA 10).
-- "Kim ne yaptı" sorusunun cevabı: her yazma isteği (POST/PATCH/PUT/DELETE) başarılıysa
-- bir satır yazılır. Kayıt silinmez, değiştirilmez; yalnız eklenir.
-- request_ref, yanıtta dönen "kayıt no" ile aynıdır (x-request-id başlığı).
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  user_id     uuid references app_user(id) on delete set null,
  request_ref text,
  method      text not null,
  path        text not null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  status      integer,
  summary     text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_tenant_time_idx on audit_log (tenant_id, created_at desc);
create index if not exists audit_log_entity_idx on audit_log (tenant_id, entity_type, entity_id);

alter table audit_log enable row level security;
alter table audit_log force row level security;

drop policy if exists audit_log_tenant_isolation on audit_log;
create policy audit_log_tenant_isolation on audit_log
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert on audit_log to umay_app;
