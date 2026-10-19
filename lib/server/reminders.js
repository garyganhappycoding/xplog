import { addDays, fromKey, toKey } from "../date.js";
import { eventsInRange } from "./schedule.js";
import { msToZoned, userTz, zonedToMs } from "./time.js";

// What the scheduler does each time it runs (every few minutes, or just once a day on a free plan):
//   1. reminders you set in chat ("remind: tomorrow 3pm call mum") that have come due
//   2. a heads-up shortly before each timed calendar event
//   3. a morning summary of today's events and to-dos
// Every message is "claimed" first (atomic, by key), so overlapping or repeated runs never send twice.
//
// `store`: Firestore store (list / update / claim / unclaim).  `send(text)`: delivers to Telegram.
export async function runReminders({ store, send, now = new Date(), tz = userTz(), eventLeadMinutes = 30, digestHour = 8 }) {
  const nowMs = now.getTime();
  const local = msToZoned(nowMs, tz);
  const sent = [];

  const deliver = async (key, text) => {
    if (!(await store.claim(key))) return false;
    try {
      await send(text);
    } catch (e) {
      await store.unclaim(key); // delivery failed: let the next run try again
      throw e;
    }
    sent.push({ key, text });
    return true;
  };

  // 1. reminders set in chat ---------------------------------------------------------------
  const reminders = (await store.list("reminders")).filter((r) => !r.sent && r.at <= nowMs);
  for (const r of reminders.sort((a, b) => a.at - b.at)) {
    const late = nowMs - r.at > 15 * 60000;
    const when = late ? `\n(原定 ${msToZoned(r.at, tz).date} ${msToZoned(r.at, tz).time})` : "";
    await deliver(`rem:${r.id}`, `⏰ 提醒:${r.text}${when}`);
    await store.update("reminders", r.id, { sent: true, sentAt: nowMs });
  }

  // 2. timed events starting soon ----------------------------------------------------------
  const events = await store.list("events");
  const tomorrow = toKey(addDays(fromKey(local.date), 1));
  for (const day of [local.date, tomorrow]) {
    for (const ev of eventsInRange(events, day, day)) {
      if (!ev.startTime || ev.multiDay) continue;
      const startMs = zonedToMs(day, ev.startTime, tz);
      if (startMs - eventLeadMinutes * 60000 <= nowMs && nowMs < startMs) {
        const mins = Math.max(1, Math.round((startMs - nowMs) / 60000));
        await deliver(
          `ev:${ev.eventId}:${day}:${eventLeadMinutes}`,
          `📅 ${mins} 分钟后:${ev.title}\n🕒 ${ev.startTime}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.prepNote ? `\n🧰 记得准备:${ev.prepNote}` : ""}`
        );
      }
    }
  }

  // 3. morning summary -----------------------------------------------------------------------
  if (local.hour >= digestHour && local.hour < 22) {
    const key = `digest:${local.date}`;
    const [todos, projects] = await Promise.all([store.list("todos"), store.list("projects")]);
    const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
    const todayEvents = eventsInRange(events, local.date, local.date).filter((e) => !e.multiDay);
    const open = todos.filter((t) => !t.done);
    const planned = open.filter((t) => t.doDate === local.date || t.dueDate === local.date);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < local.date);

    if (!todayEvents.length && !planned.length && !overdue.length) {
      await store.claim(key); // nothing to say today; don't check again
    } else {
      const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: tz, weekday: "long" }).format(now);
      const todoLine = (t, extra = "") => `• ${t.text}${projectName[t.projectId] ? `(${projectName[t.projectId]})` : ""}${extra}`;
      const parts = [`🌅 早安!今天是 ${local.date} ${weekday}`];
      if (todayEvents.length) {
        parts.push(`📅 今天的日程\n${todayEvents.map((e) => `• ${e.startTime || "全天"} ${e.title}${e.location ? ` @${e.location}` : ""}${e.prepNote ? `\n   🧰 ${e.prepNote}` : ""}`).join("\n")}`);
      }
      if (planned.length) {
        parts.push(`☑️ 今天的待办\n${planned.map((t) => todoLine(t, t.dueDate === local.date ? " — 今天截止" : "")).join("\n")}`);
      }
      if (overdue.length) {
        parts.push(`⚠️ 已逾期\n${overdue.map((t) => todoLine(t, ` — 截止 ${t.dueDate}`)).join("\n")}`);
      }
      await deliver(key, parts.join("\n\n"));
    }
  }

  return sent;
}
