import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function digestPassword(password: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 10 &&
    password.length <= 128 && !password.includes("\u0000");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "지원하지 않는 요청입니다." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const hmacSecret = Deno.env.get("RECOVERY_HMAC_SECRET")!;
  if (!url || !anonKey || !serviceKey || !hmacSecret || hmacSecret.length < 32) {
    return reply({ error: "계정 복구 서버 설정이 완료되지 않았습니다." }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "요청 내용을 읽을 수 없습니다." }, 400); }
  const action = body.action;
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "lookup") {
    const password = body.password;
    if (!validPassword(password)) return reply({ error: "복구 비밀번호가 올바르지 않습니다." }, 400);
    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const clientIp = forwardedFor.split(",")[0].trim().slice(0, 128);
    const ipHash = await digestPassword(clientIp, hmacSecret);
    const { data: allowed, error: limitError } = await service.rpc("consume_risk_game_recovery_attempt", {
      p_ip_hash: ipHash, p_limit: 8,
    });
    if (limitError) return reply({ error: "복구 서버의 보안 제한 기능이 준비되지 않았습니다. 잠시 후 다시 시도하세요." }, 503);
    if (allowed !== true) return reply({ error: "시도 횟수가 너무 많습니다. 1분 뒤 다시 시도하세요." }, 429);

    const digest = await digestPassword(password, hmacSecret);
    const { data, error } = await service.from("risk_game_recovery_credentials")
      .select("synthetic_email").eq("password_digest", digest).maybeSingle();
    if (error || !data) return reply({ error: "복구 비밀번호가 일치하는 계정을 찾지 못했습니다." }, 401);
    return reply({ email: data.synthetic_email });
  }

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\\s+/i, "");
  if (!token) return reply({ error: "로그인된 계정이 필요합니다." }, 401);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "계정을 확인할 수 없습니다. 다시 연결해 주세요." }, 401);
  const user = authData.user;

  if (action === "register" || action === "change") {
    const password = body.password;
    if (!validPassword(password)) return reply({ error: "비밀번호는 10~128자로 설정해 주세요." }, 400);
    const digest = await digestPassword(password, hmacSecret);
    const email = `rg-${digest.slice(0, 60)}@recovery.risk-game.invalid`;

    if (action === "change") {
      const oldPassword = body.oldPassword;
      if (!validPassword(oldPassword)) return reply({ error: "기존 비밀번호가 일치하지 않습니다." }, 400);
      const oldDigest = await digestPassword(oldPassword, hmacSecret);
      const { data: existing, error } = await service.from("risk_game_recovery_credentials")
        .select("password_digest").eq("user_id", user.id).maybeSingle();
      if (error || !existing || existing.password_digest !== oldDigest) {
        return reply({ error: "기존 비밀번호가 일치하지 않습니다." }, 401);
      }
      if (oldDigest === digest) return reply({ error: "기존 비밀번호와 다른 비밀번호를 입력해 주세요." }, 400);
    } else {
      const { data: existing } = await service.from("risk_game_recovery_credentials")
        .select("user_id").eq("user_id", user.id).maybeSingle();
      if (existing) return reply({ error: "이미 복구 비밀번호가 설정되어 있습니다. 변경 기능을 이용해 주세요." }, 409);
    }

    const { data: collision } = await service.from("risk_game_recovery_credentials")
      .select("user_id").eq("password_digest", digest).maybeSingle();
    if (collision && collision.user_id !== user.id) {
      return reply({ error: "이미 사용 중인 비밀번호입니다. 다른 비밀번호를 선택해 주세요." }, 409);
    }

    const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
      email, password, email_confirm: true,
    });
    if (updateError) return reply({ error: "복구 로그인 설정에 실패했습니다: " + updateError.message }, 500);

    const { error: saveError } = await service.from("risk_game_recovery_credentials").upsert({
      user_id: user.id, password_digest: digest, synthetic_email: email, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveError) return reply({ error: "복구 정보 저장에 실패했습니다." }, 500);
    return reply({ ok: true });
  }

  if (action === "save_state") {
    const payload = body.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return reply({ error: "게임 데이터를 확인할 수 없습니다." }, 400);
    }
    const { error } = await service.from("risk_game_saves").upsert({
      user_id: user.id, payload, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return reply({ error: "게임 데이터 동기화에 실패했습니다." }, 500);
    return reply({ ok: true });
  }

  if (action === "load_state") {
    const { data, error } = await service.from("risk_game_saves")
      .select("payload, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) return reply({ error: "게임 데이터를 불러오지 못했습니다." }, 500);
    return reply({ payload: data?.payload ?? null, updated_at: data?.updated_at ?? null });
  }

  return reply({ error: "알 수 없는 작업입니다." }, 400);
});
