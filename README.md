# Aurum Desk

A private trading desk for one target: **$10,000 in five months**, with an MT5 position-size calculator for gold, majors, minors, and exotics.

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`. Closed trades and calculator settings stay in `localStorage` on that browser. Nothing is sent to a broker.

## Position size

The volume is the number to type into MetaTrader 5.

```
risk amount = balance × risk%
price distance = pips × pip size, or points × point size
loss per 1.00 lot = price distance × contract size × (quote currency in account currency)
exact lots = risk amount / loss per lot
MT5 volume = exact lots, floored to the lot step
```

Flooring keeps the order inside the risk budget.

Defaults follow common MT5 specifications:

| Symbol | Contract | 1 pip | 1 point |
| --- | --- | --- | --- |
| XAUUSD | 100 oz | 0.01 ($1 per lot on a USD account) | 0.01 |
| XAGUSD | 5,000 oz | 0.001 | 0.001 |
| EURUSD and other 5-digit FX | 100,000 | 0.0001 (10 points) | 0.00001 |
| USDJPY and other JPY quotes | 100,000 | 0.01 (10 points) | 0.001 |

Pip value for a USD account:

- **EURUSD:** $10 per pip per lot. A $100 risk and a 20 pip stop is **0.50** lots.
- **XAUUSD:** $1 per pip per lot. A $300 risk and a 100 pip stop is **3.00** lots.
- **USDJPY:** `(0.01 × 100,000) / price`. At 150.00 that is about $6.67 per pip, so a $100 risk and a 20 pip stop is **0.75** lots.

If the quote currency is not the account currency, the desk converts with your MT5 price when USD is one side of the pair (USDJPY, USDCHF, USDCAD). Other rates use the ECB mid-market feed from [Frankfurter](https://www.frankfurter.app/). Paste **Tick value** from MT5’s Specification window when you want the broker’s own figure to win.

Margin is an estimate (forex: `lots × contract / leverage` in the base currency; gold: `lots × contract × price / leverage`). Check it on the MT5 order ticket.

Contract size, pip size, point, and lot step can be edited per symbol so they match your broker. Some brokers suffix symbols (`XAUUSD.m`) or use a different gold contract.

## The book

The runway is a straight line from the start date to five months later. Log each close in account currency. The month tickets and the pace line use only what you enter. The default target is $10,000 from the day you first open the desk.

## Tests

```bash
node --test
```
