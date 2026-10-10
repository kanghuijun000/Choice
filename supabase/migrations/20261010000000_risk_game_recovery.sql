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

-- Track keyed fingerprints of every 8-character substring without storing recovery passwords.
-- Fingerprints are generated only by the Edge Function and can only be managed by service_role.
create table if not exists public.risk_game_recovery_fingerprints (
  fingerprint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists risk_game_recovery_fingerprints_user_id_idx
  on public.risk_game_recovery_fingerprints(user_id);
alter table public.risk_game_recovery_fingerprints enable row level security;
revoke all on public.risk_game_recovery_fingerprints from anon, authenticated;
grant all on public.risk_game_recovery_fingerprints to service_role;

-- Serialize reservations so two accounts cannot claim overlapping fingerprints concurrently.
create or replace function public.reserve_risk_game_recovery_fingerprints(
  p_user_id uuid,
  p_fingerprints text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_fingerprints is null or cardinality(p_fingerprints) = 0 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('risk-game-recovery-fingerprints'));

  if exists (
    select 1
    from public.risk_game_recovery_fingerprints f
    where f.fingerprint = any(p_fingerprints)
      and f.user_id <> p_user_id
  ) then
    return false;
  end if;

  insert into public.risk_game_recovery_fingerprints(fingerprint, user_id)
  select distinct value, p_user_id
  from unnest(p_fingerprints) as value
  on conflict (fingerprint) do nothing;

  return not exists (
    select 1
    from public.risk_game_recovery_fingerprints f
    where f.fingerprint = any(p_fingerprints)
      and f.user_id <> p_user_id
  );
end;
$$;
revoke all on function public.reserve_risk_game_recovery_fingerprints(uuid, text[]) from public, anon, authenticated;
grant execute on function public.reserve_risk_game_recovery_fingerprints(uuid, text[]) to service_role;

-- Remove stale fingerprints only after the credential update succeeds (or restore the old set on failure).
create or replace function public.keep_risk_game_recovery_fingerprints(
  p_user_id uuid,
  p_fingerprints text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  delete from public.risk_game_recovery_fingerprints
  where user_id = p_user_id
    and (
      p_fingerprints is null
      or not (fingerprint = any(p_fingerprints))
    );

  return true;
end;
$$;
revoke all on function public.keep_risk_game_recovery_fingerprints(uuid, text[]) from public, anon, authenticated;
grant execute on function public.keep_risk_game_recovery_fingerprints(uuid, text[]) to service_role;
