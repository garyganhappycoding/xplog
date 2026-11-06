import { createHash } from "node:crypto";
import { addDays, fromKey, toKey } from "../date.js";
import { msToZoned, userTz } from "./time.js";

// Two-way sync between the app (events + time-blocked to-dos) and your primary Google Calendar.
//
//   app -> Google:  every event, and every to-do that has a date AND a start time (a "time block"),
//                   becomes a Google event (to-dos are marked "待办 · XPLog"; done ones get a ✓).
//   Google -> app:  events made or edited in Google appear in the app; cancelled ones disappear.
//   Conflicts:      if the same item changed on both sides since the last sync, the app's version wins.
//
// A "link" (stored on the server, outside what the browser can read) remembers which Google event
// belongs to which app item and what was last pushed, so only real changes are sent.
//
// Known limits: Google events that repeat in complicated ways (every 2 weeks, several weekdays) come in
// as a single event; exceptions to a repeating event are ignored; multi-day events show on their first day.

const GOOGLE_COLORS = { "#7986cb": "1", "#33b679": "2", "#8e24aa": "3", "#e67c73": "4", "#f6bf26": "5", "#f4511e": "6", "#039be5": "7", "#616161": "8", "#3f51b5": "9", "#0b8043": "10", "#d50000": "11" };
const COLOR_OF_ID = Object.fromEntries(Object.entries(GOOGLE_COLORS).map(([hex, id]) => [id, hex]));
const FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
const REPEAT_OF = Object.fromEntries(Object.entries(FREQ).map(([k, v]) => [v, k]));

const hash = (o) => createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const compact = (key) => key.replaceAll("-", "");

// App item -> Google event body.
export function toGoogle(col, doc, tz) {
  const task = col === "todos";
  const date = task ? doc.doDate : doc.date;
  const summary = task ? `${doc.done ? "✓ " : ""}${doc.text}` : doc.title;
  const body = { summary, location: (!task && doc.location) || "", description: task ? "待办 · XPLog" : doc.notes || "", reminders: { useDefault: true } };

  if (doc.startTime) {
    let end = doc.endTime && toMin(doc.endTime) > toMin(doc.startTime) ? doc.endTime : fromMin(Math.min(23 * 60 + 59, toMin(doc.startTime) + 60));
    body.start = { dateTime: `${date}T${doc.startTime}:00`, timeZone: tz };
    body.end = { dateTime: `${date}T${end}:00`, timeZone: tz };
  } else {
    body.start = { date };
    body.end = { date: toKey(addDays(fromKey(date), 1)) };
  }

  if (!task && FREQ[doc.repeat]) {
    const until = doc.repeatUntil ? `;UNTIL=${compact(doc.repeatUntil)}${doc.startTime ? "T235959Z" : ""}` : "";
    body.recurrence = [`RRULE:FREQ=${FREQ[doc.repeat]}${until}`];
  } else {
    body.recurrence = [];
  }
  const colorId = !task && GOOGLE_COLORS[String(doc.color || "").toLowerCase()];
  if (colorId) body.colorId = colorId;
  body.extendedProperties = { private: { xplog: `${col}:${doc.id}` } };
  return body;
}

// Google event -> app fields (or null if it cannot be shown).
export function fromGoogle(g, tz) {
  if (!g?.start) return null;
  let date;
  let startTime = null;
  let endTime = null;
  if (g.start.dateTime) {
    const s = msToZoned(Date.parse(g.start.dateTime), tz);
    date = s.date;
    startTime = s.time;
    if (g.end?.dateTime) {
      const e = msToZoned(Date.parse(g.end.dateTime), tz);
      endTime = e.date === date ? e.time : "23:59";
    }
  } else {
    date = g.start.date;
  }
  if (!date) return null;

  let repeat = "none";
  let repeatUntil = null;
  const rule = (g.recurrence || []).find((r) => r.startsWith("RRULE:"));
  if (rule) {
    const p = Object.fromEntries(rule.slice(6).split(";").map((x) => x.split("=")));
    const simple = REPEAT_OF[p.FREQ] && (!p.INTERVAL || p.INTERVAL === "1") && (!p.BYDAY || (p.FREQ === "WEEKLY" && !p.BYDAY.includes(",")));
    if (simple) {
      repeat = REPEAT_OF[p.FREQ];
      if (p.UNTIL) repeatUntil = `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`;
    }
  }
  return {
    title: g.summary || "(无标题)", date, startTime, endTime, location: g.location || "", notes: g.description || "",
    repeat, repeatUntil, color: COLOR_OF_ID[g.colorId] || null,
  };
}

const ignore404 = (e) => { if (e.code !== 404 && e.code !== 410) throw e; };

// One sync run. `gcal`: { listChanges, insert, patch, remove } (see lib/server/google.js).
export async function syncGoogle({ store, gcal, tz = userTz(), maxPush = 80 }) {
  const state = (await store.getPrivate("google")) || {};
  if (!state.refreshToken) return { ok: false, error: "还没有连接 Google 日历" };
  if (state.lockUntil > Date.now()) return { ok: true, skipped: true }; // another sync is running
  const links = state.links || {};
  const stats = { imported: 0, pulled: 0, pushed: 0, deleted: 0 };
  await store.setPrivate("google", { ...state, lockUntil: Date.now() + 90000 });

  try {
    const [events, todos] = await Promise.all([store.list("events"), store.list("todos")]);
    const docs = { events: new Map(events.map((d) => [d.id, d])), todos: new Map(todos.map((d) => [d.id, d])) };
    const hashOf = (col, doc) => hash(toGoogle(col, doc, tz));

    // ---- Google -> app ----------------------------------------------------------------------
    let changes;
    try {
      changes = await gcal.listChanges({ syncToken: state.syncToken || null });
    } catch (e) {
      if (e.code !== 410) throw e; // the saved position expired: start over
      changes = await gcal.listChanges({ syncToken: null });
    }

    for (const g of changes.items) {
      const link = links[g.id];
      if (g.status === "cancelled") {
        if (link) {
          await store.remove(link.col, link.id).catch(() => {});
          docs[link.col].delete(link.id);
          delete links[g.id];
          stats.pulled++;
        }
        continue;
      }
      if (g.recurringEventId) continue; // an exception to a repeating event
      const loc = fromGoogle(g, tz);
      if (!loc) continue;

      if (link) {
        const doc = docs[link.col].get(link.id);
        if (!doc) continue; // deleted in the app: the step below removes it from Google
        if (g.updated === link.gUpdated) continue; // that is our own write coming back
        if (hashOf(link.col, doc) !== link.hash) continue; // changed in the app too: the app wins
        let patch;
        if (link.col === "events") {
          patch = { title: loc.title, date: loc.date, startTime: loc.startTime, endTime: loc.endTime, location: loc.location, notes: loc.notes, repeat: loc.repeat, repeatUntil: loc.repeatUntil };
          if (loc.color) patch.color = loc.color;
        } else {
          if (!loc.startTime) continue; // a to-do stays a time block
          patch = { text: loc.title.replace(/^✓ /, ""), doDate: loc.date, startTime: loc.startTime, endTime: loc.endTime };
        }
        await store.update(link.col, link.id, patch);
        Object.assign(doc, patch);
        link.hash = hashOf(link.col, doc);
        link.gUpdated = g.updated;
        stats.pulled++;
        continue;
      }

      const mark = g.extendedProperties?.private?.xplog; // made by us, but the link was lost
      if (mark) {
        const [col, id] = mark.split(":");
        const doc = docs[col]?.get(id);
        if (doc && !Object.values(links).some((l) => l.col === col && l.id === id)) links[g.id] = { col, id, hash: hashOf(col, doc), gUpdated: g.updated };
        continue;
      }

      const fields = { title: loc.title, date: loc.date, startTime: loc.startTime, endTime: loc.endTime, location: loc.location, notes: loc.notes, repeat: loc.repeat, repeatUntil: loc.repeatUntil, color: loc.color || "#1a73e8", remindBeforeDays: 0, createdAt: Date.now(), source: "google" };
      const id = await store.add("events", fields);
      const doc = { id, ...fields };
      docs.events.set(id, doc);
      links[g.id] = { col: "events", id, hash: hashOf("events", doc), gUpdated: g.updated };
      stats.imported++;
    }

    // ---- app -> Google ----------------------------------------------------------------------
    const linkOf = Object.fromEntries(Object.entries(links).map(([gid, l]) => [`${l.col}:${l.id}`, gid]));
    const wanted = [];
    for (const ev of docs.events.values()) if (ev.date) wanted.push(["events", ev]);
    for (const t of docs.todos.values()) if (t.doDate && t.startTime) wanted.push(["todos", t]);

    let ops = 0;
    for (const [col, doc] of wanted) {
      if (ops >= maxPush) break;
      const body = toGoogle(col, doc, tz);
      const h = hash(body);
      const gid = linkOf[`${col}:${doc.id}`];
      if (!gid) {
        const res = await gcal.insert(body);
        links[res.id] = { col, id: doc.id, hash: h, gUpdated: res.updated };
        ops++;
        stats.pushed++;
      } else if (links[gid].hash !== h) {
        try {
          const res = await gcal.patch(gid, body);
          links[gid].hash = h;
          links[gid].gUpdated = res.updated;
        } catch (e) {
          ignore404(e); // deleted in Google meanwhile; the next pull cleans up
        }
        ops++;
        stats.pushed++;
      }
    }

    const wantedKeys = new Set(wanted.map(([col, d]) => `${col}:${d.id}`));
    for (const [gid, l] of Object.entries(links)) {
      if (wantedKeys.has(`${l.col}:${l.id}`)) continue;
      await gcal.remove(gid);
      delete links[gid];
      stats.deleted++;
    }

    const saved = (await store.getPrivate("google")) || state;
    await store.setPrivate("google", { ...saved, links, lockUntil: 0, syncToken: changes.nextSyncToken || null, lastSync: Date.now(), lastError: null, lastStats: stats });
    return { ok: true, ...stats };
  } catch (e) {
    const saved = (await store.getPrivate("google")) || state;
    await store.setPrivate("google", { ...saved, links, lockUntil: 0, lastError: String(e.message || e).slice(0, 200), lastErrorAt: Date.now() }).catch(() => {});
    return { ok: false, error: String(e.message || e) };
  }
}
