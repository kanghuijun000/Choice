"use strict";

const STORAGE_KEY = "risk-game-state-v6";
const LEGACY_KEYS = [
  "risk-game-state-v5",
  "risk-game-state-v4",
  "risk-game-state-v3",
  "riskGameState",
  "risk-game",
  "riskGame",
  "gameState"
];

const MAX_MONEY = 9000000000000;
const BANK_MINUTE_MS = 60000;
const WAGE_AMOUNT = 5000;
const WAGE_COOLDOWN_MS = 3600000;

const $ = id => document.getElementById(id);
const moneyFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_MONEY, Math.floor(n));
}

function addMoney(a, b) {
  return clampMoney(clampMoney(a) + clampMoney(b));
}

function moneyText(value) {
  return moneyFormat.format(clampMoney(value)) + "원";
}

function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" +
    String(n % 60).padStart(2, "0");
}

/* =========================
   선택지
   수익이 지나치게 빠르게 누적되지 않도록
   효과와 패널티 확률을 조정함.
========================= */

const SAFE_CHOICES = [
  {
    id: "safe3",
    effect: 3,
    title: "+3%",
    penalty: "패널티: 10% 확률로 10% 손실",
    penaltyChance: 10,
    penaltyType: "loss10"
  },
  {
    id: "safe5",
    effect: 5,
    title: "+5%",
    penalty: "패널티: 12% 확률로 10% 손실",
    penaltyChance: 12,
    penaltyType: "loss10"
  },
  {
    id: "safe7",
    effect: 7,
    title: "+7%",
    penalty: "패널티: 15% 확률로 15% 손실",
    penaltyChance: 15,
    penaltyType: "loss15"
  },
  {
    id: "safe10",
    effect: 10,
    title: "+10%",
    penalty: "패널티: 20% 확률로 20% 손실",
    penaltyChance: 20,
    penaltyType: "loss20"
  },
  {
    id: "safeMinus5",
    effect: -5,
    title: "−5%",
    penalty: "패널티: 10% 확률로 다음 턴 색상 제한",
    penaltyChance: 10,
    penaltyType: "force"
  }
];

const RISKY_CHOICES = [
  {
    id: "risk8",
    effect: 8,
    title: "+8%",
    penalty: "패널티: 25% 확률로 25% 손실",
    penaltyChance: 25,
    penaltyType: "loss25"
  },
  {
    id: "risk12",
    effect: 12,
    title: "+12%",
    penalty: "패널티: 30% 확률로 25% 손실",
    penaltyChance: 30,
    penaltyType: "loss25"
  },
  {
    id: "risk18",
    effect: 18,
    title: "+18%",
    penalty: "패널티: 40% 확률로 35% 손실",
    penaltyChance: 40,
    penaltyType: "loss35"
  },
  {
    id: "risk25",
    effect: 25,
    title: "+25%",
    penalty: "패널티: 50% 확률로 40% 손실",
    penaltyChance: 50,
    penaltyType: "loss40"
  },
  {
    id: "risk35",
    effect: 35,
    title: "+35%",
    penalty: "패널티: 60% 확률로 50% 손실",
    penaltyChance: 60,
    penaltyType: "loss50"
  },
  {
    id: "risk50",
    effect: 50,
    title: "+50%",
    penalty: "패널티: 70% 확률로 60% 손실",
    penaltyChance: 70,
    penaltyType: "loss60"
  },
  {
    id: "riskMinus10",
    effect: -10,
    title: "−10%",
    penalty: "패널티: 30% 확률로 25% 추가 손실",
    penaltyChance: 30,
    penaltyType: "loss25"
  },
  {
    id: "riskMinus20",
    effect: -20,
    title: "−20%",
    penalty: "패널티: 40% 확률로 35% 추가 손실",
    penaltyChance: 40,
    penaltyType: "loss35"
  }
];

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffledPair(a, b) {
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function samePair(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) ||
      a.length !== 2 || b.length !== 2) return false;

  return (
    (a[0].id === b[0].id && a[1].id === b[1].id) ||
    (a[0].id === b[1].id && a[1].id === b[0].id)
  );
}

function generateChoices(previous = null) {
  const possible = [];

  for (const safe of SAFE_CHOICES) {
    for (const risky of RISKY_CHOICES) {
      const pair = shuffledPair({ ...safe }, { ...risky });
      if (!samePair(pair, previous)) possible.push(pair);
    }
  }

  if (possible.length) return randomItem(possible);

  return shuffledPair({ ...SAFE_CHOICES[0] }, { ...RISKY_CHOICES[0] });
}

function findChoice(id) {
  return [...SAFE_CHOICES, ...RISKY_CHOICES].find(c => c.id === id);
}

function normalizeChoice(raw) {
  if (!raw || typeof raw !== "object") return null;

  const known = findChoice(raw.id);
  if (known && (raw.title === undefined || raw.penalty === undefined)) {
    return { ...known };
  }

  // 업데이트 전에 진행 중이던 게임의 선택지는 저장 당시 효과를 유지한다.
  const allowedPenaltyTypes = [
    "loss10", "loss15", "loss20", "loss25",
    "loss35", "loss40", "loss50", "loss60",
    "force", "totalLoss"
  ];

  if (
    typeof raw.id === "string" &&
    Number.isFinite(Number(raw.effect)) &&
    typeof raw.title === "string" &&
    typeof raw.penalty === "string" &&
    Number.isFinite(Number(raw.penaltyChance)) &&
    allowedPenaltyTypes.includes(raw.penaltyType)
  ) {
    return {
      id: raw.id,
      effect: Math.max(-100, Math.min(1000, Number(raw.effect))),
      title: raw.title,
      penalty: raw.penalty,
      penaltyChance: Math.max(0, Math.min(100, Number(raw.penaltyChance))),
      penaltyType: raw.penaltyType
    };
  }

  return known ? { ...known } : null;
}

/* =========================
   저장과 복구
========================= */

function defaultState() {
  return {
    budget: 10000,
    gameLimit: 5000,
    rerolls: 5,
    rerollCap: 5,
    bankPrincipal: 0,
    bankInterest: 0,
    bankRatePercent: 1,
    bankElapsedMs: 0,
    wageNextAt: 0,
    activeGame: null,
    pendingSummary: null
  };
}

function readObject(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;

  const state = {
    ...base,
    budget: clampMoney(raw.budget ?? raw.money ?? raw.balance ?? base.budget),
    gameLimit: clampMoney(raw.gameLimit ?? raw.maxGameMoney ?? base.gameLimit),
    rerolls: 0,
    rerollCap: 5,
    bankPrincipal: clampMoney(raw.bankPrincipal ?? raw.bankMoney ?? 0),
    bankInterest: clampMoney(raw.bankInterest ?? raw.interest ?? 0),
    bankRatePercent: Math.max(
      1,
      Math.min(10, Math.floor(Number(raw.bankRatePercent) || 1))
    ),
    bankElapsedMs: Math.max(
      0,
      Math.floor(Number(raw.bankElapsedMs) || 0) % BANK_MINUTE_MS
    ),
    wageNextAt: Math.max(0, Number(raw.wageNextAt) || 0),
    activeGame: null,
    pendingSummary: null
  };

  state.gameLimit = Math.max(1000, state.gameLimit || 5000);
  state.rerollCap = Math.max(5, Math.min(50,
    Math.floor((Number(raw.rerollCap) || 5) / 5) * 5));
  state.rerolls = Math.max(0, Math.min(
    state.rerollCap,
    Math.floor(Number(raw.rerolls ?? state.rerollCap) || 0)
  ));

  if (raw.activeGame && typeof raw.activeGame === "object") {
    const g = raw.activeGame;
    const choices = Array.isArray(g.choices)
      ? g.choices.map(normalizeChoice)
      : [];

    if (clampMoney(g.startAmount) > 0 &&
        choices.length === 2 && choices.every(Boolean)) {
      state.activeGame = {
        startAmount: clampMoney(g.startAmount),
        money: clampMoney(g.money),
        turn: Math.max(1, Math.floor(Number(g.turn) || 1)),
        choices,
        forcedColor: g.forcedColor === "blue" || g.forcedColor === "red"
          ? g.forcedColor : null
      };
    }
  }

  if (raw.pendingSummary && typeof raw.pendingSummary === "object") {
    state.pendingSummary = {
      startAmount: clampMoney(raw.pendingSummary.startAmount),
      finalAmount: clampMoney(raw.pendingSummary.finalAmount),
      reason: String(raw.pendingSummary.reason || "게임 종료")
    };
  }

  return state;
}

function findLegacyState() {
  for (const key of LEGACY_KEYS) {
    if (key === STORAGE_KEY) continue;
    const old = readObject(key);
    if (old) return old;
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === STORAGE_KEY || !/risk|game/i.test(key)) continue;

      const old = readObject(key);
      if (old && (
        "budget" in old || "money" in old ||
        "gameLimit" in old || "rerolls" in old
      )) return old;
    }
  } catch {}

  return null;
}

function loadState() {
  const current = readObject(STORAGE_KEY);
  if (current) return normalizeState(current);

  const old = findLegacyState();
  if (old) {
    const migrated = normalizeState(old);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch {}
    return migrated;
  }

  return defaultState();
}

let state = loadState();
let currentScreen = "homeScreen";
let currentBankTab = "bank";
let moneyModalMode = null;
let saveTimer = null;
let lastActiveTick = document.visibilityState === "visible" ? Date.now() : null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("saveStatus").textContent = "저장됨";
    $("saveStatus").style.color = "var(--green)";
    return true;
  } catch (error) {
    $("saveStatus").textContent = "저장 실패";
    $("saveStatus").style.color = "#ff8295";
    console.error("저장 실패", error);
    return false;
  }
}

function scheduleSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState();
  }, 100);
}

/* =========================
   화면 이동
========================= */

const TITLES = {
  homeScreen: "리스크 게임",
  amountScreen: "게임 금액 설정",
  gameScreen: "게임",
  summaryScreen: "게임 결과",
  shopScreen: "상점",
  settingsScreen: "설정",
  moneyScreen: "돈 관리"
};

function showScreen(id) {
  if (state.activeGame && id !== "gameScreen") return;
  if (state.pendingSummary && id !== "summaryScreen") return;

  const target = $(id);
  if (!target) return;

  document.querySelectorAll("main .screen").forEach(screen => {
    screen.classList.toggle("hidden", screen.id !== id);
  });

  currentScreen = id;
  $("headerTitle").textContent = TITLES[id] || "리스크 게임";

  $("backButton").classList.toggle(
    "hidden",
    id === "homeScreen" || id === "gameScreen" ||
    id === "summaryScreen" || Boolean(state.activeGame) ||
    Boolean(state.pendingSummary)
  );

  if (id === "amountScreen") {
    // 금액 설정창에 진입할 때마다 입력값을 비운다.
    $("gameAmount").value = "";
    $("amountError").textContent = "";
    updateAmountScreen();
  }

  if (id === "gameScreen") renderGame();
  if (id === "summaryScreen") renderSummary();
  if (id === "shopScreen") updateShop();

  if (id === "moneyScreen") {
    setBankTab(currentBankTab);
    updateBank();
    updateWage();
  }

  window.scrollTo(0, 0);
}

document.querySelectorAll("[data-screen]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

$("backButton").addEventListener("click", () => {
  if (state.activeGame || state.pendingSummary) return;
  showScreen("homeScreen");
});

/* =========================
   메인 / 금액 선택
========================= */

function updateHome() {
  $("budgetDisplay").textContent = moneyText(state.budget);
  $("rerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}개`;
}

$("startGameButton").addEventListener("click", () => {
  if (state.pendingSummary) return showScreen("summaryScreen");
  if (state.activeGame) return showScreen("gameScreen");
  showScreen("amountScreen");
});

function updateAmountScreen() {
  const maximum = Math.min(state.budget, state.gameLimit);
  $("availableBudgetDisplay").textContent = moneyText(state.budget);
  $("gameLimitDisplay").textContent = moneyText(state.gameLimit);
  $("gameAmount").max = String(maximum);

  if (maximum < 1000) {
    $("confirmStartButton").disabled = true;
    $("amountError").textContent = "게임을 시작하려면 최소 1,000원이 필요합니다.";
  } else {
    $("confirmStartButton").disabled = false;
    $("amountError").textContent = "";
  }
}

function readGameAmount() {
  const maximum = Math.floor(Math.min(state.budget, state.gameLimit) / 1000) * 1000;
  const raw = Number($("gameAmount").value);

  if (!Number.isFinite(raw) || raw < 1000) {
    $("amountError").textContent = "최소 금액은 1,000원입니다.";
    return null;
  }

  const amount = Math.min(Math.floor(raw / 1000) * 1000, maximum);
  if (amount < 1000) {
    $("amountError").textContent = "사용 가능한 금액이 부족합니다.";
    return null;
  }

  $("gameAmount").value = String(amount);
  $("amountError").textContent = "";
  return amount;
}

$("amountMinus").addEventListener("click", () => {
  const value = Number($("gameAmount").value) || 1000;
  $("gameAmount").value = String(Math.max(1000, value - 1000));
  readGameAmount();
});

$("amountPlus").addEventListener("click", () => {
  const value = Number($("gameAmount").value) || 0;
  const max = Math.floor(Math.min(state.budget, state.gameLimit) / 1000) * 1000;
  $("gameAmount").value = String(Math.min(max, value + 1000));
  readGameAmount();
});

$("gameAmount").addEventListener("change", readGameAmount);

$("confirmStartButton").addEventListener("click", () => {
  if (state.activeGame || state.pendingSummary) return;

  const amount = readGameAmount();
  if (amount === null) return;

  state.budget -= amount;
  state.activeGame = {
    startAmount: amount,
    money: amount,
    turn: 1,
    choices: generateChoices(),
    forcedColor: null
  };

  saveState();
  updateAll();
  showScreen("gameScreen");
});

/* =========================
   게임 UI
========================= */

function renderGame() {
  const game = state.activeGame;
  if (!game) return;

  $("gameRerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}`;
  $("gameMoneyDisplay").textContent = moneyText(game.money);
  $("turnDisplay").textContent = String(game.turn);
  $("forcedHint").classList.toggle("hidden", !game.forcedColor);

  const ui = [
    {
      button: $("choiceLeft"),
      color: $("leftColor"),
      title: $("leftTitle"),
      penalty: $("leftDescription"),
      overlay: $("leftOverlay"),
      colorName: "blue"
    },
    {
      button: $("choiceRight"),
      color: $("rightColor"),
      title: $("rightTitle"),
      penalty: $("rightDescription"),
      overlay: $("rightOverlay"),
      colorName: "red"
    }
  ];

  ui.forEach((item, index) => {
    const choice = game.choices[index];
    item.color.textContent = item.colorName === "blue" ? "BLUE" : "RED";
    item.title.textContent = choice.title;
    item.penalty.textContent = choice.penalty;

    const blocked = Boolean(
      game.forcedColor && game.forcedColor !== item.colorName
    );

    item.button.disabled = blocked;
    item.overlay.classList.toggle("hidden", !blocked);
    item.button.setAttribute(
      "aria-label",
      `${item.colorName === "blue" ? "파랑" : "빨강"} ${choice.title}. ${choice.penalty}`
    );
  });

  $("rerollButton").disabled = state.rerolls <= 0;
  $("stopGameButton").disabled = false;
}

/* =========================
   게임 효과 및 패널티
========================= */

function losePercent(percent) {
  const game = state.activeGame;
  if (!game) return;

  if (game.money <= 1000) {
    game.money = 0;
    return;
  }

  game.money = clampMoney(Math.round(game.money * (1 - percent / 100)));
}

function applyPenalty(choice, selectedColor) {
  const game = state.activeGame;
  if (!game) return "";

  if (Math.random() * 100 >= choice.penaltyChance) {
    return "패널티가 발생하지 않았습니다.";
  }

  switch (choice.penaltyType) {
    case "loss10":
      losePercent(10);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 10%를 잃었습니다.";

    case "loss15":
      losePercent(15);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 15%를 잃었습니다.";

    case "loss20":
      losePercent(20);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 20%를 잃었습니다.";

    case "loss25":
      losePercent(25);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 25%를 잃었습니다.";

    case "loss35":
      losePercent(35);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 35%를 잃었습니다.";

    case "loss40":
      losePercent(40);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 40%를 잃었습니다.";

    case "loss50":
      losePercent(50);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 50%를 잃었습니다.";

    case "loss60":
      losePercent(60);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 60%를 잃었습니다.";

    case "force":
      game.forcedColor = selectedColor === "blue" ? "red" : "blue";
      return `패널티 발동: 다음 턴은 ${game.forcedColor === "blue" ? "파랑" : "빨강"}만 선택할 수 있습니다.`;

    case "totalLoss":
      game.money = 0;
      return "패널티 발동: 게임 금액을 전부 잃었습니다.";

    default:
      return "패널티가 발생하지 않았습니다.";
  }
}

function chooseOption(index) {
  const game = state.activeGame;
  if (!game || state.pendingSummary) return;

  const color = index === 0 ? "blue" : "red";
  if (game.forcedColor && game.forcedColor !== color) return;

  const choice = game.choices[index];
  if (!choice) return;

  game.forcedColor = null;
  const before = game.money;

  if (choice.effect < 0) {
    losePercent(Math.abs(choice.effect));
  } else {
    game.money = clampMoney(
      Math.round(game.money * (1 + choice.effect / 100))
    );
  }

  if (game.money <= 0) {
    finishGame("게임 금액 소진");
    return;
  }

  const resultMessage = applyPenalty(choice, color);

  if (game.money <= 0) {
    finishGame("게임 금액 소진");
    return;
  }

  game.turn += 1;
  game.choices = generateChoices(game.choices);

  $("gameMessage").textContent =
    `${choice.title}: ${moneyText(before)} → ${moneyText(game.money)}. ${resultMessage}`;

  saveState();
  updateAll();
  renderGame();
}

$("choiceLeft").addEventListener("click", () => chooseOption(0));
$("choiceRight").addEventListener("click", () => chooseOption(1));

$("rerollButton").addEventListener("click", () => {
  const game = state.activeGame;
  if (!game || state.rerolls <= 0) return;

  state.rerolls -= 1;
  game.choices = generateChoices(game.choices);

  // 금액과 강제 색상은 그대로 유지
  saveState();
  updateAll();
  renderGame();
  $("gameMessage").textContent = "선택지가 바뀌었습니다.";
});

$("stopGameButton").addEventListener("click", () => {
  if (!state.activeGame) return;
  finishGame("사용자가 게임을 중지했습니다.");
});

/* =========================
   게임 종료 / 정산
========================= */

function finishGame(reason) {
  if (!state.activeGame || state.pendingSummary) return;

  const game = state.activeGame;
  state.pendingSummary = {
    startAmount: clampMoney(game.startAmount),
    finalAmount: clampMoney(game.money),
    reason: String(reason || "게임 종료")
  };

  state.activeGame = null;
  saveState();
  showScreen("summaryScreen");
}

function renderSummary() {
  const result = state.pendingSummary;
  if (!result) return;

  const profit = result.finalAmount - result.startAmount;

  $("summaryTitle").textContent =
    profit > 0 ? "수익 발생!" : profit < 0 ? "손실 발생" : "원금 유지";

  $("summaryStart").textContent = moneyText(result.startAmount);
  $("summaryFinal").textContent = moneyText(result.finalAmount);

  const el = $("summaryProfit");
  el.textContent = (profit > 0 ? "+" : profit < 0 ? "−" : "") +
    moneyText(Math.abs(profit));
  el.classList.toggle("negative", profit < 0);
  $("summaryMessage").textContent = result.reason;
}

$("settleButton").addEventListener("click", () => {
  const result = state.pendingSummary;
  if (!result) return;

  state.budget = addMoney(state.budget, result.finalAmount);
  state.pendingSummary = null;

  saveState();
  updateAll();
  showScreen("homeScreen");
});

/* =========================
   상점
========================= */

function limitUpgrade() {
  const nextLimit = Math.min(MAX_MONEY, state.gameLimit + 5000);
  return { nextLimit, cost: clampMoney(nextLimit * 2) };
}

function capUpgradeCost() {
  return clampMoney(5000 + ((state.rerollCap - 5) / 5) * 2000);
}

function bankRateUpgradeCost() {
  return clampMoney(state.bankRatePercent * 1000000);
}

function updateShop() {
  const upgrade = limitUpgrade();

  $("shopLimitDisplay").textContent = moneyText(state.gameLimit);
  $("limitPrice").textContent = moneyText(upgrade.cost);

  // 구매 불가 상품도 눌러서 이유를 확인할 수 있도록 버튼을 비활성화하지 않는다.
  $("buyLimitButton").disabled = false;
  $("buyRerollButton").disabled = false;
  $("buyCapButton").disabled = false;
  $("buyBankRateButton").disabled = false;

  $("shopRerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}`;
  $("shopCapDisplay").textContent = `${state.rerollCap}개`;
  $("capPrice").textContent = moneyText(capUpgradeCost());

  $("shopBankRateDisplay").textContent = `${state.bankRatePercent}%`;
  $("bankRatePrice").textContent = state.bankRatePercent >= 10
    ? "최대치"
    : moneyText(bankRateUpgradeCost());
}

let shopMessageTimer = null;
let shopMessageFadeTimer = null;

function shopMessage(message, isError = false) {
  const el = $("shopMessage");

  if (shopMessageTimer !== null) clearTimeout(shopMessageTimer);
  if (shopMessageFadeTimer !== null) clearTimeout(shopMessageFadeTimer);

  el.textContent = message;
  el.classList.toggle("shop-message-error", isError);
  el.classList.remove("shop-message-fading");
  el.style.opacity = "1";

  shopMessageTimer = setTimeout(() => {
    el.classList.add("shop-message-fading");

    shopMessageFadeTimer = setTimeout(() => {
      el.textContent = "";
      el.classList.remove("shop-message-fading", "shop-message-error");
      el.style.opacity = "1";
      shopMessageTimer = null;
      shopMessageFadeTimer = null;
    }, 850);
  }, 1500);
}

$("buyLimitButton").addEventListener("click", () => {
  const upgrade = limitUpgrade();

  if (state.gameLimit >= MAX_MONEY) {
    shopMessage("게임 한도가 최대치입니다.", true);
    return;
  }

  if (state.budget < upgrade.cost) {
    shopMessage("예산 부족", true);
    return;
  }

  state.budget -= upgrade.cost;
  state.gameLimit = upgrade.nextLimit;

  shopMessage(`게임 한도가 ${moneyText(state.gameLimit)}로 증가했습니다.`);
  saveState();
  updateAll();
});

$("buyRerollButton").addEventListener("click", () => {
  if (state.rerolls >= state.rerollCap) {
    shopMessage("리롤 수가 최대치입니다", true);
    return;
  }

  if (state.budget < 10000) {
    shopMessage("예산 부족", true);
    return;
  }

  state.budget -= 10000;
  state.rerolls += 1;

  shopMessage("리롤 1회를 구매했습니다.");
  saveState();
  updateAll();
});

$("buyCapButton").addEventListener("click", () => {
  const cost = capUpgradeCost();

  if (state.rerollCap >= 50) {
    shopMessage("리롤 수가 최대치입니다", true);
    return;
  }

  if (state.budget < cost) {
    shopMessage("예산 부족", true);
    return;
  }

  state.budget -= cost;
  state.rerollCap = Math.min(50, state.rerollCap + 5);
  state.rerolls = Math.min(state.rerolls, state.rerollCap);

  shopMessage(`리롤 최대치가 ${state.rerollCap}회가 되었습니다.`);
  saveState();
  updateAll();
});

$("buyBankRateButton").addEventListener("click", () => {
  if (state.bankRatePercent >= 10) {
    shopMessage("이자 최대치", true);
    return;
  }

  const cost = bankRateUpgradeCost();

  if (state.budget < cost) {
    shopMessage("예산 부족", true);
    return;
  }

  state.budget -= cost;
  state.bankRatePercent += 1;

  shopMessage(`은행 이자율이 ${state.bankRatePercent}%로 증가했습니다.`);
  saveState();
  updateAll();
});

/* =========================
   은행
========================= */

function syncBankClock(now = Date.now()) {
  if (lastActiveTick === null) return;

  const elapsed = Math.max(0, now - lastActiveTick);
  lastActiveTick = now;
  state.bankElapsedMs += elapsed;

  while (state.bankElapsedMs >= BANK_MINUTE_MS) {
    state.bankElapsedMs -= BANK_MINUTE_MS;
    const interest = Math.floor(state.bankPrincipal * state.bankRatePercent / 100);
    state.bankInterest = addMoney(state.bankInterest, interest);
  }
}

function resetBankMinute() {
  state.bankElapsedMs = 0;
  lastActiveTick = document.visibilityState === "visible" ? Date.now() : null;
}

function updateBank() {
  $("bankPrincipalDisplay").textContent = moneyText(state.bankPrincipal);
  $("bankInterestDisplay").textContent = moneyText(state.bankInterest);
  $("bankTotalDisplay").textContent =
    moneyText(addMoney(state.bankPrincipal, state.bankInterest));

  const secondsLeft = Math.ceil(
    Math.max(0, BANK_MINUTE_MS - state.bankElapsedMs) / 1000
  );

  $("bankNextInterestDisplay").textContent =
    `다음 이자까지 ${clockText(secondsLeft)}`;

  $("bankRateDescription").textContent =
    `현재 이자율은 분당 ${state.bankRatePercent}% 단리입니다. 앱이 활성화된 시간만 계산하며, 1분이 지날 때 이자가 반영됩니다.`;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    syncBankClock(Date.now());
    lastActiveTick = null;
    saveState();
  } else {
    lastActiveTick = Date.now();
    updateBank();
  }
});

function setBankTab(tab) {
  currentBankTab = tab === "wage" ? "wage" : "bank";
  $("bankPanel").classList.toggle("hidden", currentBankTab !== "bank");
  $("wagePanel").classList.toggle("hidden", currentBankTab !== "wage");
  $("bankTab").classList.toggle("active", currentBankTab === "bank");
  $("wageTab").classList.toggle("active", currentBankTab === "wage");
}

$("bankTab").addEventListener("click", () => setBankTab("bank"));
$("wageTab").addEventListener("click", () => setBankTab("wage"));

/* =========================
   입금 / 출금
========================= */

function openMoneyModal(mode) {
  syncBankClock(Date.now());

  moneyModalMode = mode;
  $("moneyModal").classList.remove("hidden");
  $("modalError").textContent = "";
  $("moneyAmount").value = "";

  if (mode === "deposit") {
    $("modalTitle").textContent = "입금";
    $("modalDescription").textContent =
      `최소 10,000원 · 사용 가능 예산 ${moneyText(state.budget)}`;
    $("moneyAmount").min = "10000";
  } else {
    $("modalTitle").textContent = "출금";
    $("modalDescription").textContent =
      `출금 가능 금액 ${moneyText(addMoney(state.bankPrincipal, state.bankInterest))}`;
    $("moneyAmount").min = "1";
  }

  $("confirmMoneyButton").textContent = mode === "deposit" ? "입금하기" : "출금하기";
  updateBank();
  $("moneyAmount").focus();
}

function closeMoneyModal() {
  $("moneyModal").classList.add("hidden");
  moneyModalMode = null;
}

$("openDepositButton").addEventListener("click", () => openMoneyModal("deposit"));
$("openWithdrawButton").addEventListener("click", () => openMoneyModal("withdraw"));
$("closeMoneyModal").addEventListener("click", closeMoneyModal);

$("moneyModal").addEventListener("click", event => {
  if (event.target === $("moneyModal")) closeMoneyModal();
});

$("confirmMoneyButton").addEventListener("click", () => {
  if (!moneyModalMode) return;

  syncBankClock(Date.now());
  const amount = Number($("moneyAmount").value);

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MONEY) {
    $("modalError").textContent = "올바른 금액을 입력하세요.";
    return;
  }

  if (moneyModalMode === "deposit") {
    if (amount < 10000) {
      $("modalError").textContent = "최소 입금액은 10,000원입니다.";
      return;
    }

    if (amount > state.budget) {
      $("modalError").textContent = "보유 예산보다 많이 입금할 수 없습니다.";
      return;
    }

    if (state.bankPrincipal + amount > MAX_MONEY) {
      $("modalError").textContent = "은행 원금 한도를 초과합니다.";
      return;
    }

    state.budget -= amount;
    state.bankPrincipal = addMoney(state.bankPrincipal, amount);
    resetBankMinute();
  } else {
    const total = addMoney(state.bankPrincipal, state.bankInterest);

    if (amount > total) {
      $("modalError").textContent = "출금 가능 금액보다 많습니다.";
      return;
    }

    const interestUsed = Math.min(amount, state.bankInterest);
    state.bankInterest -= interestUsed;

    const principalUsed = amount - interestUsed;
    state.bankPrincipal = Math.max(0, state.bankPrincipal - principalUsed);
    state.budget = addMoney(state.budget, amount);
    resetBankMinute();
  }

  saveState();
  updateAll();
  closeMoneyModal();
});

/* =========================
   시급
========================= */

function updateWage() {
  const remaining = Math.max(0, state.wageNextAt - Date.now());
  $("claimWageButton").disabled = remaining > 0;

  if (remaining <= 0) {
    $("wageCountdown").textContent = "지금 받을 수 있어요.";
    $("claimWageButton").textContent = "시급받기";
    return;
  }

  const seconds = Math.ceil(remaining / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  $("wageCountdown").textContent =
    `다음 시급까지 ${String(h).padStart(2, "0")}:` +
    `${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")}`;

  $("claimWageButton").textContent = "아직 받을 수 없습니다";
}

$("claimWageButton").addEventListener("click", () => {
  if (Date.now() < state.wageNextAt) return;

  state.budget = addMoney(state.budget, WAGE_AMOUNT);
  state.wageNextAt = Date.now() + WAGE_COOLDOWN_MS;

  saveState();
  updateAll();
});

/* =========================
   전체 갱신
========================= */

function updateAll() {
  updateHome();
  updateShop();
  updateBank();
  updateWage();

  if (currentScreen === "amountScreen") updateAmountScreen();
  if (currentScreen === "gameScreen") renderGame();
  if (currentScreen === "summaryScreen") renderSummary();
}

/* =========================
   서비스 워커 자동 업데이트
========================= */

if ("serviceWorker" in navigator) {
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      await registration.update();

      setInterval(() => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      }, 60000);
    } catch (error) {
      console.error("서비스 워커 업데이트 확인 실패:", error);
    }
  });
}

/* =========================
   시작
========================= */

function initializeApp() {
  updateAll();

  if (state.pendingSummary) {
    showScreen("summaryScreen");
  } else if (state.activeGame) {
    showScreen("gameScreen");
  } else {
    showScreen("homeScreen");
  }

  saveState();
}

setInterval(() => {
  if (document.visibilityState !== "visible") return;

  syncBankClock(Date.now());
  updateBank();
  updateWage();
}, 1000);

initializeApp();