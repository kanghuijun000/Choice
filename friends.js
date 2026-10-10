/* Risk Game: Supabase account + friend list.
   Requires supabase-config.js and the Supabase v2 browser library.
*/
(() => {
  "use strict";

  const config = window.RISK_GAME_SUPABASE_CONFIG || {};
  const configured =
    typeof config.url === "string" &&
    /^https:\/\//.test(config.url) &&
    !config.url.includes("YOUR_SUPABASE") &&
    typeof config.anonKey === "string" &&
    config.anonKey.length > 20 &&
    !config.anonKey.includes("YOUR_SUPABASE");

  const $ = id => document.getElementById(id);
  let client = null;
  let currentUser = null;
  let busy = false;

  function setMessage(message, isError = false) {
    const el = $("friendMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("friend-error", Boolean(isError));
  }

  function setAuthMessage(message, isError = false) {
    const el = $("friendAuthMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("friend-error", Boolean(isError));
  }

  function setBusy(value) {
    busy = value;
    ["friendSignUpButton", "friendSignInButton", "friendSignOutButton", "addFriendButton"]
      .forEach(id => {
        const button = $(id);
        if (button) button.disabled = value;
      });
  }

  function localProfile() {
    try {
      const value = JSON.parse(localStorage.getItem("risk-game-profile-v1") || "null");
      return value && typeof value.name === "string" ? value : { name: "플레이어", code: "" };
    } catch {
      return { name: "플레이어", code: "" };
    }
  }

  function saveCloudProfileLocally(profile) {
    try {
      if (typeof window.riskGameApplyCloudProfile === "function") {
        window.riskGameApplyCloudProfile(profile);
      } else {
        localStorage.setItem("risk-game-profile-v1", JSON.stringify({
          name: profile.display_name,
          code: profile.friend_code
        }));
      }
      $("friendMyCode").textContent = profile.display_name + "#" + profile.friend_code;
      return true;
    } catch (error) {
      console.error("프로필 표시 동기화 실패:", error);
      return null;
    }
  }

  function updateAccountUi() {
    const signedIn = Boolean(currentUser);
    $("friendAuthPanel").classList.toggle("hidden", signedIn);
    $("friendSignedInPanel").classList.toggle("hidden", !signedIn);
    $("friendAccountEmail").textContent = currentUser?.email || "";
    $("friendCloudStatus").textContent = !configured
      ? "Supabase 설정이 필요합니다."
      : signedIn
        ? "온라인 계정 연결됨 · 친구 목록 동기화 사용 가능"
        : "로그인하면 친구 목록을 다른 기기와 동기화할 수 있습니다.";
    $("friendAccountSummary").textContent = signedIn
      ? "계정 연결됨"
      : "로그인 필요";
  }

  async function fetchMyProfile() {
    if (!client || !currentUser) return null;
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, friend_code")
      .eq("id", currentUser.id)
      .single();
    if (error) throw error;
    saveCloudProfileLocally(data);
    $("friendMyCode").textContent = data.display_name + "#" + data.friend_code;
    return data;
  }

  function makeFriendRow(friend) {
    const row = document.createElement("div");
    row.className = "friend-row";

    const details = document.createElement("div");
    details.className = "friend-row-details";

    const name = document.createElement("strong");
    name.textContent = friend.display_name;

    const code = document.createElement("span");
    code.textContent = "#" + friend.friend_code;

    details.append(name, code);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "friend-remove-button";
    remove.textContent = "삭제";
    remove.setAttribute("aria-label", friend.display_name + " 친구 삭제");
    remove.addEventListener("click", () => removeFriend(friend.id, friend.display_name));

    row.append(details, remove);
    return row;
  }

  async function loadFriends() {
    const list = $("friendList");
    list.replaceChildren();

    if (!client || !currentUser) {
      const empty = document.createElement("p");
      empty.className = "muted friend-empty";
      empty.textContent = "로그인하면 친구 목록을 불러올 수 있습니다.";
      list.append(empty);
      return;
    }

    const { data: links, error: linksError } = await client
      .from("user_friends")
      .select("friend_id")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true });

    if (linksError) throw linksError;

    const ids = (links || []).map(item => item.friend_id);
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.className = "muted friend-empty";
      empty.textContent = "아직 추가한 친구가 없습니다.";
      list.append(empty);
      return;
    }

    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, display_name, friend_code")
      .in("id", ids);

    if (profilesError) throw profilesError;

    const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
    ids.forEach(id => {
      const friend = byId.get(id);
      if (friend) list.append(makeFriendRow(friend));
    });
  }

  async function refreshCloudData() {
    if (!client || !currentUser) {
      updateAccountUi();
      await loadFriends();
      return;
    }
    try {
      await fetchMyProfile();
      await loadFriends();
      updateAccountUi();
    } catch (error) {
      console.error(error);
      setMessage("계정 정보를 불러오지 못했습니다. Supabase SQL 설정과 연결 상태를 확인하세요.", true);
    }
  }

  async function handleAuthState(session) {
    currentUser = session?.user || null;
    updateAccountUi();
    if (currentUser) {
      await refreshCloudData();
    } else {
      await loadFriends();
      setMessage("");
    }
  }

  async function signUp() {
    if (busy) return;
    if (!client) return setAuthMessage("먼저 Supabase 설정 파일을 완성해야 합니다.", true);
    const email = $("friendEmail").value.trim();
    const password = $("friendPassword").value;
    const name = localProfile().name.trim().slice(0, 20) || "플레이어";
    if (!email || !password) return setAuthMessage("이메일과 비밀번호를 입력하세요.", true);
    if (password.length < 8) return setAuthMessage("비밀번호는 8자 이상으로 입력하세요.", true);

    setBusy(true);
    setAuthMessage("");
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } }
      });
      if (error) throw error;
      if (data.session) {
        await handleAuthState(data.session);
        setAuthMessage("계정이 만들어졌습니다. 친구 코드를 확인하세요.");
      } else {
        setAuthMessage("가입 요청이 완료되었습니다. 이메일 인증이 켜져 있다면 인증 후 로그인하세요.");
      }
    } catch (error) {
      setAuthMessage(error.message || "가입에 실패했습니다.", true);
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (busy) return;
    if (!client) return setAuthMessage("먼저 Supabase 설정 파일을 완성해야 합니다.", true);
    const email = $("friendEmail").value.trim();
    const password = $("friendPassword").value;
    if (!email || !password) return setAuthMessage("이메일과 비밀번호를 입력하세요.", true);

    setBusy(true);
    setAuthMessage("");
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleAuthState(data.session);
      setAuthMessage("로그인했습니다. 친구 목록이 동기화되었습니다.");
    } catch (error) {
      setAuthMessage(error.message || "로그인에 실패했습니다.", true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy || !client) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      currentUser = null;
      updateAccountUi();
      await loadFriends();
      setMessage("로그아웃했습니다. 이 기기의 게임 진행 데이터는 그대로 유지됩니다.");
    } catch (error) {
      setMessage(error.message || "로그아웃에 실패했습니다.", true);
    } finally {
      setBusy(false);
    }
  }

  async function addFriend() {
    if (busy) return;
    if (!client || !currentUser) {
      return setMessage("친구를 추가하려면 먼저 온라인 계정으로 로그인하세요.", true);
    }

    const input = $("friendCodeInput").value.trim();
    const match = input.match(/^(.+)#(\d{4})$/);
    if (!match) return setMessage("이름#4자리코드 형식으로 입력하세요. 예: 이름#0123", true);

    const name = match[1].trim();
    const code = match[2];
    if (!name || name.length > 20) return setMessage("이름을 확인하세요.", true);

    setBusy(true);
    setMessage("");
    try {
      const { data: matches, error: lookupError } = await client.rpc(
        "lookup_risk_game_friend",
        { p_name: name, p_code: code }
      );
      if (lookupError) throw lookupError;
      const target = Array.isArray(matches) ? matches[0] : matches;
      if (!target) return setMessage("일치하는 계정을 찾지 못했습니다. 이름과 4자리 코드를 확인하세요.", true);
      if (target.id === currentUser.id) return setMessage("자기 자신은 친구로 추가할 수 없습니다.", true);

      const { error: insertError } = await client.from("user_friends").insert({
        user_id: currentUser.id,
        friend_id: target.id
      });
      if (insertError?.code === "23505") {
        return setMessage("이미 친구 목록에 있는 계정입니다.", true);
      }
      if (insertError) throw insertError;

      $("friendCodeInput").value = "";
      await loadFriends();
      setMessage(target.display_name + " 님을 친구로 추가했습니다.");
    } catch (error) {
      console.error(error);
      setMessage("친구 추가에 실패했습니다. Supabase SQL 설정과 연결 상태를 확인하세요.", true);
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend(friendId, friendName) {
    if (!client || !currentUser || busy) return;
    if (!window.confirm(friendName + " 님을 친구 목록에서 삭제할까요?")) return;
    setBusy(true);
    try {
      const { error } = await client.from("user_friends")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("friend_id", friendId);
      if (error) throw error;
      await loadFriends();
      setMessage(friendName + " 님을 친구 목록에서 삭제했습니다.");
    } catch (error) {
      setMessage("친구 삭제에 실패했습니다.", true);
    } finally {
      setBusy(false);
    }
  }

  async function updateCloudName(detail) {
    if (!client || !currentUser || !detail || !detail.name) return;
    try {
      const { error } = await client.from("profiles")
        .update({ display_name: detail.name.trim().slice(0, 20) })
        .eq("id", currentUser.id);
      if (error) throw error;
      await fetchMyProfile();
      await loadFriends();
    } catch (error) {
      console.error("온라인 계정 이름 동기화 실패:", error);
      setMessage("이름은 이 기기에 저장됐지만 온라인 계정 동기화에는 실패했습니다.", true);
    }
  }

  function init() {
    if (configured && window.supabase?.createClient) {
      client = window.supabase.createClient(config.url, config.anonKey);
    }

    $("friendSignUpButton").addEventListener("click", signUp);
    $("friendSignInButton").addEventListener("click", signIn);
    $("friendSignOutButton").addEventListener("click", signOut);
    $("addFriendButton").addEventListener("click", addFriend);
    $("friendCodeInput").addEventListener("keydown", event => {
      if (event.key === "Enter") addFriend();
    });
    $("friendPassword").addEventListener("keydown", event => {
      if (event.key === "Enter") signIn();
    });

    $("friendMenuButton").addEventListener("click", async () => {
      setMessage("");
      if (!configured) {
        setMessage("supabase-config.js에 프로젝트 URL과 공개용 키를 설정한 뒤 SQL 설정 파일을 실행하세요.", true);
      }
      if (currentUser) await refreshCloudData();
    });

    window.addEventListener("risk-game-profile-updated", event => {
      updateCloudName(event.detail);
    });

    updateAccountUi();

    if (!configured) {
      setAuthMessage("Supabase 연결 전입니다. 설정 파일과 데이터베이스 SQL을 먼저 준비하세요.", true);
      $("friendMyCode").textContent = "온라인 계정 연결 전";
    } else if (!window.supabase?.createClient) {
      setAuthMessage("Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.", true);
    } else {
      client.auth.getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          return handleAuthState(data.session);
        })
        .catch(error => setAuthMessage(error.message || "로그인 상태 확인 실패", true));

      client.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
        updateAccountUi();
        if (currentUser) setTimeout(() => refreshCloudData(), 0);
        else loadFriends();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
