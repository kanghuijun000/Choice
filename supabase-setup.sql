-- 리스크 게임 친구 기능 설정
-- Supabase 대시보드 > SQL Editor에서 이 파일 전체를 실행하세요.
-- 이 SQL은 기존 게임 데이터(localStorage)를 읽거나 수정하지 않습니다.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  friend_code text not null unique check (friend_code ~ '^\d{4}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.user_friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint user_friends_no_self check (user_id <> friend_id)
);

create index if not exists user_friends_friend_id_idx
  on public.user_friends(friend_id);

alter table public.profiles enable row level security;
alter table public.user_friends enable row level security;

drop policy if exists "profiles_select_self_or_friends" on public.profiles;
create policy "profiles_select_self_or_friends"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.user_friends f
      where f.user_id = (select auth.uid())
        and f.friend_id = profiles.id
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "friends_select_own" on public.user_friends;
create policy "friends_select_own"
  on public.user_friends for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "friends_insert_own" on public.user_friends;
create policy "friends_insert_own"
  on public.user_friends for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and friend_id <> (select auth.uid())
  );

drop policy if exists "friends_delete_own" on public.user_friends;
create policy "friends_delete_own"
  on public.user_friends for delete to authenticated
  using (user_id = (select auth.uid()));

-- 가입 시 고유한 4자리 코드를 발급합니다. 코드 충돌 시 다시 뽑습니다.
create or replace function public.create_risk_game_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  attempts integer := 0;
  chosen_name text;
begin
  chosen_name := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '플레이어')), 20);
  if chosen_name = '' then chosen_name := '플레이어'; end if;

  loop
    generated_code := lpad(floor(random() * 10000)::integer::text, 4, '0');
    attempts := attempts + 1;

    begin
      insert into public.profiles (id, display_name, friend_code)
      values (new.id, chosen_name, generated_code);
      exit;
    exception when unique_violation then
      if attempts >= 100 then
        raise exception '고유 친구 코드를 발급하지 못했습니다. 잠시 후 다시 시도하세요.';
      end if;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_risk_game on auth.users;
create trigger on_auth_user_created_risk_game
  after insert on auth.users
  for each row execute procedure public.create_risk_game_profile();

-- 친구 코드와 이름이 모두 일치하는 계정만 반환합니다.
create or replace function public.lookup_risk_game_friend(p_name text, p_code text)
returns table (id uuid, display_name text, friend_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.friend_code
  from public.profiles p
  where auth.uid() is not null
    and p.display_name = left(trim(p_name), 20)
    and p.friend_code = p_code
  limit 1;
$$;

revoke all on function public.lookup_risk_game_friend(text, text) from public, anon;
grant execute on function public.lookup_risk_game_friend(text, text) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_friends to authenticated;

-- 새로 만든 함수와 테이블은 인증 사용자에게만 필요한 권한을 줍니다.
