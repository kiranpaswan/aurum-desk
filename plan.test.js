import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, buildPlan, weekdayCount } from "./plan.js";

test("five months from 29 Sep 2026 lands on 28 Feb 2027", () => {
  assert.equal(addMonths("2026-09-29", 5), "2027-02-28");
  const plan = buildPlan({
    startDate: "2026-09-29",
    target: 10000,
    months: 5,
    trades: [],
    today: "2026-09-29",
  });
  assert.equal(plan.deadline, "2027-02-28");
  assert.equal(plan.windows.length, 5);
  assert.equal(plan.windows[0].range, "29 Sept – 28 Oct");
  assert.equal(plan.windows[4].start, "2027-01-29");
  assert.equal(plan.windows[4].range, "29 Jan – 28 Feb");
  assert.equal(plan.earned, 0);
  assert.equal(plan.expected, 0);
  assert.equal(plan.status, "on");
});

test("logged profit lands in the right month and moves the pace", () => {
  const plan = buildPlan({
    startDate: "2026-09-29",
    target: 10000,
    months: 5,
    today: "2026-10-15",
    trades: [
      { date: "2026-10-01", pnl: 400 },
      { date: "2026-10-29", pnl: 250 },
      { date: "2027-02-28", pnl: 1000 },
    ],
  });
  assert.equal(plan.windows[0].actual, 400);
  assert.equal(plan.windows[1].actual, 250);
  assert.equal(plan.windows[4].actual, 1000);
  assert.equal(plan.earned, 1650);
  assert.equal(plan.status, "ahead");
});

test("weekday count skips weekends", () => {
  assert.equal(weekdayCount("2026-09-28", "2026-10-02"), 5);
});
