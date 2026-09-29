/** Five-month profit runway. Dates are ISO days (YYYY-MM-DD) in UTC. */

export function addMonths(iso, count) {
  const [year, month, day] = iso.split("-").map(Number);
  const targetMonth = month - 1 + count;
  const first = new Date(Date.UTC(year, targetMonth, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return toIso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), clamped)));
}

export function todayIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function daysBetween(startIso, endIso) {
  const ms = Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function weekdayCount(startIso, endIso) {
  if (endIso < startIso) return 0;
  let count = 0;
  for (let t = Date.parse(`${startIso}T00:00:00Z`); t <= Date.parse(`${endIso}T00:00:00Z`); t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function monthWindows(startIso, months) {
  const windows = [];
  for (let i = 0; i < months; i += 1) {
    const start = addMonths(startIso, i);
    const end = addMonths(startIso, i + 1);
    windows.push({ index: i, start, end });
  }
  return windows;
}

export function buildPlan({
  startDate,
  target,
  months,
  trades,
  today,
}) {
  const deadline = addMonths(startDate, months);
  const totalDays = Math.max(1, daysBetween(startDate, deadline));
  const elapsed = clamp(daysBetween(startDate, today), 0, totalDays);
  const daysLeft = Math.max(0, totalDays - elapsed);
  const earned = (trades || []).reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const remaining = target - earned;
  const expected = (target * elapsed) / totalDays;
  const delta = earned - expected;
  const weekdaysLeft = weekdayCount(today, deadline);
  const perWeekday = weekdaysLeft > 0 ? Math.max(0, remaining) / weekdaysLeft : 0;
  const windows = monthWindows(startDate, months).map((window) => {
    const actual = (trades || []).reduce((sum, trade) => {
      if (!trade.date) return sum;
      const last = window.index === months - 1;
      const inside = last
        ? trade.date >= window.start && trade.date <= window.end
        : trade.date >= window.start && trade.date < window.end;
      return inside ? sum + Number(trade.pnl || 0) : sum;
    }, 0);
    return {
      ...window,
      label: monthLabel(window.start),
      range: `${shortDate(window.start)} – ${shortDate(
        window.index === months - 1 ? window.end : dayBefore(window.end),
      )}`,
      target: target / months,
      actual,
    };
  });

  let status = "on";
  if (delta > target * 0.005) status = "ahead";
  else if (delta < -target * 0.005) status = "behind";

  return {
    deadline,
    totalDays,
    elapsed,
    daysLeft,
    earned,
    remaining,
    expected,
    delta,
    weekdaysLeft,
    perWeekday,
    windows,
    status,
    progress: target > 0 ? Math.max(0, earned / target) : 0,
  };
}

function monthLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function dayBefore(iso) {
  return toIso(new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000));
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
