"use strict";

/* =========================
   기본 설정 및 안전한 금액 계산
========================= */

const STORAGE_KEY = "risk-game-state-v5";
const LEGACY_KEYS = [
  "risk-game-state-v4",
  "risk-game-state-v3",
  "riskGameState",
  "risk-game",
  "riskGame",
  "gameState"
];

const MAX_MONEY = 9000000000000;
const MAX_GAME_LIMIT = MAX_MONEY;
const BANK_RATE_PER_MINUTE = 0.05;
const BANK_MINUTE_MS = 60000;
const WAGE_AMOUNT = 5000;
const WAGE_COOLDOWN_MS = 60 * 60 * 1000;

const $ = id => document.getElementById(id);

const moneyFormat = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0
});

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

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return String(minutes).padStart(2, "0") + ":" +
    String(remaining).padStart(2, "0");
}

function safePercentChange(amount, percent) {
  const current = clampMoney(amount);
  const multiplier = 1 + percent / 100;

  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;

  return clampMoney(Math.round(current * multiplier));
}

/* =========================
   선택지 구성
   빨강/파랑 색 자체에는 확률 차이가 없음.
   각 턴에 안정형 1개와 고위험형 1개를 제시.
========================= */

const SAFE_CHOICES = [
  {
    id: "safe10",
    title: "작은 수익",
    description: "+10% · 위험 5%",
    percent: 10,
    penaltyChance: 5
  },
  {
    id: "safe15",
    title: "안정 수익",
    description: "+15% · 위험 8%",
    percent: 15,
    penaltyChance: 8
  },
  {
    id: "safe20",
    title: "일반 수익",
    description: "+20% · 위험 10%",
    percent: 20,
    penaltyChance: 10
  },
  {
    id: "safe25",
    title: "중간 수익",
    description: "+25% · 위험 14%",
    percent: 25,
    penaltyChance: 14
  },
  {
    id: "safeLoss10",
    title: "작은 손실",
    description: "−10% · 위험 8%",
    percent: -10,
    penaltyChance: 8
  }
];

const RISKY_CHOICES = [
  {
    id: "risk40",
    title: "고위험 수익",
    description: "+40% · 위험 20%",
    percent: 40,
    penaltyChance: 20
  },
  {
    id: "risk60",
    title: "큰 수익",
    description: "+60% · 위험 28%",
    percent: 60,
    penaltyChance: 28
  },
  {
    id: "risk100",
    title: "두 배 도전",
    description: "+100% · 위험 38%",
    percent: 100,
    penaltyChance: 38
  },
  {
    id: "risk200",
    title: "초고위험",
    description: "+200% · 위험 52%",
    percent: 200,
    penaltyChance: 52
  },
  {
    id: "risk1000",
    title: "극한의 도전",
    description: "+1000% · 실패 시 전액 손실",
    percent: 1000,
    penaltyChance: 80,
    totalLossOnPenalty: true
  },
  {
    id: "riskLoss25",
    title: "위험한 거래",
    description: "−25% · 위험 25%",
    percent: -25,
    penaltyChance: 25
  },
  {
    id: "riskLoss50",
    title: "매우 위험한 거래",
    description: "−50% · 위험 35%",
    percent: -50,
    penaltyChance: 35
  }
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shufflePair(pair) {
  return Math.random() < 0.5 ? pair : [pair[1], pair[0]];
}

function samePair(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second)) return false;
  if (first.length !== 2 || second.length !== 2) return false;

  return first[0].id === second[0].id &&
         first[1].id === second[1].id ||
         first[0].id === second[1].id &&
         first[1].id === second[0].id;
}

function generateChoices(previousPair = null) {
  const combinations = [];

  for (const safe of SAFE_CHOICES) {
    for (const risky of RISKY_CHOICES) {
      const pair = shufflePair([safe, risky]);

      if (!samePair(pair, previousPair)) {
        combinations.push(pair);
      }
    }
  }

  if (combinations.length > 0) {
    return randomItem(combinations).map(choice => ({ ...choice }));
  }

  // 모든 조합을 사용한 극단적인 경우에도 유효한 두 선택지를 제공
  return shufflePair([
    { ...SAFE_CHOICES[0] },
    { ...RISKY_CHOICES[0] }
  ]);
}

/* =========================
   저장 데이터와 이전 버전 복구
========================= */

function defaultState() {
  return {
    budget: 10000,
    gameLimit: 5000,
    rerolls: 5,
    rerollCap: 5,

    bankPrincipal: 0,
    bankInterest: 0,
    bankElapsedMs: 0,

    wageNextAt: 0,

    activeGame: null,
    pendingSummary: null
  };
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeChoice(choice) {
  if (!choice || typeof choice !== "object") return null;

  const pools = [...SAFE_CHOICES, ...RISKY_CHOICES];
  const known = pools.find(item => item.id === choice.id);

  if (known) return { ...known };

  // 구버전의 선택지 데이터는 식별할 수 없을 때 임의로 실행하지 않음
  return null;
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
    bankElapsedMs: Math.max(
      0,
      Math.floor(numberOr(raw.bankElapsedMs, 0)) % BANK_MINUTE_MS
    ),
    wageNextAt: Math.max(0, numberOr(raw.wageNextAt, 0)),
    activeGame: null,
    pendingSummary: null
  };

  state.gameLimit = Math.max(1000, state.gameLimit || 5000);
  state.rerollCap = Math.min(
    50,
    Math.max(5, Math.floor(numberOr(raw.rerollCap, 5) / 5) * 5)
  );
  state.rerolls = Math.max(
    0,
    Math.min(
      state.rerollCap,
      Math.floor(numberOr(raw.rerolls, state.rerollCap))
    )
  );

  if (raw.pendingSummary && typeof raw.pendingSummary === "object") {
    const summary = raw.pendingSummary;
    state.pendingSummary = {
      startAmount: clampMoney(summary.startAmount),
      finalAmount: clampMoney(summary.finalAmount),
      reason: String(summary.reason || "게임 종료")
    };
  }

  if (raw.activeGame && typeof raw.activeGame === "object") {
    const game = raw.activeGame;
    const choices = Array.isArray(game.choices)
      ? game.choices.map(normalizeChoice)
      : [];

    const startAmount = clampMoney(game.startAmount);
    const gameMoney = clampMoney(game.money);

    if (
      startAmount > 0 &&
      choices.length === 2 &&
      choices[0] &&
      choices[1]
    ) {
      state.activeGame = {
        startAmount,
        money: gameMoney,
        turn: Math.max(1, Math.floor(numberOr(game.turn, 1))),
        choices,
        forcedColor:
          game.forcedColor === "blue" || game.forcedColor === "red"
            ? game.forcedColor
            : null
      };
    }
  }

  return state;
}

function readSavedObject(key) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;

    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch {
    return null;
  }
}

function findLegacyState() {
  for (const key of LEGACY_KEYS) {
    if (key === STORAGE_KEY) continue;

    const data = readSavedObject(key);
    if (data) return data;
  }

  // 이름이 다른 구버전 저장 키도 후보로 검사하되,
  // 명백한 게임 데이터 구조가 있는 항목만 사용
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === STORAGE_KEY) continue;

      if (!/risk|game/i.test(key)) continue;

      const data = readSavedObject(key);
      if (
        data &&
        (
          "budget" in data ||
          "money" in data ||
          "gameLimit" in data ||
          "rerolls" in data
        )
      ) {
        return data;
      }
    }
  } catch {
    // 저장소 접근 제한 시 기본 데이터로 실행
  }

  return null;
}

function loadState() {
  const current = readSavedObject(STORAGE_KEY);

  if (current) {
    return normalizeState(current);
  }

  const legacy = findLegacyState();

  if (legacy) {
    const migrated = normalizeState(legacy);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch {
      // 저장 불가여도 현재 화면은 동작하도록 유지
    }

    return migrated;
  }

  return defaultState();
}

let state = loadState();
let currentScreen = "homeScreen";
let currentBankTab = "bank";
let moneyModalMode = null;
let lastActiveTick = document.visibilityState === "visible" ? Date.now() : null;
let saveTimer = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("saveStatus").textContent = "저장됨";
    $("saveStatus").style.color = "var(--green)";
    return true;
  } catch (error) {
    $("saveStatus").textContent = "저장 실패";
    $("saveStatus").style.color = "#ff8295";
    console.error("게임 데이터 저장 실패:", error);
    return false;
  }
}

function scheduleSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState();
  }, 150);
}

/* =========================
   화면 이동
========================= */

const SCREEN_TITLES = {
  homeScreen: "리스크 게임",
  amountScreen: "게임 금액 설정",
  gameScreen: "게임",
  summaryScreen: "게임 결과",
  shopScreen: "상점",
  settingsScreen: "설정",
  moneyScreen: "돈 관리"
};

function showScreen(screenId) {
  const target = $(screenId);
  if (!target) return;

  document.querySelectorAll("main .screen").forEach(screen => {
    screen.classList.toggle("hidden", screen.id !== screenId);
  });

  currentScreen = screenId;
  $("headerTitle").textContent = SCREEN_TITLES[screenId] || "리스크 게임";
  $("backButton").classList.toggle("hidden", screenId === "homeScreen");

  if (screenId === "amountScreen") {
    updateAmountScreen();
  }

  if (screenId === "gameScreen") {
    renderGame();
  }

  if (screenId === "summaryScreen") {
    renderSummary();
  }

  if (screenId === "shopScreen") {
    updateShop();
  }

  if (screenId === "moneyScreen") {
    setBankTab(currentBankTab);
    updateBank();
    updateWage();
  }

  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll("[data-screen]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

$("backButton").addEventListener("click", () => {
  if (currentScreen === "summaryScreen" && state.pendingSummary) return;

  if (currentScreen === "gameScreen" && state.activeGame) {
    showScreen("homeScreen");
    return;
  }

  if (currentScreen === "amountScreen") {
    showScreen("homeScreen");
    return;
  }

  showScreen("homeScreen");
});

/* =========================
   메인 화면
========================= */

function updateHome() {
  $("budgetDisplay").textContent = moneyText(state.budget);
  $("rerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}개`;
}

$("startGameButton").addEventListener("click", () => {
  if (state.pendingSummary) {
    showScreen("summaryScreen");
    return;
  }

  if (state.activeGame) {
    showScreen("gameScreen");
    return;
  }

  showScreen("amountScreen");
});

/* =========================
   게임 금액 설정 및 시작
========================= */

function updateAmountScreen() {
  const maximum = Math.min(state.budget, state.gameLimit);
  const amountInput = $("gameAmount");

  $("availableBudgetDisplay").textContent = moneyText(state.budget);
  $("gameLimitDisplay").textContent = moneyText(state.gameLimit);

  amountInput.min = "1000";
  amountInput.max = String(maximum);
  amountInput.step = "1000";

  if (!Number.isFinite(Number(amountInput.value)) || Number(amountInput.value) < 1000) {
    amountInput.value = String(Math.max(1000, Math.floor(maximum / 1000) * 1000));
  }

  if (maximum < 1000) {
    amountInput.value = "1000";
    $("confirmStartButton").disabled = true;
    $("amountError").textContent = "게임을 시작하려면 최소 1,000원이 필요합니다.";
  } else {
    $("confirmStartButton").disabled = false;
    $("amountError").textContent = "";
  }
}

function normalizeGameAmount() {
  const max = Math.min(state.budget, state.gameLimit);
  const raw = Number($("gameAmount").value);

  if (!Number.isFinite(raw) || raw < 1000) {
    $("amountError").textContent = "최소 금액은 1,000원입니다.";
    return null;
  }

  const rounded = Math.floor(raw / 1000) * 1000;
  const amount = Math.min(rounded, Math.floor(max / 1000) * 1000);

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
  normalizeGameAmount();
});

$("amountPlus").addEventListener("click", () => {
  const value = Number($("gameAmount").value) || 0;
  const maximum = Math.floor(Math.min(state.budget, state.gameLimit) / 1000) * 1000;
  $("gameAmount").value = String(Math.min(maximum, value + 1000));
  normalizeGameAmount();
});

$("gameAmount").addEventListener("change", normalizeGameAmount);

$("confirmStartButton").addEventListener("click", () => {
  if (state.activeGame || state.pendingSummary) return;

  const amount = normalizeGameAmount();
  if (amount === null) return;
  if (state.budget < amount) return;

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
   게임 진행
========================= */

function renderGame() {
  const game = state.activeGame;
  if (!game) return;

  $("gameRerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}`;
  $("gameMoneyDisplay").textContent = moneyText(game.money);
  $("turnDisplay").textContent = String(game.turn);

  $("forcedHint").classList.toggle("hidden", !game.forcedColor);
  $("gameMessage").textContent = "";

  const buttons = [
    {
      color: "blue",
      button: $("choiceLeft"),
      label: $("leftColor"),
      title: $("leftTitle"),
      description: $("leftDescription"),
      overlay: $("leftOverlay")
    },
    {
      color: "red",
      button: $("choiceRight"),
      label: $("rightColor"),
      title: $("rightTitle"),
      description: $("rightDescription"),
      overlay: $("rightOverlay")
    }
  ];

  buttons.forEach((ui, index) => {
    const choice = game.choices[index];

    ui.label.textContent = ui.color === "blue" ? "BLUE" : "RED";
    ui.title.textContent = choice.title;
    ui.description.textContent = choice.description;

    const disabled = Boolean(game.forcedColor && game.forcedColor !== ui.color);
    ui.button.disabled = disabled;
    ui.overlay.classList.toggle("hidden", !disabled);
    ui.button.setAttribute("aria-label", `${ui.color === "blue" ? "파랑" : "빨강"}: ${choice.title}, ${choice.description}`);
  });

  $("rerollButton").disabled = state.rerolls <= 0;
  $("stopGameButton").disabled = false;
}

function applyLoss(percent) {
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
  if (!game) return "추가 효과 없음";

  if (Math.random() * 100 >= choice.penaltyChance) {
    return "추가 위험은 발생하지 않았습니다.";
  }

  if (choice.totalLossOnPenalty) {
    game.money = 0;
    return "극한의 위험이 발동해 게임 금액을 모두 잃었습니다.";
  }

  const penaltyType = Math.random();

  if (penaltyType < 0.45) {
    applyLoss(25);
    return game.money === 0
      ? "손실 페널티로 게임 금액을 모두 잃었습니다."
      : "추가 손실: 현재 금액의 25%를 잃었습니다.";
  }

  if (penaltyType < 0.75) {
    applyLoss(10);
    return game.money === 0
      ? "손실 페널티로 게임 금액을 모두 잃었습니다."
      : "추가 손실: 현재 금액의 10%를 잃었습니다.";
  }

  game.forcedColor = selectedColor === "blue" ? "red" : "blue";
  return `다음 턴에는 ${game.forcedColor === "blue" ? "파랑" : "빨강"} 버튼을 선택해야 합니다.`;
}

function chooseOption(index) {
  const game = state.activeGame;
  if (!game || state.pendingSummary) return;

  const color = index === 0 ? "blue" : "red";

  if (game.forcedColor && game.forcedColor !== color) return;

  const choice = game.choices[index];
  if (!choice) return;

  // 이전 강제 색상 조건은 이번 선택으로 해제
  game.forcedColor = null;

  const before = game.money;

  if (choice.percent < 0) {
    applyLoss(Math.abs(choice.percent));
  } else {
    game.money = safePercentChange(game.money, choice.percent);
  }

  let message = `${choice.title}: ${moneyText(before)} → ${moneyText(game.money)}.`;

  if (game.money <= 0) {
    finishGame("게임 금액 소진");
    return;
  }

  const penaltyMessage = applyPenalty(choice, color);
  message += " " + penaltyMessage;

  if (game.money <= 0) {
    finishGame("게임 금액 소진");
    return;
  }

  game.turn += 1;
  game.choices = generateChoices(game.choices);

  $("gameMessage").textContent = message;
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

  // 리롤은 게임 금액과 강제 색상 조건을 바꾸지 않음
  saveState();
  updateAll();
  renderGame();
  $("gameMessage").textContent = "선택지가 바뀌었습니다.";
});

$("stopGameButton").addEventListener("click", () => {
  if (!state.activeGame) return;
  finishGame("사용자가 게임을 중단했습니다.");
});

/* =========================
   게임 종료 및 중복 정산 방지
========================= */

function finishGame(reason) {
  const game = state.activeGame;
  if (!game || state.pendingSummary) return;

  state.pendingSummary = {
    startAmount: clampMoney(game.startAmount),
    finalAmount: clampMoney(game.money),
    reason: String(reason || "게임 종료")
  };

  state.activeGame = null;

  // 정산 전 결과를 먼저 저장해 앱 종료에도 복구
  saveState();
  showScreen("summaryScreen");
}

function renderSummary() {
  const result = state.pendingSummary;
  if (!result) return;

  const profit = result.finalAmount - result.startAmount;

  $("summaryTitle").textContent = result.finalAmount > result.startAmount
    ? "수익 발생!"
    : result.finalAmount < result.startAmount
      ? "손실 발생"
      : "원금 유지";

  $("summaryStart").textContent = moneyText(result.startAmount);
  $("summaryFinal").textContent = moneyText(result.finalAmount);

  const profitElement = $("summaryProfit");
  profitElement.textContent =
    (profit > 0 ? "+" : profit < 0 ? "−" : "") + moneyText(Math.abs(profit));
  profitElement.classList.toggle("negative", profit < 0);

  $("summaryMessage").textContent = result.reason;
}

$("settleButton").addEventListener("click", () => {
  const result = state.pendingSummary;
  if (!result) {
    showScreen("homeScreen");
    return;
  }

  // 한 번만 지급한 뒤 결과를 제거해 중복 지급을 막음
  state.budget = addMoney(state.budget, result.finalAmount);
  state.pendingSummary = null;

  saveState();
  updateAll();
  showScreen("homeScreen");
});

/* =========================
   상점
========================= */

function limitUpgradeCost() {
  const nextLimit = Math.min(MAX_GAME_LIMIT, state.gameLimit + 5000);
  return {
    nextLimit,
    cost: clampMoney(nextLimit * 2)
  };
}

function capUpgradeCost() {
  return clampMoney(5000 + ((state.rerollCap - 5) / 5) * 2000);
}

function updateShop() {
  const upgrade = limitUpgradeCost();

  $("shopLimitDisplay").textContent = moneyText(state.gameLimit);
  $("limitPrice").textContent = moneyText(upgrade.cost);
  $("buyLimitButton").disabled =
    state.gameLimit >= MAX_GAME_LIMIT || state.budget < upgrade.cost;

  $("shopRerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}`;
  $("buyRerollButton").disabled =
    state.rerolls >= state.rerollCap || state.budget < 10000;

  $("shopCapDisplay").textContent = `${state.rerollCap}개`;
  $("capPrice").textContent = moneyText(capUpgradeCost());
  $("buyCapButton").disabled =
    state.rerollCap >= 50 || state.budget < capUpgradeCost();
}

function shopMessage(message) {
  $("shopMessage").textContent = message;
}

$("buyLimitButton").addEventListener("click", () => {
  const upgrade = limitUpgradeCost();

  if (state.gameLimit >= MAX_GAME_LIMIT) {
    shopMessage("게임 한도가 더 이상 증가할 수 없습니다.");
    return;
  }

  if (state.budget < upgrade.cost) {
    shopMessage("예산이 부족합니다.");
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
    shopMessage("리롤이 최대치입니다.");
    return;
  }

  if (state.budget < 10000) {
    shopMessage("예산이 부족합니다.");
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
    shopMessage("리롤 최대치는 50회입니다.");
    return;
  }

  if (state.budget < cost) {
    shopMessage("예산이 부족합니다.");
    return;
  }

  state.budget -= cost;
  state.rerollCap = Math.min(50, state.rerollCap + 5);

  // 최대치 증가만으로 보유 리롤은 증가하지 않음
  state.rerolls = Math.min(state.rerolls, state.rerollCap);

  shopMessage(`리롤 최대치가 ${state.rerollCap}회가 되었습니다.`);
  saveState();
  updateAll();
});

/* =========================
   은행 이자
   - 완전한 활성 1분마다 원금의 5% 지급
   - 백그라운드 시간은 계산하지 않음
   - 입금/출금 시 진행 중인 분은 초기화
========================= */

function syncBankClock(now = Date.now()) {
  if (lastActiveTick === null) return;

  const elapsed = Math.max(0, now - lastActiveTick);
  lastActiveTick = now;

  state.bankElapsedMs += elapsed;

  while (state.bankElapsedMs >= BANK_MINUTE_MS) {
    state.bankElapsedMs -= BANK_MINUTE_MS;

    const earned = Math.floor(state.bankPrincipal * BANK_RATE_PER_MINUTE);
    state.bankInterest = addMoney(state.bankInterest, earned);
  }

  saveState();
}

function resetBankMinute() {
  state.bankElapsedMs = 0;
  lastActiveTick = document.visibilityState === "visible" ? Date.now() : null;
}

function updateBank() {
  $("bankPrincipalDisplay").textContent = moneyText(state.bankPrincipal);
  $("bankInterestDisplay").textContent = moneyText(state.bankInterest);
  $("bankTotalDisplay").textContent = moneyText(
    addMoney(state.bankPrincipal, state.bankInterest)
  );

  const remainingMs = Math.max(0, BANK_MINUTE_MS - state.bankElapsedMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  $("bankNextInterestDisplay").textContent =
    `다음 이자까지 ${formatClock(remainingSeconds)}`;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // visibilityState가 hidden으로 바뀌어도 마지막 활성 구간은 정산
    syncBankClock(Date.now());
    lastActiveTick = null;
    saveState();
  } else {
    // 다시 화면에 돌아온 순간부터 활성 시간 측정
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
   입금 / 출금 모달
========================= */

function openMoneyModal(mode) {
  // 버튼을 누른 시점까지의 은행 이자를 먼저 반영
  syncBankClock(Date.now());

  moneyModalMode = mode;
  $("moneyModal").classList.remove("hidden");
  $("modalError").textContent = "";
  $("moneyAmount").value = "";

  if (mode === "deposit") {
    $("modalTitle").textContent = "입금";
    $("modalDescription").textContent =
      `최소 입금액은 10,000원입니다. 사용 가능 예산: ${moneyText(state.budget)}`;
    $("moneyAmount").min = "10000";
  } else {
    $("modalTitle").textContent = "출금";
    $("modalDescription").textContent =
      `출금 가능 금액: ${moneyText(addMoney(state.bankPrincipal, state.bankInterest))}`;
    $("moneyAmount").min = "1";
  }

  $("confirmMoneyButton").textContent = mode === "deposit" ? "입금하기" : "출금하기";
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
    const totalAvailable = addMoney(state.bankPrincipal, state.bankInterest);

    if (amount > totalAvailable) {
      $("modalError").textContent = "출금 가능 금액보다 많습니다.";
      return;
    }

    // 이자를 먼저 출금하고, 부족한 금액만 원금에서 차감
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
  const now = Date.now();
  const remaining = Math.max(0, state.wageNextAt - now);
  const button = $("claimWageButton");

  button.disabled = remaining > 0;

  if (remaining <= 0) {
    $("wageCountdown").textContent = "지금 받을 수 있어요.";
    button.textContent = "시급받기";
    return;
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  $("wageCountdown").textContent =
    `다음 시급까지 ${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}`;

  button.textContent = "아직 받을 수 없습니다";
}

$("claimWageButton").addEventListener("click", () => {
  if (Date.now() < state.wageNextAt) return;

  state.budget = addMoney(state.budget, WAGE_AMOUNT);
  state.wageNextAt = Date.now() + WAGE_COOLDOWN_MS;

  saveState();
  updateAll();
});

/* =========================
   전체 화면 갱신
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

setInterval(() => {
  if (document.visibilityState === "visible") {
    syncBankClock(Date.now());
    updateBank();
    updateWage();
  }
}, 1000);

/* =========================
   자동 업데이트
========================= */

if ("serviceWorker" in navigator) {
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");

      // 페이지가 열릴 때마다 새 버전 확인
      await registration.update();

      // 앱이 계속 열려 있으면 일정 간격으로 새 버전 확인
      setInterval(() => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      }, 60000);
    } catch (error) {
      console.error("서비스 워커 등록 실패:", error);
    }
  });
}

/* =========================
   시작 시 상태 복구
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

initializeApp();