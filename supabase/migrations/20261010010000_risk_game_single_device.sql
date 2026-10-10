-- Enforce one active app installation per recoverable Risk Game account.
create table if not exists public.risk_game_device_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[0-9a-fA-F-]{36}$'),
  updated_at timestamptz not null default now()
);

alter table public.risk_game_device_sessions enable row level security;
revoke all on public.risk_game_device_sessions from anon, authenticated;
grant all on public.risk_game_device_sessions to service_role;
