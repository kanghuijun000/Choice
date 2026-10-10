-- Risk Game: make friend_code immutable for the lifetime of each account.
-- Existing server-assigned codes become canonical; this migration never regenerates them.
create or replace function public.prevent_risk_game_friend_code_change()
returns trigger
language plpgsql
set search_path = ''
as $immutable$
begin
  if new.friend_code is distinct from old.friend_code then
    raise exception '이 계정의 고유 코드는 영구 식별자이므로 변경할 수 없습니다.';
  end if;

  if old.friend_code_locked and not new.friend_code_locked then
    raise exception '고유 코드 잠금은 해제할 수 없습니다.';
  end if;

  new.friend_code_locked := true;
  return new;
end;
$immutable$;

drop trigger if exists risk_game_friend_code_immutable on public.profiles;
create trigger risk_game_friend_code_immutable
  before update of friend_code, friend_code_locked on public.profiles
  for each row execute function public.prevent_risk_game_friend_code_change();

-- Freeze current codes as-is. Do not assign or regenerate any code here.
update public.profiles set friend_code_locked = true
where friend_code_locked is distinct from true;

alter table public.profiles
  alter column friend_code_locked set default true;

-- Syncing an existing account may update its display name, never its friend code.
create or replace function public.sync_risk_game_profile(p_name text, p_code text)
returns table (id uuid, display_name text, friend_code text)
language plpgsql
security definer
set search_path = ''
as $sync$
declare
  current_id uuid := auth.uid();
  chosen_name text;
begin
  if current_id is null then
    raise exception '온라인 계정 연결이 필요합니다.';
  end if;

  chosen_name := left(trim(coalesce(p_name, '플레이어')), 20);
  if chosen_name = '' then chosen_name := '플레이어'; end if;

  update public.profiles p
    set display_name = chosen_name
    where p.id = current_id;

  if not found then
    raise exception '계정 프로필이 없습니다. 페이지를 새로고침해 다시 시도하세요.';
  end if;

  return query
    select p.id, p.display_name, p.friend_code
    from public.profiles p
    where p.id = current_id;
end;
$sync$;

revoke all on function public.sync_risk_game_profile(text, text) from public, anon;
grant execute on function public.sync_risk_game_profile(text, text) to authenticated;
