import { groqJson, hasGroq } from "../server/groq.js";
import { msToZoned, userTz, zonedToMs } from "../server/time.js";
import { addDays, fromKey, toKey } from "../date.js";

// Turns "tomorrow 3pm call mum" / "in 30 minutes take the laundry out" / "明天下午3点开会" into
// { text, atMs } (UTC milliseconds), or { error }.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n) => String(n).padStart(2, "0");

const DAY_WORDS = [
  [/day after tomorrow|后天/i, 2],
  [/tomorrow|明天|明早|明晚/i, 1],
  [/today|tonight|今天|今晚|今早/i, 0],
];

// Deterministic parser for the common phrasings (used when the AI is unavailable or fails).
export function parseReminderFallback(body, now = new Date(), tz = userTz()) {
  const nowMs = now.getTime();
  let text = body.trim();
  const cut = (re) => {
    const m = text.match(re);
    if (m) text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    return m;
  };
  const tidy = (t) => t.replace(/^(?:me\s+)?(?:to|that|about)\s+/i, "").replace(/^(?:提醒我|提醒|我要|记得|要)\s*/, "").replace(/^[\s,，:：-]+|[\s,，:：-]+$/g, "").trim() || body.trim();

  // "in 30 minutes", "after 2 hours", "30分钟后"
  const rel = cut(/(?:\b(?:in|after)\s+)(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|m)\b/i) || cut(/(\d+(?:\.\d+)?)\s*(分钟|小时)\s*后?/);
  if (rel) {
    const n = Number(rel[1]);
    const hours = /^(h|hr|hrs|hour|hours|小时)$/i.test(rel[2]);
    return { text: tidy(text), atMs: nowMs + n * (hours ? 3600000 : 60000) };
  }

  // day
  const today = msToZoned(nowMs, tz).date;
  let dayOffset = null;
  let day = null;
  const iso = cut(/\d{4}-\d{2}-\d{2}/);
  if (iso) day = iso[0];
  else {
    for (const [re, off] of DAY_WORDS) {
      if (cut(re)) { dayOffset = off; break; }
    }
    if (dayOffset !== null) day = toKey(addDays(fromKey(today), dayOffset));
  }

  // time of day
  let hour = null;
  let minute = 0;
  let m;
  if ((m = cut(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i))) {
    hour = Number(m[1]) % 12 + (m[3].toLowerCase() === "pm" ? 12 : 0);
    minute = Number(m[2] || 0);
  } else if ((m = cut(/(上午|早上|早晨|中午|下午|晚上|傍晚)?\s*(\d{1,2})\s*[点時时](半|\d{1,2})?/))) {
    hour = Number(m[2]);
    if (/下午|晚上|傍晚/.test(m[1] || "") && hour < 12) hour += 12;
    if (/中午/.test(m[1] || "") && hour < 6) hour += 12;
    minute = m[3] === "半" ? 30 : Number(m[3] || 0);
  } else if ((m = cut(/(?:\bat\s+)?(\d{1,2}):(\d{2})\b/i))) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  }

  if (hour === null && !day) return { error: "没看懂提醒的时间。可以这样说:remind: tomorrow 3pm call mum / remind me in 30 minutes to … / 提醒 明天下午3点 开会" };
  if (hour === null) { hour = 9; minute = 0; } // a day but no time: 09:00
  if (hour > 23 || minute > 59) return { error: "时间不对,请检查一下(例如 3pm 或 15:30)。" };

  const hhmm = `${pad(hour)}:${pad(minute)}`;
  let atMs;
  if (day) {
    atMs = zonedToMs(day, hhmm, tz);
  } else {
    atMs = zonedToMs(today, hhmm, tz);
    if (atMs <= nowMs) atMs = zonedToMs(toKey(addDays(fromKey(today), 1)), hhmm, tz); // already passed today -> tomorrow
  }
  return { text: tidy(text), atMs };
}

export async function parseReminder(body, { now = new Date(), tz = userTz() } = {}) {
  let result = null;
  if (hasGroq()) {
    try {
      const local = msToZoned(now.getTime(), tz);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
      const out = await groqJson(
        `You turn a chat message into one reminder. Right now it is ${weekday} ${local.date} ${local.time} (${tz}).
Return ONLY strict JSON: {"text": string, "date": string, "time": string, "error": string|null}
- text: what to remind the user about, short, in the user's own language (e.g. "call mum"). Drop words like "remind me to".
- date: YYYY-MM-DD. Resolve relative dates ("tomorrow", "next Friday") and relative times ("in 30 minutes" = now + 30 minutes) against the current time.
- time: 24-hour "HH:MM". If no time is given use "09:00". If no date is given, use today if that time is still ahead, otherwise tomorrow.
- error: a short Chinese explanation if the message has no usable reminder or time, otherwise null.`,
        body
      );
      if (!out.error && typeof out.text === "string" && out.text.trim() && DATE_RE.test(out.date || "") && TIME_RE.test(out.time || "")) {
        result = { text: out.text.trim(), atMs: zonedToMs(out.date, out.time, tz) };
      }
    } catch {
      // fall back to the simple parser
    }
  }
  if (!result) result = parseReminderFallback(body, now, tz);
  if (result.atMs && result.atMs <= now.getTime() - 60000) return { error: "这个时间已经过了。请换一个未来的时间。" };
  return result;
}

export const formatLocal = (ms, tz = userTz()) => {
  const z = msToZoned(ms, tz);
  return `${z.date} ${z.time}`;
};
