// Time helpers. Vercel runs in UTC, but "3pm" and "today" mean the user's own timezone
// (XPLOG_TIMEZONE, default Kuala Lumpur).
export const userTz = () => process.env.XPLOG_TIMEZONE || "Asia/Kuala_Lumpur";

// "Today" as the user sees it.
export function dateContext(now = new Date(), tz = userTz()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  return { tz, date, weekday };
}

// How far the timezone is ahead of UTC at a given moment, in ms.
function tzOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

// "2026-10-20" + "15:00" in the user's timezone -> UTC milliseconds.
export function zonedToMs(dateKey, hhmm = "00:00", tz = userTz()) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - tzOffsetMs(guess, tz);
}

// UTC milliseconds -> { date: "2026-10-20", time: "15:00", hour: 15 } in the user's timezone.
export function msToZoned(ms, tz = userTz()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, hour: Number(get("hour")) };
}
