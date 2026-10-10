-- Risk Game 고유 코드 불변성 및 익명 계정 프로필 동기화 업데이트
-- Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 기존 게임 진행 데이터와 친구 관계 데이터는 삭제하지 않습니다.
alter table public.profiles
  add column if not exists friend_code_locked boolean not null default false;

-- 최초 동기화에서만 기기에 저장된 코드를 등록합니다. 잠긴 코드는 이후 변경하지 않습니다.
create or replace function public.sync_risk_game_profile(p_name text, p_code text)
returns table (id uuid, display_name text, friend_code text)
language plpgsql
security definer
set search_path = ''
as $sync$
declare
  current_id uuid := auth.uid();
  chosen_name text;
  current_code text;
  is_locked boolean;
begin
  if current_id is null then
    raise exception '온라인 계정 연결이 필요합니다.';
  end if;
  chosen_name := left(trim(coalesce(p_name, '플레이어')), 20);
  if chosen_name = '' then chosen_name := '플레이어'; end if;

  select p.friend_code, p.friend_code_locked
    into current_code, is_locked
    from public.profiles p where p.id = current_id for update;
  if not found then
    raise exception '계정 프로필이 없습니다. 페이지를 새로고침해 다시 시도하세요.';
  end if;

  if coalesce(is_locked, false) then
    if p_code ~ '^[0-9]{4}$' and p_code <> current_code then
      raise exception '이 계정의 고유 코드는 이미 발급되어 변경할 수 없습니다.';
    end if;
    update public.profiles p set display_name = chosen_name where p.id = current_id;
  elsif p_code ~ '^[0-9]{4}$' then
    begin
      update public.profiles p
        set display_name = chosen_name, friend_code = p_code, friend_code_locked = true
        where p.id = current_id;
    exception when unique_violation then
      raise exception '기기에 저장된 고유 코드가 이미 다른 계정에서 사용 중입니다. 기존 코드는 변경하지 않았습니다.';
    end;
  else
    update public.profiles p
      set display_name = chosen_name, friend_code_locked = true
      where p.id = current_id;
  end if;

  return query select p.id, p.display_name, p.friend_code
    from public.profiles p where p.id = current_id;
end;
$sync$;

revoke all on function public.sync_risk_game_profile(text, text) from public, anon;
grant execute on function public.sync_risk_game_profile(text, text) to authenticated;


-- 친구 요청 수락 시 양쪽 계정에 친구 관계를 모두 저장합니다.
create or replace function public.accept_risk_game_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $accept$
declare
  requester_id uuid;
begin
  if auth.uid() is null then
    raise exception '온라인 계정 연결이 필요합니다.';
  end if;

  update public.friend_requests
    set status = 'accepted'
    where id = p_request_id
      and receiver_id = auth.uid()
      and status = 'pending'
    returning sender_id into requester_id;

  if requester_id is null then
    raise exception '처리할 수 있는 친구 요청이 없습니다. 요청이 이미 처리되었거나 취소되었습니다.';
  end if;

  insert into public.user_friends(user_id, friend_id)
    values (auth.uid(), requester_id)
    on conflict do nothing;

  insert into public.user_friends(user_id, friend_id)
    values (requester_id, auth.uid())
    on conflict do nothing;
end;
$accept$;

revoke all on function public.accept_risk_game_friend_request(uuid) from public, anon;
grant execute on function public.accept_risk_game_friend_request(uuid) to authenticated;

-- 한쪽이 친구를 삭제하면 양쪽의 관계 행을 함께 삭제합니다.
create or replace function public.remove_risk_game_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $remove$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception '온라인 계정 연결이 필요합니다.';
  end if;

  if p_friend_id is null or p_friend_id = auth.uid() then
    raise exception '삭제할 친구 계정을 확인할 수 없습니다.';
  end if;

  delete from public.user_friends
    where (user_id = auth.uid() and friend_id = p_friend_id)
       or (user_id = p_friend_id and friend_id = auth.uid());

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception '이미 삭제되었거나 친구 관계가 존재하지 않습니다.';
  end if;
end;
$remove$;

revoke all on function public.remove_risk_game_friend(uuid) from public, anon;
grant execute on function public.remove_risk_game_friend(uuid) to authenticated;
