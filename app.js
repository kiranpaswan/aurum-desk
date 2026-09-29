import { SYMBOLS, getSymbol, midPrice, sizePosition, usdPerUnitFromUsdBaseRates } from "./sizing.js";
import { buildPlan, todayIso } from "./plan.js";

const KEY = "hochsternn-desk-v1";
let volumePlain = "";
const ACCOUNTS = ["USD", "EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "JPY"];

const els = {
  ring: document.querySelector("#ring"),
  ringLabel: document.querySelector("#ring-label"),
  deadline: document.querySelector("#deadline"),
  daysLeft: document.querySelector("#days-left"),
  earned: document.querySelector("#earned"),
  pace: document.querySelector("#pace"),
  months: document.querySelector("#months"),
  target: document.querySelector("#target"),
  startDate: document.querySelector("#start-date"),
  horizon: document.querySelector("#horizon"),
  instrument: document.querySelector("#instrument"),
  filter: document.querySelector("#symbol-filter"),
  symbol: document.querySelector("#symbol"),
  account: document.querySelector("#account"),
  balance: document.querySelector("#balance"),
  risk: document.querySelector("#risk"),
  riskMoney: document.querySelector("#risk-money"),
  stop: document.querySelector("#stop"),
  unit: document.querySelector("#unit"),
  price: document.querySelector("#price"),
  priceHint: document.querySelector("#price-hint"),
  leverage: document.querySelector("#leverage"),
  contract: document.querySelector("#contract"),
  pipSize: document.querySelector("#pip-size"),
  pointSize: document.querySelector("#point-size"),
  lotStep: document.querySelector("#lot-step"),
  tickValue: document.querySelector("#tick-value"),
  distance: document.querySelector("#distance-line"),
  volume: document.querySelector("#volume"),
  caption: document.querySelector("#volume-caption"),
  error: document.querySelector("#result-error"),
  stats: document.querySelector("#stats"),
  riskOut: document.querySelector("#risk-out"),
  unitsLabel: document.querySelector("#units-label"),
  unitsOut: document.querySelector("#units-out"),
  miniOut: document.querySelector("#mini-out"),
  microOut: document.querySelector("#micro-out"),
  pipOut: document.querySelector("#pip-out"),
  marginOut: document.querySelector("#margin-out"),
  specLine: document.querySelector("#spec-line"),
  copy: document.querySelector("#copy"),
  rates: document.querySelector("#rate-status"),
  tradeForm: document.querySelector("#trade-form"),
  tradeDate: document.querySelector("#trade-date"),
  tradeSymbol: document.querySelector("#trade-symbol"),
  tradePnl: document.querySelector("#trade-pnl"),
  tradeNote: document.querySelector("#trade-note"),
  trades: document.querySelector("#trades"),
  reset: document.querySelector("#reset"),
};

let state = load();

boot();

function boot() {
  els.account.replaceChildren(
    ...ACCOUNTS.map((currency) => new Option(currency, currency)),
  );
  els.target.value = state.target;
  els.startDate.value = state.startDate;
  els.horizon.value = state.months;
  els.account.value = state.accountCurrency;
  els.balance.value = state.balance;
  els.risk.value = state.riskPercent;
  els.stop.value = state.stopValue;
  els.unit.value = state.stopUnit;
  els.price.value = state.price;
  els.leverage.value = state.leverage;
  els.lotStep.value = state.lotStep;
  els.tickValue.value = state.tickValue;
  els.tradeDate.value = todayIso();
  els.tradeSymbol.value = state.symbol;
  fillSymbols();
  applySpecFields();
  syncRiskMoney();
  paint();
  loadRates();

  els.filter.addEventListener("input", () => {
    state.filter = els.filter.value;
    fillSymbols();
  });
  els.symbol.addEventListener("change", () => {
    state.symbol = els.symbol.value;
    state.price = "";
    state.priceTouched = false;
    state.tickValue = "";
    els.price.value = "";
    els.tickValue.value = "";
    els.tradeSymbol.value = state.symbol;
    applySpecFields();
    save();
    paint();
  });
  els.account.addEventListener("change", () => {
    state.accountCurrency = els.account.value;
    save();
    paint();
  });
  els.balance.addEventListener("input", () => {
    state.balance = els.balance.value;
    syncRiskMoney();
    save();
    paint();
  });
  els.risk.addEventListener("input", () => {
    state.riskPercent = els.risk.value;
    syncRiskMoney();
    save();
    paint();
  });
  els.riskMoney.addEventListener("input", () => {
    const money = Number(els.riskMoney.value);
    const balance = Number(state.balance);
    if (balance > 0 && Number.isFinite(money)) {
      state.riskPercent = (money / balance) * 100;
      els.risk.value = trimNumber(state.riskPercent);
    }
    save();
    paint();
  });
  els.stop.addEventListener("input", () => {
    state.stopValue = els.stop.value;
    save();
    paint();
  });
  els.unit.addEventListener("change", () => {
    state.stopUnit = els.unit.value;
    save();
    paint();
  });
  els.price.addEventListener("input", () => {
    state.price = els.price.value;
    state.priceTouched = els.price.value !== "";
    save();
    paint();
  });
  els.leverage.addEventListener("input", () => {
    state.leverage = els.leverage.value;
    save();
    paint();
  });
  for (const [element, key] of [
    [els.contract, "contractSize"],
    [els.pipSize, "pipSize"],
    [els.pointSize, "point"],
  ]) {
    element.addEventListener("input", () => {
      const spec = specFor(state.symbol);
      spec[key] = element.value;
      state.specs[state.symbol] = spec;
      save();
      paint();
    });
  }
  els.lotStep.addEventListener("input", () => {
    state.lotStep = els.lotStep.value;
    save();
    paint();
  });
  els.tickValue.addEventListener("input", () => {
    state.tickValue = els.tickValue.value;
    save();
    paint();
  });
  els.target.addEventListener("input", () => {
    state.target = Number(els.target.value) || 0;
    save();
    paint();
  });
  els.startDate.addEventListener("change", () => {
    state.startDate = els.startDate.value || state.startDate;
    save();
    paint();
  });
  els.horizon.addEventListener("input", () => {
    const months = Number(els.horizon.value);
    state.months = months >= 1 ? Math.min(24, Math.round(months)) : state.months;
    save();
    paint();
  });
  els.copy.addEventListener("click", copyVolume);
  els.tradeForm.addEventListener("submit", onTrade);
  els.reset.addEventListener("click", onReset);
}

function paint() {
  const plan = buildPlan({
    startDate: state.startDate,
    target: Number(state.target) || 0,
    months: state.months,
    trades: state.trades,
    today: todayIso(),
  });
  const result = currentSize();
  paintGoal(plan);
  paintSize(result);
  paintTrades();
}

function paintGoal(plan) {
  const pct = Math.round(Math.max(0, Math.min(1, plan.progress)) * 100);
  els.ring.style.setProperty("--p", String(pct));
  els.ringLabel.textContent = `${pct}%`;
  const caption = document.querySelector("#ring-caption");
  caption.textContent = Number(state.target) === 10000 ? "of 10k" : "of goal";
  els.deadline.textContent = `Due ${formatDay(plan.deadline)}`;
  els.daysLeft.textContent = plan.daysLeft === 1 ? "1 day left" : `${plan.daysLeft} days left`;
  els.earned.textContent = money(plan.earned, "USD");
  els.earned.classList.toggle("negative", plan.earned < 0);
  els.pace.textContent = paceSentence(plan);
  els.months.replaceChildren(
    ...plan.windows.map((window) => {
      const item = document.createElement("li");
      const ratio = window.target > 0 ? window.actual / window.target : 0;
      item.className = `month${window.actual < 0 ? " short" : ""}`;
      const index = document.createElement("b");
      index.textContent = String(window.index + 1).padStart(2, "0");
      const amount = document.createElement("strong");
      amount.textContent = money(window.actual, "USD");
      amount.classList.toggle("negative", window.actual < 0);
      const range = document.createElement("em");
      range.textContent = window.range;
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("span");
      fill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
      bar.append(fill);
      item.append(index, amount, range, bar);
      return item;
    }),
  );
}

function paintSize(result) {
  const spec = getSymbol(state.symbol);
  const rates = usdPerUnitFromUsdBaseRates(state.usdRates);
  const mid = spec ? midPrice(spec, rates) : null;
  els.instrument.classList.toggle("hot", Number(state.riskPercent) > 2);
  els.distance.textContent = distanceSentence(spec, result);

  if (state.priceTouched && Number(state.price) > 0) {
    els.priceHint.textContent = usdLeg(spec)
      ? "Using your MT5 price for the conversion."
      : "Saved with the ticket. Cross conversion still uses the mid-market rate, unless you paste a tick value.";
  } else if (mid) {
    els.priceHint.textContent = `Leave blank to use the mid-market ${formatPrice(mid, spec)}.`;
  } else if (spec && spec.quote === state.accountCurrency) {
    els.priceHint.textContent = "This quote matches the account, so pip value does not need a price. Add one for margin.";
  } else {
    els.priceHint.textContent = "Enter the MT5 price, or paste the tick value below.";
  }

  if (!result.ok) {
    volumePlain = "";
    els.volume.textContent = "—";
    els.volume.classList.add("bad");
    els.caption.textContent = "";
    els.error.hidden = false;
    els.error.textContent = result.error;
    els.stats.hidden = true;
    els.copy.disabled = true;
    els.specLine.textContent = spec ? specSentence(spec) : "";
  } else {
    volumePlain = result.volumeLots.toFixed(Math.max(2, decimalsOf(result.lotStep)));
    els.volume.textContent = formatLots(result.volumeLots, result.lotStep);
    els.volume.classList.remove("bad");
    els.caption.textContent = result.belowMin
      ? "Under the lot step. Widen the stop or raise the risk."
      : "Type this into MT5 volume.";
    els.error.hidden = true;
    els.stats.hidden = false;
    els.copy.disabled = result.belowMin;
    els.riskOut.textContent = money(result.riskAmount, result.account);
    els.unitsLabel.textContent = result.unitLabel === "oz" ? "Ounces" : result.unitLabel;
    els.unitsOut.textContent = formatCount(result.units);
    els.miniOut.textContent = formatLots(result.miniLots, 0.1);
    els.microOut.textContent = formatLots(result.microLots, 1);
    els.pipOut.textContent = money(result.moneyPerPipAtVolume, result.account, result.moneyPerPipAtVolume < 1 ? 4 : 2);
    els.marginOut.textContent = result.margin == null
      ? "Need a price"
      : `${money(result.margin, result.account)} at 1:${trimNumber(result.leverage)}`;
    const pipEach = money(result.pipValuePerLot, result.account, result.pipValuePerLot < 1 ? 4 : 2);
    els.specLine.textContent = `${specSentence(spec)} · ${pipEach} per pip, per 1.00 lot`;
  }

  if (state.ratesDate) {
    els.rates.textContent = state.tickValue
      ? "Tick value is overriding the rate feed."
      : `Mid-market FX from the ECB via Frankfurter, ${state.ratesDate}. Gold uses your price when the quote is not the account currency.`;
  } else if (state.ratesError) {
    els.rates.textContent = "Rate feed unavailable. USD-quoted pairs still size. Paste a tick value for everything else.";
  } else {
    els.rates.textContent = "Fetching mid-market rates…";
  }
}

function paintTrades() {
  els.trades.replaceChildren();
  if (!state.trades.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No closes logged. The runway starts at zero.";
    els.trades.append(empty);
    return;
  }
  const head = document.createElement("div");
  head.className = "trade-head";
  for (const label of ["Date", "Symbol", "Result", "Note", ""]) {
    const span = document.createElement("span");
    span.textContent = label;
    head.append(span);
  }
  const rows = [...state.trades].reverse().map((trade) => {
    const row = document.createElement("article");
    row.className = "trade";
    const date = document.createElement("span");
    date.textContent = formatDay(trade.date);
    const symbol = document.createElement("b");
    symbol.textContent = trade.symbol;
    const pnl = document.createElement("b");
    pnl.textContent = money(trade.pnl, "USD");
    pnl.className = trade.pnl < 0 ? "neg" : "pos";
    const note = document.createElement("span");
    note.textContent = trade.note || "";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.setAttribute("aria-label", `Delete ${trade.symbol} on ${trade.date}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.trades = state.trades.filter((item) => item.id !== trade.id);
      save();
      paint();
    });
    row.append(date, symbol, pnl, note, remove);
    return row;
  });
  els.trades.append(head, ...rows);
}

function currentSize() {
  const spec = specFor(state.symbol);
  const typedPrice = state.priceTouched ? Number(state.price) : Number.NaN;
  return sizePosition({
    symbol: state.symbol,
    accountCurrency: state.accountCurrency,
    balance: state.balance,
    riskPercent: state.riskPercent,
    stopValue: state.stopValue,
    stopUnit: state.stopUnit,
    price: Number.isFinite(typedPrice) ? typedPrice : undefined,
    usdPerUnit: usdPerUnitFromUsdBaseRates(state.usdRates),
    contractSize: spec.contractSize,
    pipSize: spec.pipSize,
    point: spec.point,
    lotStep: state.lotStep,
    leverage: state.leverage,
    tickValue: state.tickValue,
  });
}

function fillSymbols() {
  const filter = state.filter.trim().toLowerCase();
  const groups = new Map();
  for (const symbol of SYMBOLS) {
    const hay = `${symbol.symbol} ${symbol.name}`.toLowerCase();
    if (filter && !hay.includes(filter) && symbol.symbol !== state.symbol) continue;
    if (!groups.has(symbol.group)) groups.set(symbol.group, []);
    groups.get(symbol.group).push(symbol);
  }
  els.symbol.replaceChildren();
  for (const [name, symbols] of groups) {
    const group = document.createElement("optgroup");
    group.label = name;
    for (const symbol of symbols) {
      const option = new Option(`${symbol.symbol}  ${symbol.name}`, symbol.symbol);
      option.selected = symbol.symbol === state.symbol;
      group.append(option);
    }
    els.symbol.append(group);
  }
}

function applySpecFields() {
  const spec = specFor(state.symbol);
  els.contract.value = spec.contractSize;
  els.pipSize.value = spec.pipSize;
  els.pointSize.value = spec.point;
}

function specFor(symbol) {
  const base = getSymbol(symbol);
  if (!base) return { contractSize: 100000, pipSize: 0.0001, point: 0.00001 };
  const saved = state.specs[symbol] || {};
  return {
    contractSize: saved.contractSize ?? base.contractSize,
    pipSize: saved.pipSize ?? base.pipSize,
    point: saved.point ?? base.point,
  };
}

function syncRiskMoney() {
  const amount = (Number(state.balance) * Number(state.riskPercent)) / 100;
  if (Number.isFinite(amount)) els.riskMoney.value = amount.toFixed(2);
}

function paceSentence(plan) {
  const gap = money(Math.abs(plan.delta), "USD");
  const need = plan.weekdaysLeft
    ? `${money(plan.perWeekday, "USD")} per weekday finishes it.`
    : "The deadline is here.";
  if (plan.status === "ahead") return `Ahead of a straight line by ${gap}. ${need}`;
  if (plan.status === "behind") return `Behind a straight line by ${gap}. ${need}`;
  return `On the straight line, ${money(plan.expected, "USD")} booked by today. ${need}`;
}

function distanceSentence(spec, result) {
  if (!spec || !(Number(state.stopValue) > 0)) return "";
  const distance = result.ok
    ? result.distance
    : Number(state.stopValue) * (state.stopUnit === "points" ? Number(spec.point) : Number(spec.pipSize));
  if (!(distance > 0)) return "";
  const unit = state.stopUnit === "points" ? "points" : "pips";
  return `${trimNumber(state.stopValue)} ${unit} moves the price by ${formatPrice(distance, spec)}.`;
}

function specSentence(spec) {
  const current = specFor(spec.symbol);
  return `${spec.symbol} · contract ${trimNumber(current.contractSize)} · pip ${trimNumber(current.pipSize)} · point ${trimNumber(current.point)}`;
}

function usdLeg(spec) {
  return spec && (spec.base === "USD" || (spec.quote === "USD" && spec.asset !== "metal"));
}

async function loadRates() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?from=USD");
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    state.usdRates = data.rates || {};
    state.ratesDate = data.date || "";
    state.ratesError = false;
    save();
  } catch {
    state.ratesError = true;
  }
  paint();
}

async function copyVolume() {
  const text = volumePlain;
  if (!text || text === "—") return;
  try {
    await navigator.clipboard.writeText(text);
    els.copy.textContent = "Copied";
    setTimeout(() => {
      els.copy.textContent = "Copy volume";
    }, 1200);
  } catch {
    els.copy.textContent = text;
  }
}

function onTrade(event) {
  event.preventDefault();
  const pnl = Number(els.tradePnl.value);
  const symbol = els.tradeSymbol.value.trim().toUpperCase();
  if (!symbol || !Number.isFinite(pnl) || !els.tradeDate.value) return;
  state.trades.push({
    id: crypto.randomUUID(),
    date: els.tradeDate.value,
    symbol,
    pnl,
    note: els.tradeNote.value.trim(),
  });
  els.tradePnl.value = "";
  els.tradeNote.value = "";
  save();
  paint();
}

function onReset() {
  if (!window.confirm("Clear the book and calculator saved in this browser?")) return;
  localStorage.removeItem(KEY);
  state = fresh();
  els.filter.value = "";
  els.target.value = state.target;
  els.startDate.value = state.startDate;
  els.horizon.value = state.months;
  els.account.value = state.accountCurrency;
  els.balance.value = state.balance;
  els.risk.value = state.riskPercent;
  els.stop.value = state.stopValue;
  els.unit.value = state.stopUnit;
  els.price.value = "";
  els.leverage.value = state.leverage;
  els.lotStep.value = state.lotStep;
  els.tickValue.value = "";
  els.tradeDate.value = todayIso();
  els.tradeSymbol.value = state.symbol;
  fillSymbols();
  applySpecFields();
  syncRiskMoney();
  save();
  paint();
  loadRates();
}

function money(amount, currency, digits) {
  const value = Number(amount) || 0;
  const fraction = digits == null ? (Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2) : digits;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  } catch {
    return value.toFixed(fraction);
  }
}

function formatLots(value, step) {
  const decimals = Math.max(2, String(step).includes(".") ? String(step).split(".")[1].length : 0);
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPrice(value, spec) {
  const digits = Math.min(8, Math.max(spec?.digits || 2, decimalsOf(value)));
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: Math.min(digits, spec?.digits || digits),
    maximumFractionDigits: digits,
  });
}

function formatDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function trimNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(Number(number.toFixed(8)));
}

function decimalsOf(value) {
  const text = trimNumber(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function fresh() {
  return {
    target: 10000,
    months: 5,
    startDate: todayIso(),
    trades: [],
    accountCurrency: "USD",
    balance: 10000,
    riskPercent: 1,
    stopValue: 100,
    stopUnit: "pips",
    symbol: "XAUUSD",
    price: "",
    priceTouched: false,
    leverage: 100,
    lotStep: 0.01,
    tickValue: "",
    specs: {},
    filter: "",
    usdRates: {},
    ratesDate: "",
    ratesError: false,
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved || typeof saved !== "object") return fresh();
    return { ...fresh(), ...saved, trades: Array.isArray(saved.trades) ? saved.trades : [] };
  } catch {
    return fresh();
  }
}

function save() {
  const { filter, ratesError, ...stored } = state;
  localStorage.setItem(KEY, JSON.stringify(stored));
}
