/**
 * MT5-style position sizing.
 *
 * Loss for one lot = price distance × contract size × (quote currency → account currency).
 * Volume is floored to the broker lot step so the order cannot exceed the risk budget.
 * Pip and point sizes default to common MetaTrader 5 specifications and can be overridden
 * per symbol to match the broker's Specification window.
 */

export const SYMBOLS = [
  metal("XAUUSD", "Gold", "USD"),
  metal("XAUEUR", "Gold / Euro", "EUR"),
  metal("XAUGBP", "Gold / Sterling", "GBP"),
  metal("XAUAUD", "Gold / Aussie", "AUD"),
  metal("XAGUSD", "Silver", "USD", {
    contractSize: 5000,
    digits: 3,
    point: 0.001,
    pipSize: 0.001,
  }),
  ...majors(),
  ...minors(),
  ...exotics(),
];

const BY_SYMBOL = new Map(SYMBOLS.map((symbol) => [symbol.symbol, symbol]));

export function getSymbol(symbol) {
  return BY_SYMBOL.get(symbol) || null;
}

export function usdPerUnitFromUsdBaseRates(foreignPerUsd) {
  const usdPerUnit = { USD: 1 };
  for (const [currency, perUsd] of Object.entries(foreignPerUsd || {})) {
    const value = Number(perUsd);
    if (value > 0) usdPerUnit[currency] = 1 / value;
  }
  return usdPerUnit;
}

export function applyPairPrice(usdPerUnit, spec, price) {
  const next = { ...usdPerUnit };
  const px = Number(price);
  if (!spec || !(px > 0)) return next;
  if (spec.base === "USD" && spec.quote !== "USD") next[spec.quote] = 1 / px;
  else if (spec.quote === "USD" && spec.base !== "USD" && spec.asset !== "metal") {
    next[spec.base] = px;
  }
  return next;
}

export function midPrice(spec, usdPerUnit) {
  if (!spec || spec.asset === "metal") return null;
  const base = usdPerUnit[spec.base];
  const quote = usdPerUnit[spec.quote];
  if (!(base > 0) || !(quote > 0)) return null;
  return base / quote;
}

export function sizePosition({
  symbol,
  accountCurrency = "USD",
  balance,
  riskPercent,
  stopValue,
  stopUnit = "pips",
  price,
  usdPerUnit = { USD: 1 },
  contractSize,
  pipSize,
  point,
  lotStep = 0.01,
  leverage = 100,
  tickValue,
}) {
  const spec = getSymbol(symbol);
  if (!spec) return fail("Choose a symbol.");

  const account = String(accountCurrency || "").toUpperCase();
  const equity = Number(balance);
  const risk = Number(riskPercent);
  const stop = Number(stopValue);
  const step = Number(lotStep);
  const lev = Number(leverage);

  if (!(equity > 0)) return fail("Enter an account balance above zero.");
  if (!(risk > 0)) return fail("Enter a risk percent above zero.");
  if (risk > 100) return fail("Risk percent cannot exceed 100.");
  if (!(stop > 0)) return fail("Enter a stop distance above zero.");
  if (!(step > 0)) return fail("Lot step must be above zero.");
  if (!(lev > 0)) return fail("Leverage must be above zero.");

  const contract = positive(contractSize, spec.contractSize);
  const pip = positive(pipSize, spec.pipSize);
  const pt = positive(point, spec.point);
  if (!contract || !pip || !pt) return fail("Contract, pip, and point sizes must be above zero.");

  const rates = applyPairPrice(usdPerUnit, spec, price);
  const accountRate = rates[account];
  const distance = stopUnit === "points" ? stop * pt : stop * pip;
  const brokerTick = Number(tickValue);
  let quoteToAccount = null;
  let pipValuePerLot;
  let lossPerLot;

  if (brokerTick > 0) {
    pipValuePerLot = (pip / pt) * brokerTick;
    lossPerLot = (distance / pt) * brokerTick;
  } else {
    const quoteRate = rates[spec.quote];
    if (!(quoteRate > 0) || !(accountRate > 0)) {
      return fail(
        `Need a ${spec.quote} to ${account} rate. Enter the MT5 price, or paste the tick value from Specification.`,
      );
    }
    quoteToAccount = quoteRate / accountRate;
    pipValuePerLot = pip * contract * quoteToAccount;
    lossPerLot = distance * contract * quoteToAccount;
  }
  if (!(lossPerLot > 0) || !(pipValuePerLot > 0)) return fail("Could not value that stop.");

  const riskAmount = equity * (risk / 100);
  const exactLots = riskAmount / lossPerLot;
  const volumeLots = floorToStep(exactLots, step);
  const units = volumeLots * contract;
  const lotUnit = spec.asset === "metal" ? "oz" : spec.base;
  const px = Number(price) > 0 ? Number(price) : midPrice(spec, rates);

  let margin = null;
  if (accountRate > 0 && spec.asset === "metal") {
    if (px > 0) {
      const marginRate = rates[spec.quote];
      if (marginRate > 0) {
        margin = ((volumeLots * contract * px) / lev) * (marginRate / accountRate);
      }
    }
  } else if (accountRate > 0 && rates[spec.base] > 0) {
    margin = ((volumeLots * contract) / lev) * (rates[spec.base] / accountRate);
  }

  return {
    ok: true,
    error: "",
    spec,
    account,
    riskAmount,
    distance,
    quoteToAccount,
    pipValuePerLot,
    pointValuePerLot: pt * contract * quoteToAccount,
    exactLots,
    volumeLots,
    units,
    unitLabel: lotUnit,
    standardLots: volumeLots,
    miniLots: volumeLots * 10,
    microLots: volumeLots * 100,
    moneyPerPipAtVolume: pipValuePerLot * volumeLots,
    margin,
    priceUsed: px > 0 ? px : null,
    contract,
    pip,
    point: pt,
    lotStep: step,
    leverage: lev,
    belowMin: volumeLots <= 0,
  };
}

export function floorToStep(value, step) {
  const factor = Math.round(1 / step);
  if (!(factor > 0) || !Number.isFinite(value)) return 0;
  return Math.floor(value * factor + 1e-8) / factor;
}

function positive(value, fallback) {
  const number = Number(value);
  if (number > 0) return number;
  return fallback > 0 ? fallback : null;
}

function fail(error) {
  return { ok: false, error };
}

function metal(symbol, name, quote, extra = {}) {
  return {
    symbol,
    name,
    base: symbol.slice(0, 3),
    quote,
    group: "Metals",
    asset: "metal",
    contractSize: 100,
    digits: 2,
    point: 0.01,
    pipSize: 0.01,
    ...extra,
  };
}

function fx(symbol, name, group) {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  const wide = quote === "JPY" || quote === "HUF";
  return {
    symbol,
    name,
    base,
    quote,
    group,
    asset: "forex",
    contractSize: 100000,
    digits: wide ? 3 : 5,
    point: wide ? 0.001 : 0.00001,
    pipSize: wide ? 0.01 : 0.0001,
  };
}

function majors() {
  return [
    fx("EURUSD", "Euro / US Dollar", "Majors"),
    fx("GBPUSD", "Sterling / US Dollar", "Majors"),
    fx("AUDUSD", "Aussie / US Dollar", "Majors"),
    fx("NZDUSD", "Kiwi / US Dollar", "Majors"),
    fx("USDJPY", "US Dollar / Yen", "Majors"),
    fx("USDCHF", "US Dollar / Franc", "Majors"),
    fx("USDCAD", "US Dollar / Canadian Dollar", "Majors"),
  ];
}

function minors() {
  return [
    fx("EURGBP", "Euro / Sterling", "Minors"),
    fx("EURJPY", "Euro / Yen", "Minors"),
    fx("EURCHF", "Euro / Franc", "Minors"),
    fx("EURCAD", "Euro / Canadian Dollar", "Minors"),
    fx("EURAUD", "Euro / Aussie", "Minors"),
    fx("EURNZD", "Euro / Kiwi", "Minors"),
    fx("GBPJPY", "Sterling / Yen", "Minors"),
    fx("GBPCHF", "Sterling / Franc", "Minors"),
    fx("GBPCAD", "Sterling / Canadian Dollar", "Minors"),
    fx("GBPAUD", "Sterling / Aussie", "Minors"),
    fx("GBPNZD", "Sterling / Kiwi", "Minors"),
    fx("AUDJPY", "Aussie / Yen", "Minors"),
    fx("AUDCHF", "Aussie / Franc", "Minors"),
    fx("AUDCAD", "Aussie / Canadian Dollar", "Minors"),
    fx("AUDNZD", "Aussie / Kiwi", "Minors"),
    fx("NZDJPY", "Kiwi / Yen", "Minors"),
    fx("NZDCHF", "Kiwi / Franc", "Minors"),
    fx("NZDCAD", "Kiwi / Canadian Dollar", "Minors"),
    fx("CADJPY", "Canadian Dollar / Yen", "Minors"),
    fx("CADCHF", "Canadian Dollar / Franc", "Minors"),
    fx("CHFJPY", "Franc / Yen", "Minors"),
  ];
}

function exotics() {
  return [
    fx("USDSEK", "US Dollar / Swedish Krona", "Exotics"),
    fx("USDNOK", "US Dollar / Norwegian Krone", "Exotics"),
    fx("USDDKK", "US Dollar / Danish Krone", "Exotics"),
    fx("USDZAR", "US Dollar / Rand", "Exotics"),
    fx("USDMXN", "US Dollar / Mexican Peso", "Exotics"),
    fx("USDTRY", "US Dollar / Turkish Lira", "Exotics"),
    fx("USDSGD", "US Dollar / Singapore Dollar", "Exotics"),
    fx("USDHKD", "US Dollar / Hong Kong Dollar", "Exotics"),
    fx("USDPLN", "US Dollar / Zloty", "Exotics"),
    fx("USDHUF", "US Dollar / Forint", "Exotics"),
    fx("USDCZK", "US Dollar / Koruna", "Exotics"),
  ];
}
