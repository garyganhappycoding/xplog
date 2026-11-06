// Self-test for the Google Calendar two-way sync (no Google account needed):
//   npm run test:google
import assert from "node:assert/strict";
import { syncGoogle, toGoogle, fromGoogle } from "../lib/server/googleSync.js";
import { signState, verifyState } from "../lib/server/google.js";

const TZ = "Asia/Kuala_Lumpur";

// A tiny fake Google Calendar: events with a version counter, so "changes since a sync token" works.
function fakeGoogle() {
  const events = new Map();
  let version = 0;
  let n = 0;
  const stamp = () => new Date(1700000000000 + ++version * 1000).toISOString();
  const api = {
    events,
    ops: [],
    expireToken: false,
    async listChanges({ syncToken }) {
      api.ops.push(["list", syncToken]);
      if (syncToken && api.expireToken) { api.expireToken = false; const e = new Error("gone"); e.code = 410; throw e; }
      const since = syncToken ? Number(syncToken) : -1;
      const items = [...events.values()].filter((e) => e._v > since && (syncToken || e.status !== "cancelled"));
      return { items: items.map(({ _v, ...e }) => e), nextSyncToken: String(version) };
    },
    async insert(body) { const id = `g${++n}`; const e = { ...body, id, status: "confirmed", updated: stamp(), _v: version }; events.set(id, e); api.ops.push(["insert", id]); return { id, updated: e.updated }; },
    async patch(id, body) { const e = events.get(id); if (!e || e.status === "cancelled") { const err = new Error("nf"); err.code = 404; throw err; } Object.assign(e, body, { updated: stamp(), _v: version }); api.ops.push(["patch", id]); return { id, updated: e.updated }; },
    async remove(id) { const e = events.get(id); if (e) { e.status = "cancelled"; e.updated = stamp(); e._v = version; } api.ops.push(["remove", id]); },
    // what a person does in Google Calendar
    userCreates(body) { const id = `g${++n}`; events.set(id, { id, status: "confirmed", ...body, updated: stamp(), _v: version }); return id; },
    userEdits(id, patch) { Object.assign(events.get(id), patch, { updated: stamp(), _v: version }); },
    userDeletes(id) { const e = events.get(id); e.status = "cancelled"; e.updated = stamp(); e._v = version; },
  };
  return api;
}

function memoryStore(seed = {}) {
  const data = { events: [], todos: [], ...seed };
  let n = 100;
  let priv = { google: { refreshToken: "r" } };
  return {
    data,
    list: async (c) => data[c].map((d) => ({ ...d })),
    add: async (c, doc) => { const id = `${c}-${++n}`; data[c].push({ id, ...doc }); return id; },
    update: async (c, id, patch) => { Object.assign(data[c].find((d) => d.id === id), patch); },
    remove: async (c, id) => { data[c] = data[c].filter((d) => d.id !== id); },
    getPrivate: async () => JSON.parse(JSON.stringify(priv.google)),
    setPrivate: async (_k, v) => { priv.google = JSON.parse(JSON.stringify(v)); },
    priv: () => priv.google,
  };
}

const ev = (id, extra = {}) => ({ id, title: `Event ${id}`, date: "2026-11-10", startTime: "10:00", endTime: "11:30", color: "#3f51b5", location: "", notes: "", repeat: "none", repeatUntil: null, ...extra });
const task = (id, extra = {}) => ({ id, text: `Task ${id}`, done: false, projectId: "p1", doDate: "2026-11-10", startTime: "15:00", endTime: "16:00", ...extra });

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("  ✓", name); };
const sync = (store, google, extra = {}) => syncGoogle({ store, gcal: google, tz: TZ, ...extra });

await test("events and time-blocked to-dos are converted to Google events (and untimed to-dos are not)", async () => {
  const store = memoryStore({
    events: [
      ev("e1", { location: "图书馆", notes: "带电脑", color: "#d50000" }),
      ev("e2", { startTime: null, endTime: null, title: "Mum 的生日", repeat: "yearly", date: "2026-10-26" }),
      ev("e3", { repeat: "weekly", repeatUntil: "2026-12-20" }),
    ],
    todos: [task("t1"), task("t2", { done: true }), task("t3", { startTime: null, endTime: null }), task("t4", { doDate: null, startTime: "09:00" })],
  });
  const g = fakeGoogle();
  const out = await sync(store, g);
  assert.deepEqual({ ok: out.ok, pushed: out.pushed }, { ok: true, pushed: 5 });
  const all = [...g.events.values()];
  const by = (title) => all.find((e) => e.summary === title);

  const e1 = by("Event e1");
  assert.deepEqual(e1.start, { dateTime: "2026-11-10T10:00:00", timeZone: TZ });
  assert.deepEqual(e1.end, { dateTime: "2026-11-10T11:30:00", timeZone: TZ });
  assert.equal(e1.location, "图书馆");
  assert.equal(e1.description, "带电脑");
  assert.equal(e1.colorId, "11", "tomato");
  assert.equal(e1.extendedProperties.private.xplog, "events:e1");

  const bday = by("Mum 的生日");
  assert.deepEqual(bday.start, { date: "2026-10-26" });
  assert.deepEqual(bday.end, { date: "2026-10-27" }, "all-day events end the day after");
  assert.deepEqual(bday.recurrence, ["RRULE:FREQ=YEARLY"]);
  assert.deepEqual(by("Event e3").recurrence, ["RRULE:FREQ=WEEKLY;UNTIL=20261220T235959Z"]);

  assert.ok(by("Task t1"), "a time block");
  assert.equal(by("Task t1").description, "待办 · XPLog");
  assert.ok(by("✓ Task t2"), "done to-dos are marked");
  assert.ok(!by("Task t3"), "no time -> not a time block");
  assert.ok(!by("Task t4"), "no date -> not a time block");
  assert.equal(Object.keys(store.priv().links).length, 5);
});

await test("a second sync with nothing changed sends nothing and imports nothing", async () => {
  const store = memoryStore({ events: [ev("e1")], todos: [task("t1")] });
  const g = fakeGoogle();
  await sync(store, g);
  g.ops.length = 0;
  const out = await sync(store, g);
  assert.deepEqual({ pushed: out.pushed, imported: out.imported, pulled: out.pulled, deleted: out.deleted }, { pushed: 0, imported: 0, pulled: 0, deleted: 0 });
  assert.equal(g.ops.filter((o) => o[0] !== "list").length, 0);
  assert.equal(store.data.events.length, 1, "our own events are not imported back as duplicates");
  await sync(store, g);
  assert.equal(g.events.size, 2);
});

await test("edits in the app are patched into Google; deleting removes the Google event; finishing a to-do adds a tick", async () => {
  const store = memoryStore({ events: [ev("e1"), ev("e2")], todos: [task("t1")] });
  const g = fakeGoogle();
  await sync(store, g);
  const gid = (key) => Object.entries(store.priv().links).find(([, l]) => `${l.col}:${l.id}` === key)[0];

  await store.update("events", "e1", { title: "Renamed", startTime: "11:00", endTime: "12:00" });
  await store.remove("events", "e2");
  await store.update("todos", "t1", { done: true });
  const out = await sync(store, g);
  assert.deepEqual({ pushed: out.pushed, deleted: out.deleted }, { pushed: 2, deleted: 1 });
  assert.equal(g.events.get(gid("events:e1")).summary, "Renamed");
  assert.equal(g.events.get(gid("events:e1")).start.dateTime, "2026-11-10T11:00:00");
  assert.equal(g.events.get(gid("todos:t1")).summary, "✓ Task t1");

  // a to-do that loses its time leaves the calendar
  const tg = gid("todos:t1");
  await store.update("todos", "t1", { startTime: null });
  await sync(store, g);
  assert.equal(g.events.get(tg).status, "cancelled");
  assert.equal(Object.keys(store.priv().links).length, 1);
});

await test("events made in Google appear in the app (once)", async () => {
  const store = memoryStore();
  const g = fakeGoogle();
  await sync(store, g);
  g.userCreates({ summary: "和 Emily 午餐", location: "KLCC", description: "AI 项目", start: { dateTime: "2026-11-12T12:30:00+08:00" }, end: { dateTime: "2026-11-12T13:30:00+08:00" }, colorId: "5" });
  g.userCreates({ summary: "放假", start: { date: "2026-11-14" }, end: { date: "2026-11-15" } });
  const out = await sync(store, g);
  assert.equal(out.imported, 2);
  const lunch = store.data.events.find((e) => e.title === "和 Emily 午餐");
  assert.deepEqual({ date: lunch.date, start: lunch.startTime, end: lunch.endTime, loc: lunch.location, notes: lunch.notes, color: lunch.color, source: lunch.source }, { date: "2026-11-12", start: "12:30", end: "13:30", loc: "KLCC", notes: "AI 项目", color: "#f6bf26", source: "google" });
  assert.equal(store.data.events.find((e) => e.title === "放假").startTime, null);
  await sync(store, g);
  await sync(store, g);
  assert.equal(store.data.events.length, 2, "no duplicates on later syncs");
  assert.equal(g.events.size, 2, "and nothing is pushed back as a copy");
});

await test("a UTC time from Google is shown in your own time zone", async () => {
  const f = fromGoogle({ summary: "x", start: { dateTime: "2026-11-12T04:30:00Z" }, end: { dateTime: "2026-11-12T06:00:00Z" } }, TZ);
  assert.deepEqual({ date: f.date, start: f.startTime, end: f.endTime }, { date: "2026-11-12", start: "12:30", end: "14:00" });
  const late = fromGoogle({ summary: "x", start: { dateTime: "2026-11-12T20:00:00Z" }, end: { dateTime: "2026-11-12T21:00:00Z" } }, TZ);
  assert.equal(late.date, "2026-11-13", "04:00 the next day in Kuala Lumpur");
});

await test("edits and deletions made in Google reach the app", async () => {
  const store = memoryStore({ events: [ev("e1"), ev("e2")], todos: [task("t1")] });
  const g = fakeGoogle();
  await sync(store, g);
  const gid = (key) => Object.entries(store.priv().links).find(([, l]) => `${l.col}:${l.id}` === key)[0];

  g.userEdits(gid("events:e1"), { summary: "Moved in Google", start: { dateTime: "2026-11-11T09:00:00+08:00" }, end: { dateTime: "2026-11-11T10:00:00+08:00" } });
  g.userEdits(gid("todos:t1"), { summary: "✓ Task t1 (new name)", start: { dateTime: "2026-11-10T17:00:00+08:00" }, end: { dateTime: "2026-11-10T18:00:00+08:00" } });
  g.userDeletes(gid("events:e2"));
  const out = await sync(store, g);
  assert.equal(out.pulled, 3);
  const e1 = store.data.events.find((e) => e.id === "e1");
  assert.deepEqual({ title: e1.title, date: e1.date, start: e1.startTime, end: e1.endTime }, { title: "Moved in Google", date: "2026-11-11", start: "09:00", end: "10:00" });
  assert.ok(!store.data.events.some((e) => e.id === "e2"), "deleted in Google -> gone here");
  const t1 = store.data.todos[0];
  assert.deepEqual({ text: t1.text, start: t1.startTime, end: t1.endTime }, { text: "Task t1 (new name)", start: "17:00", end: "18:00" });
  const again = await sync(store, g);
  assert.deepEqual({ pushed: again.pushed, pulled: again.pulled }, { pushed: 0, pulled: 0 }, "settled: nothing bounces back");
});

await test("conflict: changed on both sides since the last sync -> the app's version wins", async () => {
  const store = memoryStore({ events: [ev("e1")] });
  const g = fakeGoogle();
  await sync(store, g);
  const gid = Object.keys(store.priv().links)[0];
  g.userEdits(gid, { summary: "Google's idea" });
  await store.update("events", "e1", { title: "The app's idea" });
  await sync(store, g);
  assert.equal(store.data.events[0].title, "The app's idea");
  assert.equal(g.events.get(gid).summary, "The app's idea");
});

await test("repeating events from Google: simple rules come in, complicated ones come in as a single event", async () => {
  const simple = fromGoogle({ summary: "Weekly", start: { dateTime: "2026-11-10T10:00:00+08:00" }, end: { dateTime: "2026-11-10T11:00:00+08:00" }, recurrence: ["RRULE:FREQ=WEEKLY;UNTIL=20261220T155959Z"] }, TZ);
  assert.deepEqual({ r: simple.repeat, u: simple.repeatUntil }, { r: "weekly", u: "2026-12-20" });
  assert.equal(fromGoogle({ summary: "x", start: { date: "2026-10-26" }, end: { date: "2026-10-27" }, recurrence: ["RRULE:FREQ=YEARLY"] }, TZ).repeat, "yearly");
  for (const rule of ["RRULE:FREQ=WEEKLY;INTERVAL=2", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "RRULE:FREQ=DAILY;INTERVAL=3"]) {
    assert.equal(fromGoogle({ summary: "x", start: { date: "2026-10-26" }, end: { date: "2026-10-27" }, recurrence: [rule] }, TZ).repeat, "none", rule);
  }
  // exceptions to a series are ignored (they would otherwise show up as extra events)
  const store = memoryStore();
  const g = fakeGoogle();
  await sync(store, g);
  g.userCreates({ summary: "One instance", recurringEventId: "series", start: { date: "2026-11-10" }, end: { date: "2026-11-11" } });
  await sync(store, g);
  assert.equal(store.data.events.length, 0);
});

await test("an expired sync position (410) starts over without duplicating anything", async () => {
  const store = memoryStore({ events: [ev("e1")] });
  const g = fakeGoogle();
  await sync(store, g);
  g.userCreates({ summary: "From Google", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } });
  g.expireToken = true;
  const out = await sync(store, g);
  assert.equal(out.ok, true);
  assert.equal(store.data.events.length, 2);
  assert.equal(g.events.size, 2);
});

await test("at most maxPush events are sent per run; the rest follow on the next run", async () => {
  const store = memoryStore({ events: Array.from({ length: 7 }, (_, i) => ev(`e${i}`)) });
  const g = fakeGoogle();
  assert.equal((await sync(store, g, { maxPush: 3 })).pushed, 3);
  assert.equal((await sync(store, g, { maxPush: 3 })).pushed, 3);
  assert.equal((await sync(store, g, { maxPush: 3 })).pushed, 1);
  assert.equal(g.events.size, 7);
});

await test("a failure keeps the progress already made (no duplicates on retry) and is reported", async () => {
  const store = memoryStore({ events: [ev("e1"), ev("e2"), ev("e3")] });
  const g = fakeGoogle();
  const insert = g.insert;
  let calls = 0;
  g.insert = async (b) => { if (++calls === 3) throw new Error("Google 500"); return insert(b); };
  const out = await sync(store, g);
  assert.deepEqual({ ok: out.ok, error: out.error }, { ok: false, error: "Google 500" });
  assert.equal(store.priv().lastError, "Google 500");
  g.insert = insert;
  assert.equal((await sync(store, g)).ok, true);
  assert.equal(g.events.size, 3, "e1 and e2 were not sent twice");
});

await test("not connected -> nothing happens; a running sync blocks a second one", async () => {
  const store = memoryStore({ events: [ev("e1")] });
  store.getPrivate = async () => ({});
  assert.equal((await sync(store, fakeGoogle())).ok, false);
  const s2 = memoryStore({ events: [ev("e1")] });
  await s2.setPrivate("google", { refreshToken: "r", lockUntil: Date.now() + 60000 });
  const g = fakeGoogle();
  assert.deepEqual(await sync(s2, g), { ok: true, skipped: true });
  assert.equal(g.ops.length, 0);
});

await test("the sign-in 'state' is signed, expires, and cannot be forged", () => {
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  const st = signState("uid-1", 1000);
  assert.equal(verifyState(st, 2000), "uid-1");
  assert.equal(verifyState(st, 1000 + 16 * 60000), null, "expired");
  const [payload] = st.split(".");
  assert.equal(verifyState(`${payload}.deadbeef`, 2000), null);
  const forged = `${Buffer.from(JSON.stringify({ uid: "someone-else", t: 1000 })).toString("base64url")}.${st.split(".")[1]}`;
  assert.equal(verifyState(forged, 2000), null);
  assert.equal(verifyState("", 2000), null);
});

await test("toGoogle: end defaults to one hour after the start; bad end times are fixed", () => {
  assert.equal(toGoogle("events", ev("e", { endTime: null }), TZ).end.dateTime, "2026-11-10T11:00:00");
  assert.equal(toGoogle("events", ev("e", { startTime: "10:00", endTime: "09:00" }), TZ).end.dateTime, "2026-11-10T11:00:00");
  assert.equal(toGoogle("events", ev("e", { startTime: "23:30", endTime: null }), TZ).end.dateTime, "2026-11-10T23:59:00");
});

console.log(`\n${passed} checks passed`);
