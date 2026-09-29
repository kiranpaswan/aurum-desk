import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPairPrice,
  midPrice,
  sizePosition,
  usdPerUnitFromUsdBaseRates,
} from "./sizing.js";

const USD = { USD: 1 };

test("EURUSD USD account: 1% risk and 20 pips is 0.50 lots", () => {
  const result = sizePosition({
    symbol: "EURUSD",
    accountCurrency: "USD",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    stopUnit: "pips",
    usdPerUnit: USD,
  });
  assert.equal(result.ok, true);
  assert.equal(result.riskAmount, 100);
  assert.equal(result.pipValuePerLot, 10);
  assert.equal(result.exactLots, 0.5);
  assert.equal(result.volumeLots, 0.5);
  assert.equal(result.units, 50000);
  assert.equal(result.miniLots, 5);
  assert.equal(result.microLots, 50);
});

test("XAUUSD uses a 100 oz contract and a 0.01 pip", () => {
  const result = sizePosition({
    symbol: "XAUUSD",
    accountCurrency: "USD",
    balance: 10000,
    riskPercent: 3,
    stopValue: 100,
    stopUnit: "pips",
    usdPerUnit: USD,
    price: 2650,
    leverage: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.riskAmount, 300);
  assert.equal(result.pipValuePerLot, 1);
  assert.equal(result.volumeLots, 3);
  assert.equal(result.units, 300);
  assert.equal(result.margin, (3 * 100 * 2650) / 100);
});

test("200 MT5 points on EURUSD match 20 pips", () => {
  const pips = sizePosition({
    symbol: "EURUSD",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    stopUnit: "pips",
    usdPerUnit: USD,
  });
  const points = sizePosition({
    symbol: "EURUSD",
    balance: 10000,
    riskPercent: 1,
    stopValue: 200,
    stopUnit: "points",
    usdPerUnit: USD,
  });
  assert.equal(points.volumeLots, pips.volumeLots);
  assert.equal(points.distance, pips.distance);
});

test("USDJPY pip value follows the MT5 price", () => {
  const result = sizePosition({
    symbol: "USDJPY",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    stopUnit: "pips",
    price: 150,
    usdPerUnit: USD,
  });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.pipValuePerLot - 1000 / 150) < 1e-9);
  assert.equal(result.exactLots, 0.75);
  assert.equal(result.volumeLots, 0.75);
});

test("volume floors to the 0.01 lot step", () => {
  const result = sizePosition({
    symbol: "EURGBP",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    stopUnit: "pips",
    usdPerUnit: { USD: 1, GBP: 1.27 },
  });
  assert.ok(Math.abs(result.pipValuePerLot - 12.7) < 1e-9);
  assert.ok(Math.abs(result.exactLots - 100 / 254) < 1e-9);
  assert.equal(result.volumeLots, 0.39);
});

test("gold in an EUR account converts the dollar pip", () => {
  const rates = usdPerUnitFromUsdBaseRates({ EUR: 1 / 1.1 });
  const result = sizePosition({
    symbol: "XAUUSD",
    accountCurrency: "EUR",
    balance: 10000,
    riskPercent: 1,
    stopValue: 100,
    stopUnit: "pips",
    usdPerUnit: rates,
  });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.pipValuePerLot - 1 / 1.1) < 1e-9);
  assert.ok(Math.abs(result.exactLots - 1.1) < 1e-9);
  assert.equal(result.volumeLots, 1.1);
});

test("a typed MT5 price overrides the mid-market leg", () => {
  const mid = usdPerUnitFromUsdBaseRates({ JPY: 149 });
  const used = applyPairPrice(mid, { base: "USD", quote: "JPY", asset: "forex" }, 150);
  assert.ok(Math.abs(used.JPY - 1 / 150) < 1e-12);
  assert.ok(Math.abs(midPrice({ base: "EUR", quote: "USD", asset: "forex" }, { USD: 1, EUR: 1.08 }) - 1.08) < 1e-12);
});

test("a pasted MT5 tick value overrides the rate model", () => {
  const result = sizePosition({
    symbol: "USDJPY",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    stopUnit: "pips",
    tickValue: 1000 / 150 / 10,
    usdPerUnit: USD,
  });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.pipValuePerLot - 1000 / 150) < 1e-9);
  assert.equal(result.volumeLots, 0.75);
});

test("missing conversion rate explains what to enter", () => {
  const result = sizePosition({
    symbol: "USDJPY",
    balance: 10000,
    riskPercent: 1,
    stopValue: 20,
    usdPerUnit: USD,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /USDJPY price|JPY to USD/i);
});
