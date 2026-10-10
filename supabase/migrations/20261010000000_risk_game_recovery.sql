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

-- A server-side per-IP lookup limit slows automated password guessing.
create table if not exists public.risk_game_recovery_attempts (
  ip_hash text not null,
  bucket_start timestamptz not null,
  attempts integer not null default 0,
  primary key (ip_hash, bucket_start)
);
alter table public.risk_game_recovery_attempts enable row level security;
revoke all on public.risk_game_recovery_attempts from anon, authenticated;
grant all on public.risk_game_recovery_attempts to service_role;

create or replace function public.consume_risk_game_recovery_attempt(p_ip_hash text, p_limit integer default 8)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
  current_bucket timestamptz := date_trunc('minute', now());
begin
  insert into public.risk_game_recovery_attempts(ip_hash, bucket_start, attempts)
  values (p_ip_hash, current_bucket, 1)
  on conflict (ip_hash, bucket_start)
  do update set attempts = public.risk_game_recovery_attempts.attempts + 1
  returning attempts into current_attempts;

  delete from public.risk_game_recovery_attempts
  where bucket_start < now() - interval '2 hours';

  return current_attempts <= greatest(1, least(p_limit, 20));
end;
$$;
revoke all on function public.consume_risk_game_recovery_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.consume_risk_game_recovery_attempt(text, integer) to service_role;
