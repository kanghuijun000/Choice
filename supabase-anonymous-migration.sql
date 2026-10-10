-- Risk Game 익명 계정 프로필 동기화 업데이트
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.
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

  if p_code ~ '^[0-9]{4}$' then
    begin
      update public.profiles p
        set display_name = chosen_name, friend_code = p_code
        where p.id = current_id;
    exception when unique_violation then
      update public.profiles p
        set display_name = chosen_name
        where p.id = current_id;
    end;
  else
    update public.profiles p
      set display_name = chosen_name
      where p.id = current_id;
  end if;

  return query
    select p.id, p.display_name, p.friend_code
    from public.profiles p
    where p.id = current_id;
end;
$sync$;

revoke all on function public.sync_risk_game_profile(text, text) from public, anon;
grant execute on function public.sync_risk_game_profile(text, text) to authenticated;
