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

const MAX_MONEY = Number.MAX_VALUE;
const BANK_MINUTE_MS = 60000;
const INITIAL_BANK_RATE = 1;
const WAGE_AMOUNT = 5000;
const WAGE_COOLDOWN_MS = 3600000;

const $ = id => document.getElementById(id);
const moneyFormat = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0
});

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function addMoney(a, b) {
  const sum = clampMoney(a) + clampMoney(b);
  return Number.isFinite(sum) ? Math.floor(sum) : Number.MAX_VALUE;
}

function moneyText(value) {
  const n = clampMoney(value);

  if (n < 1000000000000) {
    return moneyFormat.format(n) + "원";
  }

  const units = [
    [1000000000000, "조"],
    [100000000, "억"],
    [10000, "만"]
  ];

  let remaining = n;
  const parts = [];

  for (const [unitValue, unitName] of units) {
    const amount = Math.floor(remaining / unitValue);

    if (amount > 0) {
      parts.push(moneyFormat.format(amount) + unitName);
      remaining -= amount * unitValue;
    }
  }

  if (remaining > 0) {
    parts.push(moneyFormat.format(remaining) + "원");
  }

  return parts.join(" ") || "0원";
}

function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds));

  return String(Math.floor(n / 60)).padStart(2, "0") + ":" +
    String(n % 60).padStart(2, "0");
}

/* =========================
   선택지
========================= */

const SAFE_CHOICES = [
  {
    id: "safe10",
    effect: 10,
    title: "+10%",
    penalty: "패널티: 5% 확률로 10% 손실",
    penaltyChance: 5,
    penaltyType: "loss10"
  },
  {
    id: "safe15",
    effect: 15,
    title: "+15%",
    penalty: "패널티: 8% 확률로 다음 턴 빨강 강제",
    penaltyChance: 8,
    penaltyType: "forceRed"
  },
  {
    id: "safe20",
    effect: 20,
    title: "+20%",
    penalty: "패널티: 10% 확률로 10% 손실",
    penaltyChance: 10,
    penaltyType: "loss10"
  },
  {
    id: "safe25",
    effect: 25,
    title: "+25%",
    penalty: "패널티: 14% 확률로 25% 손실",
    penaltyChance: 14,
    penaltyType: "loss25"
  },
  {
    id: "safeMinus10",
    effect: -10,
    title: "−10%",
    penalty: "패널티: 8% 확률로 다음 턴 파랑 강제",
    penaltyChance: 8,
    penaltyType: "forceBlue"
  },
  {
    id: "safeNoPenalty",
    effect: 20,
    title: "+20%",
    penalty: "패널티: 없음",
    penaltyChance: 0,
    penaltyType: "none"
  },
  {
    id: "safeForceGreen",
    effect: 30,
    title: "+30%",
    penalty: "패널티: 12% 확률로 다음 턴 초록 강제",
    penaltyChance: 12,
    penaltyType: "forceGreen"
  },
  {
    id: "safeBonus5",
    effect: 15,
    title: "+15%",
    penalty: "보너스: 다음 5턴 손실 패널티 확률 감소",
    penaltyChance: 0,
    penaltyType: "none",
    bonusType: "reduceLoss",
    bonusTurns: 5
  },
  {
    id: "safeBonus10",
    effect: 10,
    title: "+10%",
    penalty: "보너스: 다음 10턴 안전한 양수 선택지 확률 증가",
    penaltyChance: 0,
    penaltyType: "none",
    bonusType: "safePositive",
    bonusTurns: 10
  }
];

const RISKY_CHOICES = [
  {
    id: "risk40",
    effect: 40,
    title: "+40%",
    penalty: "패널티: 20% 확률로 25% 손실",
    penaltyChance: 20,
    penaltyType: "loss25"
  },
  {
    id: "risk50",
    effect: 50,
    title: "+50%",
    penalty: "패널티: 25% 확률로 25% 손실",
    penaltyChance: 25,
    penaltyType: "loss25"
  },
  {
    id: "risk75",
    effect: 75,
    title: "+75%",
    penalty: "패널티: 30% 확률로 25% 손실",
    penaltyChance: 30,
    penaltyType: "loss25"
  },
  {
    id: "risk100",
    effect: 100,
    title: "+100%",
    penalty: "패널티: 38% 확률로 50% 손실",
    penaltyChance: 38,
    penaltyType: "loss50"
  },
  {
    id: "risk200",
    effect: 200,
    title: "+200%",
    penalty: "패널티: 52% 확률로 50% 손실",
    penaltyChance: 52,
    penaltyType: "loss50"
  },
  {
    id: "risk1000",
    effect: 1000,
    title: "+1000%",
    penalty: "패널티: 80% 확률로 전액 손실",
    penaltyChance: 80,
    penaltyType: "totalLoss"
  },
  {
    id: "riskMinus25",
    effect: -25,
    title: "−25%",
    penalty: "패널티: 25% 확률로 25% 추가 손실",
    penaltyChance: 25,
    penaltyType: "loss25"
  },
  {
    id: "riskMinus50",
    effect: -50,
    title: "−50%",
    penalty: "패널티: 35% 확률로 50% 추가 손실",
    penaltyChance: 35,
    penaltyType: "loss50"
  },
  {
    id: "riskMinus15Bonus",
    effect: -15,
    title: "−15%",
    penalty: "보너스: 다음 5턴 손실 패널티 확률 감소",
    penaltyChance: 0,
    penaltyType: "none",
    bonusType: "reduceLoss",
    bonusTurns: 5
  }
];

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffledPair(a, b) {
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function samePair(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }

  const aIds = a.map(x => x && x.id).sort().join("|");
  const bIds = b.map(x => x && x.id).sort().join("|");

  return aIds === bIds;
}

function estimateChoiceValue(choice) {
  // 선택 즉시 효과와 패널티의 기대값을 같은 기준(금액 배율)으로 환산합니다.
  const baseMultiplier = choice.effect < 0
    ? 1 - Math.abs(choice.effect) / 100
    : 1 + choice.effect / 100;

  const chance = Math.max(0, Math.min(100, choice.penaltyChance || 0)) / 100;
  let penaltyMultiplier = 1;

  switch (choice.penaltyType) {
    case "loss10":
      penaltyMultiplier = 1 - chance * 0.10;
      break;
    case "loss25":
      penaltyMultiplier = 1 - chance * 0.25;
      break;
    case "loss50":
      penaltyMultiplier = 1 - chance * 0.50;
      break;
    case "totalLoss":
      penaltyMultiplier = 1 - chance;
      break;
    case "forceBlue":
    case "forceRed":
    case "forceGreen":
      // 강제 색상은 다음 턴의 선택 폭을 줄이므로 작은 기대 비용으로 반영합니다.
      penaltyMultiplier = 1 - chance * 0.06;
      break;
  }

  let multiplier = baseMultiplier * penaltyMultiplier;

  // 보너스는 미래 선택지 구성에 좌우되므로 과대평가하지 않고 완만하게 반영합니다.
  if (choice.bonusType === "reduceLoss") {
    multiplier += Math.min(10, choice.bonusTurns || 5) * 0.012;
  } else if (choice.bonusType === "safePositive") {
    // 10턴 동안 안전한 양수 선택지가 더 자주 등장하는 장기 효과를 반영합니다.
    // 낮게 평가하면 +10% 보상에 붙은 이 보너스가 위험 없는 정답처럼 취급될 수 있습니다.
    multiplier += Math.min(10, choice.bonusTurns || 10) * 0.012;
  }

  return (multiplier - 1) * 100;
}

function generateChoices(previous = null, count = 2, safeBoost = false) {
  const targetCount = count === 3 ? 3 : 2;
  const pool = [...SAFE_CHOICES, ...RISKY_CHOICES]
    .filter(choice => targetCount === 3 || choice.penaltyType !== "forceGreen");

  // 보너스가 활성화되면 무패널티 선택지가 더 자주 등장하도록 가중치를 줍니다.
  if (safeBoost) {
    const safeChoice = SAFE_CHOICES.find(choice => choice.id === "safeNoPenalty");
    if (safeChoice) pool.push(safeChoice, safeChoice);
  }

  const unique = new Map();
  pool.forEach(choice => unique.set(choice.id, choice));
  const candidates = [...unique.values()];
  const valueById = new Map(candidates.map(choice => [
    choice.id,
    estimateChoiceValue(choice)
  ]));

  // 가능한 조합을 전부 평가해 선택지끼리의 기대값 격차가 과도한 조합을 피합니다.
  const combinations = [];
  function build(startIndex, picked) {
    if (picked.length === targetCount) {
      const values = picked.map(choice => valueById.get(choice.id));
      const spread = Math.max(...values) - Math.min(...values);
      combinations.push({
        choices: picked.slice(),
        spread,
        previous: samePair(picked, previous)
      });
      return;
    }

    for (let i = startIndex; i < candidates.length; i++) {
      const choice = candidates[i];
      if (picked.some(item => item.id === choice.id)) continue;
      picked.push(choice);
      build(i + 1, picked);
      picked.pop();
    }
  }
  build(0, []);

  const fresh = combinations.filter(item => !item.previous);
  const available = fresh.length ? fresh : combinations;
  // 선택지끼리 기대 가치가 크게 벌어지지 않도록 허용 폭을 좁게 유지합니다.
  // 2개 모드는 특히 한쪽이 명백한 정답이 되는 조합을 강하게 억제합니다.
  const maxSpread = targetCount === 3 ? 15 : 8;
  let eligible = available.filter(item => item.spread <= maxSpread);

  // 기준을 만족하는 조합이 없으면 가장 작은 가치 차이의 조합만 사용합니다.
  // 기존처럼 최솟값보다 넓은 여유를 주면 명백히 우세한 선택지가 다시 나타날 수 있습니다.
  if (!eligible.length) {
    const bestSpread = Math.min(...available.map(item => item.spread));
    eligible = available.filter(item => item.spread <= bestSpread + 0.5);
  }

  // 안전 보너스가 활성화되면 무패널티 선택지가 포함된 조합에 가중치를 줍니다.
  const weighted = eligible.map(item => ({
    item,
    weight: safeBoost && item.choices.some(choice => choice.id === "safeNoPenalty")
      ? 3
      : 1
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let picked = weighted[weighted.length - 1].item;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) {
      picked = entry.item;
      break;
    }
  }

  const selected = picked.choices.map(choice => ({ ...choice }));
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
  return selected;
}

function findChoice(id) {
  return [...SAFE_CHOICES, ...RISKY_CHOICES].find(choice => choice.id === id);
}

function normalizeChoice(raw) {
  if (!raw || typeof raw !== "object") return null;

  const known = findChoice(raw.id);
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
    bankElapsedMs: 0,
    bankRate: INITIAL_BANK_RATE,
    threeChoiceUnlocked: false,
    threeChoiceMode: false,
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

  const normalized = {
    ...base,
    budget: clampMoney(raw.budget ?? raw.money ?? raw.balance ?? base.budget),
    gameLimit: clampMoney(raw.gameLimit ?? raw.maxGameMoney ?? base.gameLimit),
    rerolls: 0,
    rerollCap: 5,
    bankPrincipal: clampMoney(raw.bankPrincipal ?? raw.bankMoney ?? 0),
    bankInterest: clampMoney(raw.bankInterest ?? raw.interest ?? 0),
    bankRate: Math.max(
      1,
      Math.min(10, Math.floor(Number(raw.bankRate) || INITIAL_BANK_RATE))
    ),
    threeChoiceUnlocked: Boolean(raw.threeChoiceUnlocked),
    threeChoiceMode: Boolean(raw.threeChoiceMode && raw.threeChoiceUnlocked),
    bankElapsedMs: Math.max(
      0,
      Math.floor(Number(raw.bankElapsedMs) || 0) % BANK_MINUTE_MS
    ),
    wageNextAt: Math.max(0, Number(raw.wageNextAt) || 0),
    activeGame: null,
    pendingSummary: null
  };

  normalized.gameLimit = Math.max(1000, normalized.gameLimit || 5000);
  normalized.rerollCap = Math.max(
    5,
    Math.min(50, Math.floor((Number(raw.rerollCap) || 5) / 5) * 5)
  );
  normalized.rerolls = Math.max(
    0,
    Math.min(
      normalized.rerollCap,
      Math.floor(Number(raw.rerolls ?? normalized.rerollCap) || 0)
    )
  );

  if (raw.activeGame && typeof raw.activeGame === "object") {
    const game = raw.activeGame;
    const choices = Array.isArray(game.choices)
      ? game.choices.map(normalizeChoice)
      : [];

    const expectedChoiceCount = game.threeChoiceMode
      ? 3
      : (choices.length === 3 ? 3 : 2);

    if (
      clampMoney(game.startAmount) > 0 &&
      choices.length === expectedChoiceCount &&
      choices.every(Boolean)
    ) {
      normalized.activeGame = {
        startAmount: clampMoney(game.startAmount),
        money: clampMoney(game.money),
        turn: Math.max(1, Math.floor(Number(game.turn) || 1)),
        choices,
        threeChoiceMode: Boolean(game.threeChoiceMode || choices.length === 3),
        reduceLossTurns: Math.max(
          0,
          Math.min(10, Math.floor(Number(game.reduceLossTurns) || 0))
        ),
        safePositiveTurns: Math.max(
          0,
          Math.min(10, Math.floor(Number(game.safePositiveTurns) || 0))
        ),
        forcedColor:
          ["blue", "red"].includes(game.forcedColor) ||
          (game.forcedColor === "green" && choices.length === 3)
            ? game.forcedColor
            : null
      };
    }
  }

  if (raw.pendingSummary && typeof raw.pendingSummary === "object") {
    normalized.pendingSummary = {
      startAmount: clampMoney(raw.pendingSummary.startAmount),
      finalAmount: clampMoney(raw.pendingSummary.finalAmount),
      reason: String(raw.pendingSummary.reason || "게임 종료")
    };
  }

  return normalized;
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

      if (!key || key === STORAGE_KEY || !/risk|game/i.test(key)) {
        continue;
      }

      const old = readObject(key);

      if (old && (
        "budget" in old ||
        "money" in old ||
        "gameLimit" in old ||
        "rerolls" in old
      )) {
        return old;
      }
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
let lastActiveTick =
  document.visibilityState === "visible" ? Date.now() : null;

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
    id === "homeScreen" ||
    id === "gameScreen" ||
    id === "summaryScreen" ||
    Boolean(state.activeGame) ||
    Boolean(state.pendingSummary)
  );

  if (id === "amountScreen") {
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
  $("rerollDisplay").textContent =
    `${state.rerolls} / ${state.rerollCap}개`;
}

$("startGameButton").addEventListener("click", () => {
  if (state.pendingSummary) return showScreen("summaryScreen");
  if (state.activeGame) return showScreen("gameScreen");

  showScreen("amountScreen");
});

function updateAmountScreen() {
  $("threeChoiceModeWrap").classList.toggle("hidden", !state.threeChoiceUnlocked);
  $("threeChoiceMode").checked = Boolean(state.threeChoiceMode && state.threeChoiceUnlocked);
  const maximum = Math.floor(Math.min(state.budget, state.gameLimit) / 1000) * 1000;
  $("availableBudgetDisplay").textContent = moneyText(state.budget);
  $("gameLimitDisplay").textContent = moneyText(state.gameLimit);
  $("gameAmount").max = String(maximum);
  const unavailable = maximum < 1000;
  $("confirmStartButton").disabled = unavailable;
  $("amountError").textContent = unavailable
    ? "게임을 시작하려면 최소 1,000원이 필요합니다."
    : "";
}

function readGameAmount() {
  const maximum = Math.floor(Math.min(state.budget, state.gameLimit) / 1000) * 1000;
  const textValue = $("gameAmount").value.trim();
  const raw = Number(textValue);
  if (!textValue || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1000) {
    $("amountError").textContent = "최소 금액은 1,000원이며 1,000원 단위로 입력하세요.";
    return null;
  }
  if (raw % 1000 !== 0) {
    $("amountError").textContent = "1,000원 단위로 입력하세요.";
    return null;
  }
  if (maximum < 1000) {
    $("amountError").textContent = "사용 가능한 금액이 부족합니다.";
    return null;
  }
  if (raw > maximum) {
    $("amountError").textContent = "입력한 금액이 예산 또는 게임 한도를 초과합니다.";
    return null;
  }
  $("amountError").textContent = "";
  return raw;
}

$("amountMinus").addEventListener("click", () => {
  const value = Number($("gameAmount").value) || 1000;

  $("gameAmount").value = String(Math.max(1000, value - 1000));
  readGameAmount();
});

$("amountPlus").addEventListener("click", () => {
  const value = Number($("gameAmount").value) || 0;

  const max = Math.floor(
    Math.min(state.budget, state.gameLimit) / 1000
  ) * 1000;

  $("gameAmount").value = String(Math.min(max, value + 1000));
  readGameAmount();
});

$("gameAmount").addEventListener("change", readGameAmount);

$("threeChoiceMode").addEventListener("change", () => {
  if (!state.threeChoiceUnlocked) {
    state.threeChoiceMode = false;
    $("threeChoiceMode").checked = false;
    return;
  }

  state.threeChoiceMode = $("threeChoiceMode").checked;
  saveState();
});

$("confirmStartButton").addEventListener("click", () => {
  if (state.activeGame || state.pendingSummary) return;

  const amount = readGameAmount();
  if (amount === null) return;

  state.budget -= amount;

  state.activeGame = {
    startAmount: amount,
    money: amount,
    turn: 1,
    threeChoiceMode: Boolean(
      state.threeChoiceMode && state.threeChoiceUnlocked
    ),
    reduceLossTurns: 0,
    safePositiveTurns: 0,
    choices: generateChoices(
      null,
      state.threeChoiceMode && state.threeChoiceUnlocked ? 3 : 2
    ),
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

  $("gameRerollDisplay").textContent =
    `${state.rerolls} / ${state.rerollCap}`;
  $("gameMoneyDisplay").textContent = moneyText(game.money);
  $("turnDisplay").textContent = String(game.turn);

  $("forcedHint").classList.toggle("hidden", !game.forcedColor);

  const isThree = game.choices.length === 3;
  const grid = document.querySelector(".choice-grid");

  grid.classList.toggle("three-choice", isThree);

  const ui = [
    {
      button: $("choiceLeft"),
      color: $("leftColor"),
      title: $("leftTitle"),
      penalty: $("leftDescription"),
      overlay: $("leftOverlay"),
      colorName: "blue",
      label: "파랑"
    },
    {
      button: $("choiceRight"),
      color: $("rightColor"),
      title: $("rightTitle"),
      penalty: $("rightDescription"),
      overlay: $("rightOverlay"),
      colorName: "red",
      label: "빨강"
    },
    {
      button: $("choiceGreen"),
      color: $("greenColor"),
      title: $("greenTitle"),
      penalty: $("greenDescription"),
      overlay: $("greenOverlay"),
      colorName: "green",
      label: "초록"
    }
  ];

  ui.forEach((item, index) => {
    const visible = index < game.choices.length;

    item.button.classList.toggle("hidden", !visible);
    if (!visible) return;

    const choice = game.choices[index];

    item.color.textContent = item.colorName.toUpperCase();
    item.title.textContent = choice.title;
    item.penalty.textContent = choice.penalty || "패널티: 없음";

    const blocked = Boolean(
      game.forcedColor && game.forcedColor !== item.colorName
    );

    item.button.disabled = blocked;
    item.overlay.classList.toggle("hidden", !blocked);

    item.button.setAttribute(
      "aria-label",
      `${item.label} ${choice.title}. ${choice.penalty}`
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

  // 실제 손실 효과가 발생한 순간 금액이 1,000원 이하라면 0원 처리
  if (game.money <= 1000) {
    game.money = 0;
    return;
  }

  game.money = clampMoney(
    Math.round(game.money * (1 - percent / 100))
  );
}

function applyPenalty(choice, selectedColor) {
  const game = state.activeGame;
  if (!game) return "";

  const isLossPenalty = [
    "loss10",
    "loss25",
    "loss50",
    "totalLoss"
  ].includes(choice.penaltyType);

  const effectiveChance =
    isLossPenalty && game.reduceLossTurns > 0
      ? choice.penaltyChance * 0.35
      : choice.penaltyChance;

  if (Math.random() * 100 >= effectiveChance) {
    return choice.bonusType
      ? "보너스가 적용됩니다."
      : "패널티가 발생하지 않았습니다.";
  }

  switch (choice.penaltyType) {
    case "loss10":
      losePercent(10);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 10%를 잃었습니다.";

    case "loss25":
      losePercent(25);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 25%를 잃었습니다.";

    case "loss50":
      losePercent(50);
      return game.money === 0
        ? "패널티 발동: 게임 금액이 0원이 되었습니다."
        : "패널티 발동: 현재 금액의 50%를 잃었습니다.";

    case "forceBlue":
    case "forceRed":
    case "forceGreen": {
      game.forcedColor = choice.penaltyType
        .replace("force", "")
        .toLowerCase();

      const names = {
        blue: "파랑",
        red: "빨강",
        green: "초록"
      };

      return `패널티 발동: 다음 턴은 ${names[game.forcedColor]}만 선택할 수 있습니다.`;
    }

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

  const colors = ["blue", "red", "green"];
  const color = colors[index];

  if (game.forcedColor && game.forcedColor !== color) return;

  const choice = game.choices[index];
  if (!choice) return;

  game.forcedColor = null;

  const before = game.money;

  // 기본 효과를 먼저 적용하고, 그다음 패널티를 판정
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

  if (game.reduceLossTurns > 0) {
    game.reduceLossTurns -= 1;
  }

  if (game.safePositiveTurns > 0) {
    game.safePositiveTurns -= 1;
  }

  if (choice.bonusType === "reduceLoss") {
    game.reduceLossTurns = Math.min(
      10,
      Math.max(game.reduceLossTurns, choice.bonusTurns || 5)
    );
  }

  if (choice.bonusType === "safePositive") {
    game.safePositiveTurns = Math.min(
      10,
      Math.max(game.safePositiveTurns, choice.bonusTurns || 10)
    );
  }

  game.turn += 1;

  game.choices = generateChoices(
    game.choices,
    game.threeChoiceMode ? 3 : 2,
    game.safePositiveTurns > 0
  );

  const bonusStatus = [
    game.reduceLossTurns > 0
      ? `손실 패널티 감소 ${game.reduceLossTurns}턴`
      : "",
    game.safePositiveTurns > 0
      ? `안전한 양수 선택지 확률 증가 ${game.safePositiveTurns}턴`
      : ""
  ].filter(Boolean).join(" · ");

  $("gameMessage").textContent =
    `${choice.title}: ${moneyText(before)} → ${moneyText(game.money)}. ` +
    `${resultMessage}${bonusStatus ? " " + bonusStatus : ""}`;

  saveState();
  updateAll();
  renderGame();
}

$("choiceLeft").addEventListener("click", () => chooseOption(0));
$("choiceRight").addEventListener("click", () => chooseOption(1));
$("choiceGreen").addEventListener("click", () => chooseOption(2));

$("rerollButton").addEventListener("click", () => {
  const game = state.activeGame;
  if (!game || state.rerolls <= 0) return;

  state.rerolls -= 1;

  game.choices = generateChoices(
    game.choices,
    game.threeChoiceMode ? 3 : 2,
    game.safePositiveTurns > 0
  );

  // 금액과 강제 색상은 유지
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
    profit > 0 ? "수익 발생!" :
    profit < 0 ? "손실 발생" :
    "원금 유지";

  $("summaryStart").textContent = moneyText(result.startAmount);
  $("summaryFinal").textContent = moneyText(result.finalAmount);

  const el = $("summaryProfit");

  el.textContent =
    (profit > 0 ? "+" : profit < 0 ? "−" : "") +
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
   공통 확인 창
========================= */

let confirmAction = null;

function askConfirm(message, action, title = "구매 확인") {
  confirmAction = typeof action === "function" ? action : null;

  $("confirmModalTitle").textContent = title;
  $("confirmModalMessage").textContent = message;
  $("confirmModal").classList.remove("hidden");
}

function closeConfirm() {
  $("confirmModal").classList.add("hidden");
  confirmAction = null;
}

$("cancelConfirmButton").addEventListener("click", closeConfirm);

$("acceptConfirmButton").addEventListener("click", () => {
  const action = confirmAction;

  closeConfirm();

  if (action) action();
});

$("confirmModal").addEventListener("click", event => {
  if (event.target === $("confirmModal")) closeConfirm();
});

/* =========================
   상점
========================= */

function limitUpgrade() {
  let increment = 5000;
  let cost = 50000;

  while (
    state.gameLimit >= increment * 10 &&
    Number.isFinite(increment * 10) &&
    Number.isFinite(cost * 10)
  ) {
    increment *= 10;
    cost *= 10;
  }

  const nextLimit = state.gameLimit + increment;

  return { nextLimit, increment, cost };
}

function capUpgradeCost() {
  return 5000 + ((state.rerollCap - 5) / 5) * 2000;
}

function updateShop() {
  const upgrade = limitUpgrade();
  const rateCost = bankRateUpgradeCost();
  $("shopBudgetDisplay").textContent = moneyText(state.budget);
  $("shopLimitDisplay").textContent = moneyText(state.gameLimit);
  $("limitPrice").textContent = moneyText(upgrade.cost);
  $("buyLimitButton").disabled = state.budget < upgrade.cost || !Number.isFinite(upgrade.nextLimit);
  $("buyLimitButton").classList.toggle("unavailable", $("buyLimitButton").disabled);
  $("buyLimitButton").querySelector("small").textContent = $("buyLimitButton").disabled ? "구매불가" : "구매";
  $("shopRerollDisplay").textContent = `${state.rerolls} / ${state.rerollCap}`;
  $("buyRerollButton").disabled = state.rerolls >= state.rerollCap || state.budget < 10000;
  $("buyRerollButton").classList.toggle("unavailable", $("buyRerollButton").disabled);
  $("buyRerollButton").querySelector("small").textContent = $("buyRerollButton").disabled ? "구매불가" : "구매";
  $("shopCapDisplay").textContent = `${state.rerollCap}개`;
  $("capPrice").textContent = moneyText(capUpgradeCost());
  $("buyCapButton").disabled = state.rerollCap >= 50 || state.budget < capUpgradeCost();
  $("buyCapButton").classList.toggle("unavailable", $("buyCapButton").disabled);
  $("buyCapButton").querySelector("small").textContent = $("buyCapButton").disabled ? "구매불가" : "구매";
  $("threeChoiceUnlockDisplay").textContent = state.threeChoiceUnlocked ? "해금 완료" : "미해금";
  $("threeChoicePrice").textContent = state.threeChoiceUnlocked ? "구매 완료" : moneyText(100000000);
  $("buyThreeChoiceButton").disabled = state.threeChoiceUnlocked || state.budget < 100000000;
  $("buyThreeChoiceButton").classList.toggle("unavailable", $("buyThreeChoiceButton").disabled);
  $("threeChoiceBuyLabel").textContent = state.threeChoiceUnlocked ? "구매불가" : ($("buyThreeChoiceButton").disabled ? "구매불가" : "구매");
  $("shopBankRateDisplay").textContent = `${state.bankRate}%`;
  $("bankRatePrice").textContent = state.bankRate >= 10 ? "최대치" : moneyText(rateCost);
  $("buyBankRateButton").disabled = state.bankRate >= 10 || state.budget < rateCost;
  $("buyBankRateButton").classList.toggle("unavailable", $("buyBankRateButton").disabled);
  $("buyBankRateButton").querySelector("small").textContent = state.bankRate >= 10 ? "최대치" : ($("buyBankRateButton").disabled ? "구매불가" : "구매");
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
  if (!message) return;
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

  if (
    state.budget < upgrade.cost ||
    !Number.isFinite(upgrade.nextLimit)
  ) {
    return shopMessage("예산 부족", true);
  }

  askConfirm(
    `게임 한도를 ${moneyText(upgrade.increment)} 올립니다. 비용은 ${moneyText(upgrade.cost)}입니다. 정말 구매하시겠습니까?`,
    () => {
      const current = limitUpgrade();

      if (state.budget < current.cost) {
        return shopMessage("예산 부족", true);
      }

      state.budget -= current.cost;
      state.gameLimit = current.nextLimit;

      shopMessage(
        `게임 한도가 ${moneyText(state.gameLimit)}로 증가했습니다.`
      );

      saveState();
      updateAll();
    }
  );
});

$("buyRerollButton").addEventListener("click", () => {
  if (state.rerolls >= state.rerollCap || state.budget < 10000) return;

  askConfirm("리롤 1회를 10,000원에 구매하시겠습니까?", () => {
    if (state.rerolls >= state.rerollCap || state.budget < 10000) return;

    state.budget -= 10000;
    state.rerolls += 1;

    shopMessage("");
    saveState();
    updateAll();
  });
});

$("buyCapButton").addEventListener("click", () => {
  const cost = capUpgradeCost();

  if (state.rerollCap >= 50 || state.budget < cost) return;

  askConfirm(
    `리롤 최대치를 5회 늘립니다. 비용은 ${moneyText(cost)}입니다. 보유 리롤은 늘어나지 않습니다. 정말 구매하시겠습니까?`,
    () => {
      const actualCost = capUpgradeCost();

      if (state.rerollCap >= 50 || state.budget < actualCost) return;

      state.budget -= actualCost;
      state.rerollCap = Math.min(50, state.rerollCap + 5);
      state.rerolls = Math.min(state.rerolls, state.rerollCap);

      shopMessage("");

      saveState();
      updateAll();
    }
  );
});

$("buyThreeChoiceButton").addEventListener("click", () => {
  if (state.threeChoiceUnlocked || state.budget < 100000000) return;

  askConfirm("3개 선택지 모드를 1억 원에 해금하시겠습니까?", () => {
    if (state.threeChoiceUnlocked || state.budget < 100000000) return;

    state.budget -= 100000000;
    state.threeChoiceUnlocked = true;
    state.threeChoiceMode = false;

    saveState();
    updateAll();

    shopMessage("");
  });
});
$("buyBankRateButton").addEventListener("click", () => {
  if (state.bankRate >= 10) return shopMessage("이자 최대치", true);
  const cost = bankRateUpgradeCost();
  if (state.budget < cost) return shopMessage("예산 부족", true);
  askConfirm(
    `은행 이자율을 ${state.bankRate}%에서 ${state.bankRate + 1}%로 올립니다. 비용은 ${moneyText(cost)}입니다. 정말 구매하시겠습니까?`,
    () => {
      const actualCost = bankRateUpgradeCost();
      if (state.bankRate >= 10 || state.budget < actualCost) return;
      state.budget -= actualCost;
      state.bankRate += 1;
      shopMessage("");
      saveState();
      updateAll();
    },
    "이자율 업그레이드"
  );
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

    const interest = Math.floor(
      state.bankPrincipal * (state.bankRate / 100)
    );

    state.bankInterest = addMoney(state.bankInterest, interest);
  }
}

function resetBankMinute() {
  state.bankElapsedMs = 0;
  lastActiveTick =
    document.visibilityState === "visible" ? Date.now() : null;
}

function bankRateUpgradeCost() {
  return state.bankRate >= 10 ? 0 : state.bankRate * 1000000;
}

function updateBank() {
  $("bankPrincipalDisplay").textContent = moneyText(state.bankPrincipal);
  $("bankInterestDisplay").textContent = moneyText(state.bankInterest);
  $("bankTotalDisplay").textContent = moneyText(addMoney(state.bankPrincipal, state.bankInterest));
  const secondsLeft = Math.ceil(Math.max(0, BANK_MINUTE_MS - state.bankElapsedMs) / 1000);
  $("bankNextInterestDisplay").textContent = `다음 이자까지 ${clockText(secondsLeft)}`;
  $("bankRateDescription").textContent = `현재 이자율은 분당 ${state.bankRate}% 단리입니다. 앱이 활성화된 시간만 계산하며, 1분이 지날 때 이자가 반영됩니다.`;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // 화면이 숨겨지기 직전까지의 활성 시간만 반영
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

  $("bankPanel").classList.toggle(
    "hidden",
    currentBankTab !== "bank"
  );

  $("wagePanel").classList.toggle(
    "hidden",
    currentBankTab !== "wage"
  );

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

  $("confirmMoneyButton").textContent =
    mode === "deposit" ? "입금하기" : "출금하기";

  updateBank();
  $("moneyAmount").focus();
}

function closeMoneyModal() {
  $("moneyModal").classList.add("hidden");
  moneyModalMode = null;
}

$("openDepositButton").addEventListener(
  "click",
  () => openMoneyModal("deposit")
);

$("openWithdrawButton").addEventListener(
  "click",
  () => openMoneyModal("withdraw")
);

$("closeMoneyModal").addEventListener("click", closeMoneyModal);

$("moneyModal").addEventListener("click", event => {
  if (event.target === $("moneyModal")) closeMoneyModal();
});

$("confirmMoneyButton").addEventListener("click", () => {
  if (!moneyModalMode) return;

  syncBankClock(Date.now());

  const amount = Number($("moneyAmount").value);

  if (
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
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

    state.budget -= amount;
    state.bankPrincipal = addMoney(state.bankPrincipal, amount);

    resetBankMinute();
  } else {
    const total = addMoney(state.bankPrincipal, state.bankInterest);

    if (amount > total) {
      $("modalError").textContent = "출금 가능 금액보다 많습니다.";
      return;
    }

    // 누적 이자를 먼저 출금하고, 부족한 부분은 원금에서 차감
    const interestUsed = Math.min(amount, state.bankInterest);
    state.bankInterest -= interestUsed;

    const principalUsed = amount - interestUsed;
    state.bankPrincipal = Math.max(
      0,
      state.bankPrincipal - principalUsed
    );

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

  $("wageReadyDot").classList.toggle("hidden", remaining > 0);
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
   전체 초기화
========================= */

$("resetGameButton").addEventListener("click", () => {
  askConfirm(
    "모든 진행 데이터를 초기화할까요? 예산, 게임 한도, 리롤, 은행 원금과 이자, 이자율, 시급 대기 시간, 해금 항목과 진행 중인 게임이 모두 초기 상태로 돌아갑니다. 이 작업은 되돌릴 수 없습니다.",
    () => {
      state = defaultState();

      lastActiveTick =
        document.visibilityState === "visible" ? Date.now() : null;

      moneyModalMode = null;
      $("moneyModal").classList.add("hidden");
      $("gameMessage").textContent = "";
      $("shopMessage").textContent = "";

      saveState();
      updateAll();
      showScreen("homeScreen");
    },
    "전체 초기화 확인"
  );
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
      const registration =
        await navigator.serviceWorker.register("./sw.js");

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