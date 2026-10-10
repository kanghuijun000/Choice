-- Add keyed 8-character substring fingerprints for recovery-password similarity checks.
-- This is a new migration so already-applied migrations remain immutable.
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

-- Keep fingerprints for the successful password, or restore the previous set on failure.
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
