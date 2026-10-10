-- Risk Game account recovery and cloud save tables.
create table if not exists public.risk_game_recovery_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_digest text not null unique,
  synthetic_email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.risk_game_recovery_credentials enable row level security;
alter table public.risk_game_saves enable row level security;

-- These tables are intentionally accessible only through the Edge Function's service-role client.
drop policy if exists "no direct recovery credential access" on public.risk_game_recovery_credentials;
drop policy if exists "users can read own save" on public.risk_game_saves;
drop policy if exists "users can insert own save" on public.risk_game_saves;
drop policy if exists "users can update own save" on public.risk_game_saves;

revoke all on public.risk_game_recovery_credentials from anon, authenticated;
revoke all on public.risk_game_saves from anon, authenticated;
grant all on public.risk_game_recovery_credentials to service_role;
grant all on public.risk_game_saves to service_role;
