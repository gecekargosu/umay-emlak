-- UMAY EMLAK · Migration 0002 — Dilim 1: giriş, oturum, ekip
-- Not: session ve password_reset tablolarında RLS YOK. Sebep: oturum
-- çözümlemesi kiracı bağlamı kurulmadan ÖNCE yapılır. Bu tablolara yalnız
-- sunucu, bildiği oturum kimliğiyle erişir; kiracı verisi taşımazlar.

alter table app_user add column if not exists password_updated_at timestamptz;
alter table app_user add column if not exists must_change_password boolean not null default true;
alter table app_user add column if not exists is_active boolean not null default true;

create table if not exists session (
  id          uuid primary key,
  user_id     uuid not null references app_user(id) on delete cascade,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  user_agent  text
);
create index if not exists session_user_idx on session (user_id);
create index if not exists session_expires_idx on session (expires_at);

create table if not exists password_reset (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  purpose     text not null default 'reset',
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_reset_user_idx on password_reset (user_id);

-- Ekip listesinde e-posta ile arama hızlı olsun
create index if not exists app_user_email_lower_idx on app_user (lower(email));
