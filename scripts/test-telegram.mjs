// Self-test for the Telegram bot logic (no Firebase, Telegram or Groq needed):
//   npm run test:telegram
import assert from "node:assert/strict";
import { parseCommand, extractTags, detectNotionSave } from "../lib/telegram/commands.js";
import { parseTodosFallback, dateContext } from "../lib/telegram/llm.js";
import { handleMessage } from "../lib/telegram/handlers.js";
import { fallbackKeywords, ask, formatAnswer, eventsInRange, todosFor, parseRange, fallbackPlan } from "../lib/server/rag.js";
import { parseReminder, parseReminderFallback } from "../lib/telegram/remind.js";
import { runReminders } from "../lib/server/reminders.js";
import { zonedToMs, msToZoned } from "../lib/server/time.js";

// In-memory stand-in for the Firestore store.
function memoryStore(seed = {}) {
  const data = { projects: [], todos: [], skills: [], diaryEntries: [], events: [], reminders: [], ...seed };
  let n = 0;
  const store = {
    data,
    list: async (c) => data[c].map((d) => ({ ...d })),
    add: async (c, doc) => { const id = `${c}-${++n}`; data[c].push({ id, ...doc }); return id; },
    update: async (c, id, patch) => { Object.assign(data[c].find((d) => d.id === id), patch); },
    claimed: new Set(),
    claim: async (key) => { if (store.claimed.has(key)) return false; store.claimed.add(key); return true; },
    unclaim: async (key) => { store.claimed.delete(key); },
    remove: async (c, id) => { data[c] = data[c].filter((d) => d.id !== id); },
    pending: null,
    setPending: async (item) => { store.pending = item; },
    takePending: async () => { const p = store.pending; store.pending = null; return p; },
    addXp: async (id, d) => { const s = data.skills.find((x) => x.id === id); s.totalXp = (s.totalXp || 0) + d; },
  };
  return store;
}

const llm = {
  parseReminder: async (body, { now }) => parseReminderFallback(body, now),
  parseTodos: async (body) => parseTodosFallback(body),
  parseEvent: async () => ({
    title: "牙医", date: "2026-10-25", startTime: "15:00", endTime: null, location: "Klinik Sentosa",
    notes: null, prepNote: "带保险卡", prepDate: "2026-10-24", repeat: "none", repeatUntil: null,
  }),
  tagEntry: async () => ({ skill: "Public Speaking", xpDelta: 5, confidence: 0.9 }),
  syncIdea: async () => ({ pageId: "notion-page-1" }),
};

// Stand-in for the Notion-backed memory service.
const saved = [];
const asked = [];
const memory = {
  save: async (args) => { saved.push(args); return { page: { title: "鸡饭 RM8.50" }, tags: ["价格"], photoSaved: !!args.photo, photoError: null, vision: args.photo ? { text: "Chicken Rice RM 8.50" } : null }; },
  ask: async (q, ctx) => { asked.push(q); memory.lastCtx = ctx; return { answered: true, summary: "鸡饭 RM8.50(10/18 记录)", details: "10/18 在 Kedai Ali 记录:RM8.50", followUp: ["下次再确认一下价格有没有变"], sources: [{ title: "鸡饭 RM8.50", date: "2026-10-18" }] }; },
};
const loadPhoto = async (id) => ({ buffer: Buffer.from(id), mime: "image/jpeg", filename: `${id}.jpg` });
const run = (args) => handleMessage({ memory, loadPhoto, ...args });

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("  ✓", name); };

await test("command routing", () => {
  assert.deepEqual(parseCommand("todo\nbuy milk"), { kind: "todo", body: "buy milk" });
  assert.equal(parseCommand("Todo: a").kind, "todo");
  assert.equal(parseCommand("/todo@xplog_bot a").kind, "todo");
  assert.equal(parseCommand("待办买牛奶").body, "买牛奶");
  assert.equal(parseCommand("entry: hello").kind, "entry");
  assert.equal(parseCommand("diary hello").kind, "entry");
  assert.equal(parseCommand("idea: x").kind, "idea");
  assert.equal(parseCommand("event: x").kind, "event");
  assert.equal(parseCommand("/start").kind, "help");
  assert.equal(parseCommand("todolist is a word").kind, null);
  assert.equal(parseCommand("random chatter").kind, null);
});

await test("hashtags become tags", () => {
  assert.deepEqual(extractTags("练习演讲 #演讲 #book 很棒"), { text: "练习演讲 很棒", tags: ["演讲", "book"] });
});

await test("your example: 'do this / do that (catogerize under blablabal)' files both under one project", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm, text: "todo\ndo this\ndo that (catogerize under blablabal)" });
  assert.equal(store.data.projects.length, 1);
  assert.equal(store.data.projects[0].name, "blablabal");
  assert.deepEqual(store.data.todos.map((t) => t.text), ["do this", "do that"]);
  assert.ok(store.data.todos.every((t) => t.projectId === store.data.projects[0].id && t.done === false && t.sectionId === null));
  assert.ok(store.data.todos[0].order < store.data.todos[1].order, "keeps the order you typed");
  assert.match(reply, /已添加 2 个待办/);
});

await test("category matches an existing project (case-insensitive) instead of duplicating", async () => {
  const store = memoryStore({ projects: [{ id: "p1", name: "Gary Bookshelf", color: "#C9A24B", order: 0 }] });
  await run({ store, llm, text: "todo\n- read ch 3\n- reshelve\n(under gary bookshelf)" });
  assert.equal(store.data.projects.length, 1);
  assert.equal(store.data.todos.length, 2);
  assert.ok(store.data.todos.every((t) => t.projectId === "p1"));
});

await test("no category goes to the 收件箱 inbox, created once", async () => {
  const store = memoryStore();
  await run({ store, llm, text: "todo\nbuy milk\ncall mum" });
  await run({ store, llm, text: "todo: pay bills" });
  assert.equal(store.data.projects.filter((p) => p.name === "收件箱").length, 1);
  assert.equal(store.data.todos.length, 3);
});

await test("entry logs a diary entry the same way the website does, and adds XP", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm, text: "entry: 今天练了演讲 #演讲" });
  const e = store.data.diaryEntries[0];
  assert.equal(e.text, "今天练了演讲");
  assert.deepEqual(e.tags, ["演讲"]);
  assert.equal(e.isIdea, false);
  assert.equal(e.skill, "Public Speaking");
  assert.equal(e.xpDelta, 5);
  assert.equal(e.aiTagged, true);
  assert.equal(store.data.skills[0].totalXp, 5);
  assert.equal(e.skillId, store.data.skills[0].id);
  assert.match(reply, /Public Speaking \+5 XP/);
  await run({ store, llm, text: "entry: again" });
  assert.equal(store.data.skills.length, 1, "reuses the skill");
  assert.equal(store.data.skills[0].totalXp, 10);
});

await test("idea and entry are saved in the app AND in Notion (idea = 思考过的事情, entry = 琐碎事情)", async () => {
  const calls = [];
  const spy = { ...llm, syncIdea: async (args) => { calls.push(args); return { pageId: "notion-page-1" }; } };
  const store = memoryStore();
  const r1 = await run({ store, llm: spy, text: "idea: a reading-notes app" });
  assert.equal(store.data.diaryEntries[0].isIdea, true);
  assert.equal(store.data.diaryEntries[0].notionPageId, "notion-page-1");
  assert.equal(calls[0].level, "思考过的事情");
  assert.match(r1, /已存到 Notion · 思考过的事情/);
  const r2 = await run({ store, llm: spy, text: "entry: 今天练了演讲 #演讲" });
  assert.equal(store.data.diaryEntries[1].notionPageId, "notion-page-1");
  assert.equal(calls[1].level, "琐碎事情");
  assert.equal(calls[1].text, "今天练了演讲", "tags are stripped from the text, as in the app");
  assert.match(r2, /已存到 Notion · 琐碎事情/);
  // a Notion failure is reported, the diary entry is still kept
  const bad = { ...llm, syncIdea: async () => ({ error: "Notion 没有配置" }) };
  const r3 = await run({ store, llm: bad, text: "entry: x" });
  assert.equal(store.data.diaryEntries.length, 3);
  assert.match(r3, /Notion 保存失败:Notion 没有配置/);
});

await test("RULES: note/think/output/idea/entry save to Notion; ask/todo/event never do", async () => {
  const notionWrites = { saved: 0, synced: 0 };
  const llmSpy = { ...llm, syncIdea: async () => { notionWrites.synced++; return { pageId: "p" }; } };
  const memSpy = { ...memory, save: async (a) => { notionWrites.saved++; return memory.save(a); } };
  const send = (text, extra = {}) => handleMessage({ store: memoryStore(), llm: llmSpy, memory: memSpy, loadPhoto, text, ...extra });
  const total = () => notionWrites.saved + notionWrites.synced;

  for (const t of ["note: a", "think: b", "output: c", "idea: d", "entry: e"]) {
    const before = total();
    await send(t);
    assert.equal(total(), before + 1, `${t} should save to Notion`);
  }
  const before = total();
  await send("ask: how much is chicken rice");
  await send("how much is chicken rice?");
  await send("todo\nbuy milk\ncall mum");
  await send("event: dentist 25 Oct 3pm");
  assert.equal(total(), before, "ask / todo / event must not write to Notion");
});

await test("/help is recognised and spells out the rules", () => {
  assert.equal(parseCommand("/help").kind, "help");
});

await test("event stores time/location and creates a linked 'prepare' to-do", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm, text: "event: dentist 25 Oct 3pm\nbring insurance card the day before" });
  const ev = store.data.events[0];
  assert.equal(ev.title, "牙医");
  assert.equal(ev.startTime, "15:00");
  assert.equal(ev.endTime, "16:00", "defaults to one hour");
  assert.equal(ev.location, "Klinik Sentosa");
  const todo = store.data.todos[0];
  assert.equal(todo.doDate, "2026-10-24");
  assert.equal(todo.text, "准备:带保险卡 · 牙医");
  assert.equal(todo.eventId, ev.id);
  assert.equal(ev.prepTodoId, todo.id);
  assert.match(reply, /Klinik Sentosa/);
});

await test("event without a date is rejected with a helpful message", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm: { ...llm, parseEvent: async () => ({ error: "没看懂日期" }) }, text: "event: dentist" });
  assert.match(reply, /没看懂日期/);
  assert.equal(store.data.events.length, 0);
});

await test("help and unknown messages", async () => {
  const store = memoryStore();
  assert.match(await run({ store, llm, text: "/help" }), /todo/);
  await run({ store, llm, text: "hello" }); // no keyword -> treated as a question
  assert.equal(asked.at(-1), "hello");
});

await test("today is computed in the user's timezone", () => {
  const c = dateContext(new Date("2026-10-18T20:00:00Z"), "Asia/Kuala_Lumpur"); // 04:00 next day in MYT
  assert.equal(c.date, "2026-10-19");
  assert.equal(c.weekday, "Monday");
});

await test("memory commands save at the right level", async () => {
  saved.length = 0;
  const store = memoryStore();
  await run({ store, llm, text: "note: 鸡饭 RM8.50 @Kedai Ali" });
  await run({ store, llm, text: "think: 为什么我总是拖延" });
  await run({ store, llm, text: "output: 做一期关于拖延的视频" });
  assert.deepEqual(saved.map((x) => x.level), ["trivia", "thought", "output"]);
  assert.equal(saved[0].text, "鸡饭 RM8.50 @Kedai Ali");
  assert.equal(parseCommand("记: 咖啡 RM12").kind, "trivia");
  assert.equal(parseCommand("记得买牛奶").kind, null, "a bare 记 must not trigger inside a sentence");
  assert.equal(parseCommand("琐碎 今天看到的").kind, "trivia");
});

await test("a photo on its own is NOT saved; it is held until you say save this into notion", async () => {
  saved.length = 0;
  const store = memoryStore();
  const r1 = await run({ store, llm, text: "", photo: { fileId: "f1" } });
  assert.equal(saved.length, 0, "nothing saved yet");
  assert.match(r1, /还没有存到 Notion/);
  assert.deepEqual({ type: store.pending.type, fileId: store.pending.fileId }, { type: "photo", fileId: "f1" });

  const r2 = await run({ store, llm, text: "save this into notion" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].level, "trivia");
  assert.equal(saved[0].photo.filename, "f1.jpg", "the held photo is downloaded and saved now");
  assert.match(r2, /照片已保存/);
  assert.equal(store.pending, null, "pending is used up");

  // pick the level while saving the held photo
  await run({ store, llm, text: "", photo: { fileId: "f2" } });
  await run({ store, llm, text: "think" });
  assert.equal(saved.at(-1).level, "thought");
  assert.equal(saved.at(-1).photo.filename, "f2.jpg");

  // nothing to save
  assert.match(await run({ store, llm, text: "save this into notion" }), /没有等待保存/);
});

await test("a photo with an explicit save instruction is saved straight away", async () => {
  saved.length = 0;
  const store = memoryStore();
  await run({ store, llm, text: "chicken rice RM8.50, save this into notion", photo: { fileId: "f3" } });
  assert.equal(saved[0].level, "trivia");
  assert.equal(saved[0].text, "chicken rice RM8.50");
  await run({ store, llm, text: "think: nice decor", photo: { fileId: "f4" } });
  assert.equal(saved[1].level, "thought");
  assert.equal(saved[1].text, "nice decor");
  assert.match(await run({ store, llm, text: "todo: x", photo: { fileId: "f5" } }), /照片目前只能/);
  assert.equal(saved.length, 2);
});

await test("plain text is never saved to Notion; saying so in the message (or afterwards) saves it", async () => {
  saved.length = 0;
  asked.length = 0;
  const store = memoryStore();
  await run({ store, llm, text: "how much is chicken rice" });
  assert.equal(saved.length, 0);
  assert.equal(asked.at(-1), "how much is chicken rice");
  await run({ store, llm, text: "鸡饭 RM8.50 @Kedai Ali, save this into notion" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, "鸡饭 RM8.50 @Kedai Ali");
  // todos / events / questions never touch Notion, even if the phrase appears
  await run({ store, llm, text: "todo: buy milk, save this into notion" });
  await run({ store, llm, text: "ask: chicken rice" });
  assert.equal(saved.length, 1);
});

await test("the Notion-save phrase is recognised, and not guessed from ordinary sentences", () => {
  for (const t of ["save this into notion", "please save to Notion", "put it in notion", "存到 Notion", "保存到notion: x"]) assert.equal(detectNotionSave(t).wants, true, t);
  for (const t of ["I saved notes in my notion yesterday", "todo save money", "note: chicken rice", "what is notion"]) assert.equal(detectNotionSave(t).wants, false, t);
  assert.equal(detectNotionSave("Chicken rice, save this into notion").text, "Chicken rice");
});

await test("questions go to the memory (explicit or free text)", async () => {
  asked.length = 0;
  const store = memoryStore();
  const r = await run({ store, llm, text: "ask: 鸡饭多少钱" });
  assert.deepEqual(asked, ["鸡饭多少钱"]);
  assert.match(r, /RM8.50/);
  assert.match(r, /来源/);
  await run({ store, llm, text: "how much was the chicken rice?" });
  assert.equal(asked.at(-1), "how much was the chicken rice?");
});

await test("question keywords for retrieval (no-AI fallback)", () => {
  assert.deepEqual(fallbackKeywords("what is the price of chicken rice?"), ["chicken", "rice"]);
  assert.ok(fallbackKeywords("鸡饭多少钱").includes("鸡饭"));
  assert.ok(fallbackKeywords("上次在 Kedai Ali 吃的鸡饭价格").includes("kedai"));
});

// ---- the "say you don't have the answer" rule ---------------------------------------------
const note = (id, title, content, date = "2026-10-18T05:00:00.000Z") => ({ id, title, content, level: "琐碎事情", url: `https://notion.so/${id}`, createdTime: date });
const related = [note("a", "鸡饭 RM8.50 @Kedai Ali", "鸡饭 RM8.50 @Kedai Ali #价格"), note("b", "Nasi lemak 很特别", "这家店的 nasi lemak 很特别")];

await test("no related notes at all -> 'I don't have the answer' (in the question's language)", async () => {
  const none = { retrieve: async () => ({ keywords: ["x"], items: [] }), available: () => true, json: async () => { throw new Error("must not call the AI"); } };
  const en = await ask("What is my wifi password?", none);
  assert.match(en.answer, /I don't have the answer/);
  assert.equal(en.answered, false);
  assert.deepEqual(en.sources, []);
  assert.match((await ask("我的 wifi 密码是多少", none)).answer, /我没有这个问题的答案/);
});

await test("related notes that don't contain the answer -> no answer + the notes as references", async () => {
  let rules = "";
  const deps = {
    retrieve: async () => ({ keywords: ["nasi"], items: related }),
    available: () => true,
    json: async (system) => { rules = system; return { answerable: false, answer: "I don't have the answer to that.", used: [] }; },
  };
  const r = await ask("How much is the teh tarik?", deps);
  assert.equal(r.answered, false);
  assert.equal(r.answer, "I don't have the answer to that.");
  assert.equal(r.sources.length, 2, "closest notes are offered for reference");
  assert.match(rules, /ONLY the data provided/);
  assert.match(rules, /merely on a related topic does NOT count/);
});

await test("a note that really answers it -> the answer, citing only the notes used", async () => {
  const deps = {
    retrieve: async () => ({ keywords: ["鸡饭"], items: related }),
    available: () => true,
    json: async () => ({ answerable: true, answer: "鸡饭 RM8.50(10/18 记录,Kedai Ali)", used: [1] }),
  };
  const r = await ask("鸡饭多少钱", deps);
  assert.equal(r.answered, true);
  assert.match(r.answer, /RM8.50/);
  assert.deepEqual(r.sources.map((s) => s.id), ["a"]);
});

await test("an AI that says answerable=true with an empty answer is treated as no answer", async () => {
  const deps = { retrieve: async () => ({ keywords: ["k"], items: related }), available: () => true, json: async () => ({ answerable: true, answer: "  ", used: [] }) };
  assert.equal((await ask("anything", deps)).answered, false);
});

await test("AI unavailable or failing -> never claims an answer, shows the notes to read", async () => {
  const off = await ask("鸡饭多少钱", { retrieve: async () => ({ keywords: [], items: related }), available: () => false });
  assert.equal(off.answered, false);
  assert.match(off.answer, /没法判断/);
  assert.equal(off.sources.length, 2);
  const boom = await ask("q", { retrieve: async () => ({ keywords: [], items: related }), available: () => true, json: async () => { throw new Error("429"); } });
  assert.equal(boom.answered, false);
});

await test("an answer has four parts: summary, details, sources, follow-up decisions", async () => {
  const deps = {
    retrieve: async () => ({ keywords: ["鸡饭"], items: related }),
    available: () => true,
    json: async () => ({
      answerable: true,
      summary: "鸡饭 RM8.50。",
      details: "- 10/18 在 Kedai Ali 记录:RM8.50\n- 价格含饮料",
      followUp: ["- 想不想比较别家的价格?", "下次再去时确认价格有没有变"],
      used: [1],
    }),
  };
  const r = await ask("鸡饭多少钱", deps);
  assert.equal(r.answered, true);
  assert.equal(r.summary, "鸡饭 RM8.50。");
  assert.match(r.details, /Kedai Ali/);
  assert.deepEqual(r.followUp, ["想不想比较别家的价格?", "下次再去时确认价格有没有变"], "bullets are cleaned");
  assert.deepEqual(r.sources.map((x) => x.id), ["a"]);

  const text = formatAnswer(r);
  const order = ["1️⃣ 总结 Summary", "2️⃣ 详细 Details", "3️⃣ 来源 Sources", "4️⃣ 后续决策 Next steps"].map((h) => text.indexOf(h));
  assert.ok(order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), "all four headings, in order");
  assert.match(text, /鸡饭 RM8.50。/);
  assert.match(text, /• 想不想比较别家的价格\?/);
  assert.ok(!/仅供参考/.test(text), "a real answer cites sources, not references");
});

await test("no answer still uses the same four parts, with references and next steps", async () => {
  const deps = {
    retrieve: async () => ({ keywords: ["nasi"], items: related }),
    available: () => true,
    json: async () => ({ answerable: false, summary: "I don't have the answer to that.", details: "", followUp: [], used: [] }),
  };
  const r = await ask("How much is the teh tarik?", deps);
  assert.equal(r.answered, false);
  assert.equal(r.summary, "I don't have the answer to that.");
  assert.ok(r.followUp.length >= 1 && /note:/.test(r.followUp.join(" ")), "suggests saving the answer");
  const text = formatAnswer(r);
  assert.match(text, /^1️⃣ 总结 Summary\nI don't have the answer to that\./);
  assert.ok(text.includes("4️⃣ 后续决策 Next steps"));
  assert.ok(text.includes("仅供参考") && text.includes("Kedai Ali"));
  const none = formatAnswer(await ask("wifi password?", { retrieve: async () => ({ keywords: ["wifi"], items: [] }), available: () => true }));
  assert.match(none, /3️⃣ 来源 Sources\n—/);
  assert.match(none, /I don't have the answer/);
});

await test("the bot replies with the structured text", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm, text: "ask: 鸡饭多少钱" });
  for (const h of ["1️⃣ 总结 Summary", "2️⃣ 详细 Details", "3️⃣ 来源 Sources", "4️⃣ 后续决策 Next steps"]) assert.ok(reply.includes(h), h);
  assert.match(reply, /RM8.50/);
  assert.match(await run({ store, llm, text: "ask:" }), /ask: 鸡饭多少钱/, "empty question explains usage");
});

// ---- questions also read the calendar and the to-do list ----------------------------------
const NOW = new Date("2026-10-19T04:00:00Z"); // Monday 19 Oct 2026, 12:00 in Kuala Lumpur
const appStore = () => memoryStore({
  projects: [{ id: "p1", name: "Daily" }, { id: "p2", name: "Reading" }],
  events: [
    { id: "e1", title: "团队站会", date: "2026-10-20", startTime: "09:30", endTime: "10:00", location: "Zoom", repeat: "none" },
    { id: "e2", title: "晨间健身", date: "2026-10-10", startTime: "07:00", endTime: "07:30", repeat: "daily" },
    { id: "e3", title: "牙医", date: "2026-10-25", startTime: "15:00", endTime: "16:00", location: "Klinik Sentosa", prepNote: "带保险卡", prepDate: "2026-10-24", repeat: "none" },
  ],
  todos: [
    { id: "t1", projectId: "p1", text: "交报告", done: false, dueDate: "2026-10-23" },
    { id: "t2", projectId: "p1", text: "买牛奶", done: false, doDate: "2026-10-20" },
    { id: "t3", projectId: "p2", text: "读第三章", done: false },
    { id: "t4", projectId: "p1", text: "已完成的事", done: true },
  ],
});
const noAI = { available: () => false, now: NOW };

await test("date phrases resolve against today (Monday 19 Oct)", () => {
  assert.deepEqual(parseRange("what's on tomorrow", "2026-10-19"), ["2026-10-20", "2026-10-20"]);
  assert.deepEqual(parseRange("明天有什么安排", "2026-10-19"), ["2026-10-20", "2026-10-20"]);
  assert.deepEqual(parseRange("anything this week?", "2026-10-19"), ["2026-10-19", "2026-10-25"]);
  assert.deepEqual(parseRange("next week schedule", "2026-10-19"), ["2026-10-26", "2026-11-01"]);
  assert.equal(parseRange("鸡饭多少钱", "2026-10-19"), null);
  const plan = fallbackPlan("what is on my schedule tomorrow?", NOW);
  assert.deepEqual([plan.useCalendar, plan.useTodos, plan.useNotes, plan.from], [true, false, false, "2026-10-20"]);
  const todoPlan = fallbackPlan("which tasks are due this week", NOW);
  assert.deepEqual([todoPlan.useTodos, todoPlan.useNotes], [true, false]);
  assert.equal(fallbackPlan("鸡饭多少钱", NOW).useNotes, true);
});

await test("calendar: recurring events are expanded into the days asked about", () => {
  const { data } = appStore();
  const rows = eventsInRange(data.events, "2026-10-20", "2026-10-21");
  assert.deepEqual(rows.map((r) => `${r.displayDate} ${r.title}`), ["2026-10-20 晨间健身", "2026-10-20 团队站会", "2026-10-21 晨间健身"]);
  assert.match(rows[1].content, /09:30–10:00/);
  assert.match(rows[1].content, /地点:Zoom/);
  assert.match(eventsInRange(data.events, "2026-10-25", "2026-10-25").find((r) => r.title === "牙医").content, /需要准备:带保险卡/);
  assert.equal(eventsInRange(data.events, "2026-12-25", "2026-12-25").filter((r) => r.title === "团队站会").length, 0);
});

await test("to-dos: by project name, by date, or everything still open", () => {
  const { data } = appStore();
  const titles = (rows) => rows.map((r) => r.title);
  assert.deepEqual(titles(todosFor(data.todos, data.projects, "what todos are left in Daily", {})), ["买牛奶", "交报告"], "named project, open only, sorted by date");
  assert.deepEqual(titles(todosFor(data.todos, data.projects, "todos tomorrow", { from: "2026-10-20", to: "2026-10-20" })), ["买牛奶"]);
  assert.deepEqual(titles(todosFor(data.todos, data.projects, "what do I need to do", {})).sort(), ["交报告", "买牛奶", "读第三章"].sort(), "done ones are left out");
  assert.ok(titles(todosFor(data.todos, data.projects, "what have I completed", {})).includes("已完成的事"));
});

await test("ask reads the calendar (works even with no AI: the list is the answer)", async () => {
  const r = await ask("What's on my schedule tomorrow?", { ...noAI, store: appStore() });
  assert.equal(r.answered, true);
  assert.match(r.summary, /2026-10-20 有 2 个日程/);
  assert.match(r.details, /团队站会/);
  assert.match(r.details, /晨间健身/);
  assert.ok(r.sources.every((x) => x.kind === "event"));
  assert.match(formatAnswer(r), /📅/);
});

await test("an empty calendar is a real answer, not 'I don't have the answer'", async () => {
  const r = await ask("what is on 2026-12-25", { ...noAI, store: memoryStore({ events: [] }) });
  assert.equal(r.answered, true);
  assert.match(r.summary, /2026-12-25 没有日程/);
});

await test("ask reads the to-do list", async () => {
  const r = await ask("what todos do I have in Daily?", { ...noAI, store: appStore() });
  assert.equal(r.answered, true);
  assert.match(r.summary, /2 个相关待办/);
  assert.ok(r.details.includes("交报告") && r.details.includes("买牛奶") && !r.details.includes("读第三章"));
  assert.ok(r.sources.every((x) => x.kind === "todo"));
});

await test("with AI, the model sees today's date and the checked calendar, including '(none)'", async () => {
  const seen = [];
  const json = async (system, body) => {
    seen.push({ system, body });
    return { answerable: true, summary: "明天 9:30 有团队站会。", details: "09:30–10:00 Zoom", followUp: ["要不要先准备议程?"], used: [2] };
  };
  const r = await ask("What's on my schedule tomorrow?", { available: () => true, json, now: NOW, store: appStore() });
  assert.equal(r.answered, true);
  assert.match(seen[0].body, /Today is Monday 2026-10-19/);
  assert.match(seen[0].body, /CALENDAR EVENTS checked for 2026-10-20 to 2026-10-20/);
  assert.match(seen[0].body, /团队站会/);
  assert.match(seen[0].system, /\(none\)/, "the rules say an empty checked list is an answer");
  assert.deepEqual(r.sources.map((x) => x.title), ["团队站会"]);

  const empty = await ask("what is on 2026-12-25", { available: () => true, json: async (_s, body) => { seen.push({ body }); return { answerable: true, summary: "那天没有安排。", details: "", followUp: [], used: [] }; }, now: NOW, store: memoryStore({ events: [] }) });
  assert.match(seen.at(-1).body, /CALENDAR EVENTS checked for 2026-12-25 to 2026-12-25:\n\(none\)/);
  assert.equal(empty.answered, true);
});

await test("the bot hands the app data (store) to the question answering", async () => {
  const store = memoryStore();
  await run({ store, llm, text: "ask: what's on tomorrow" });
  assert.equal(memory.lastCtx.store, store);
  await run({ store, llm, text: "any todos left?" });
  assert.equal(memory.lastCtx.store, store);
});

// ---- reminders: the bot messages you first -------------------------------------------------
const KL = "Asia/Kuala_Lumpur";
const at = (day, hhmm) => zonedToMs(day, hhmm, KL);
const MON_NOON = new Date("2026-10-19T04:00:00Z"); // Monday 19 Oct, 12:00 in Kuala Lumpur

await test("times are converted in the user's timezone, not the server's", () => {
  assert.equal(at("2026-10-20", "15:00"), Date.UTC(2026, 9, 20, 7, 0));
  assert.deepEqual(msToZoned(Date.UTC(2026, 9, 20, 7, 0), KL), { date: "2026-10-20", time: "15:00", hour: 15 });
  assert.equal(msToZoned(Date.UTC(2026, 9, 19, 17, 30), KL).date, "2026-10-20", "5:30pm UTC is already tomorrow in KL");
  assert.equal(zonedToMs("2026-10-20", "15:00", "America/New_York") - zonedToMs("2026-10-20", "15:00", KL), 12 * 3600e3, "other zones differ (EDT is UTC-4)");
});

await test("remind: understands common ways of saying when", async () => {
  const p = (t) => parseReminderFallback(t, MON_NOON, KL);
  assert.deepEqual(p("in 30 minutes call mum"), { text: "call mum", atMs: MON_NOON.getTime() + 30 * 60000 });
  assert.deepEqual(p("me in 2 hours to take the laundry out"), { text: "take the laundry out", atMs: MON_NOON.getTime() + 2 * 3600e3 });
  assert.deepEqual(p("tomorrow 3pm call mum"), { text: "call mum", atMs: at("2026-10-20", "15:00") });
  assert.deepEqual(p("call mum at 15:30"), { text: "call mum", atMs: at("2026-10-19", "15:30") }, "later today");
  assert.deepEqual(p("9am gym"), { text: "gym", atMs: at("2026-10-20", "09:00") }, "9am already passed today -> tomorrow");
  assert.deepEqual(p("明天下午3点 开会"), { text: "开会", atMs: at("2026-10-20", "15:00") });
  assert.deepEqual(p("后天 交作业"), { text: "交作业", atMs: at("2026-10-21", "09:00") }, "a day but no time -> 09:00");
  assert.deepEqual(p("2026-11-01 8:30pm pay rent"), { text: "pay rent", atMs: at("2026-11-01", "20:30") });
  assert.ok(p("call mum").error, "no time at all");
  assert.match((await parseReminder("2026-10-01 9am old", { now: MON_NOON, tz: KL })).error || "", /已经过了/);
});

await test("remind / reminders / cancel in the chat", async () => {
  const store = memoryStore();
  const r1 = await run({ store, llm, text: "remind: tomorrow 3pm call mum", now: MON_NOON });
  assert.match(r1, /call mum/);
  assert.match(r1, /2026-10-20 15:00/);
  await run({ store, llm, text: "remind me in 30 minutes to take the laundry out", now: MON_NOON });
  await run({ store, llm, text: "提醒 明天下午3点 开会", now: MON_NOON });
  assert.equal(store.data.reminders.length, 3);
  assert.equal(store.data.reminders[0].sent, false);
  const list = await run({ store, llm, text: "reminders", now: MON_NOON });
  assert.match(list, /1\. 2026-10-19 12:30 — take the laundry out/, "sorted by time");
  assert.match(list, /开会/);
  const cancelled = await run({ store, llm, text: "cancel 1", now: MON_NOON });
  assert.match(cancelled, /take the laundry out/);
  assert.equal(store.data.reminders.length, 2);
  assert.match(await run({ store, llm, text: "cancel 9", now: MON_NOON }), /请写要取消的提醒编号/);
  assert.match(await run({ store, llm, text: "remind: call mum", now: MON_NOON }), /没看懂提醒的时间/);
  assert.match(await run({ store: memoryStore(), llm, text: "reminders", now: MON_NOON }), /没有待发送的提醒/);
  assert.equal(parseCommand("提醒 明天 开会").kind, "remind");
  assert.equal(parseCommand("remind me tomorrow").kind, "remind");
  assert.equal(parseCommand("cancel 2").kind, "cancel");
  assert.equal(parseCommand("reminders").kind, "reminders");
});

await test("scheduler: a reminder you set is sent once, when it is due", async () => {
  const store = memoryStore({ reminders: [
    { id: "r1", text: "call mum", at: at("2026-10-20", "15:00"), sent: false },
    { id: "r2", text: "drink water", at: at("2026-10-20", "16:00"), sent: false },
  ] });
  const out = [];
  const run1 = (iso) => runReminders({ store, send: async (t) => { out.push(t); }, now: new Date(iso), tz: KL });
  await run1("2026-10-20T06:59:00Z"); // 14:59 KL
  assert.equal(out.length, 0, "not due yet");
  await run1("2026-10-20T07:02:00Z"); // 15:02 KL
  assert.deepEqual(out, ["⏰ 提醒:call mum"]);
  assert.equal(store.data.reminders[0].sent, true);
  await run1("2026-10-20T07:07:00Z");
  assert.equal(out.length, 1, "never sent twice");
  await run1("2026-10-20T08:40:00Z"); // 16:40 KL, 40 min late
  assert.match(out[1], /drink water/);
  assert.match(out[1], /原定 2026-10-20 16:00/, "says it is late");
});

await test("scheduler: a heads-up shortly before a timed event, once", async () => {
  const store = appStore(); // 团队站会 20 Oct 09:30 (+ a daily 07:00 workout)
  const out = [];
  const at_ = (iso) => runReminders({ store, send: async (t) => { out.push(t); }, now: new Date(iso), tz: KL, eventLeadMinutes: 30, digestHour: 23 });
  await at_("2026-10-20T01:00:00Z"); // 09:00 KL: 30 min before the 09:30 event
  assert.equal(out.length, 1);
  assert.match(out[0], /30 分钟后:团队站会/);
  assert.match(out[0], /09:30/);
  assert.match(out[0], /Zoom/);
  await at_("2026-10-20T01:10:00Z");
  assert.equal(out.length, 1, "no repeat");
  await at_("2026-10-20T01:45:00Z"); // 09:45: the event has already started
  assert.equal(out.length, 1, "no reminder after it started");
  await at_("2026-10-19T22:40:00Z"); // 06:40 KL on the 20th: the daily 07:00 workout is 20 min away
  assert.match(out.at(-1), /晨间健身/, "recurring events are reminded too");
  assert.match(out.at(-1), /20 分钟后/);
});

await test("scheduler: morning summary of today's events and to-dos, once a day", async () => {
  const store = appStore();
  store.data.todos.push({ id: "t5", projectId: "p1", text: "还书", done: false, dueDate: "2026-10-18" });
  store.data.todos.push({ id: "t6", projectId: "p1", text: "写周报", done: false, dueDate: "2026-10-20" });
  const out = [];
  const go = (iso) => runReminders({ store, send: async (t) => { out.push(t); }, now: new Date(iso), tz: KL, digestHour: 8 });
  await go("2026-10-19T23:30:00Z"); // 07:30 KL
  assert.equal(out.length, 0, "before 8am");
  await go("2026-10-20T00:10:00Z"); // 08:10 KL
  assert.equal(out.length, 1);
  const msg = out[0];
  assert.match(msg, /早安!今天是 2026-10-20/);
  assert.match(msg, /📅 今天的日程/);
  assert.match(msg, /09:30 团队站会 @Zoom/);
  assert.match(msg, /☑️ 今天的待办/);
  assert.match(msg, /买牛奶\(Daily\)/, "planned for today");
  assert.match(msg, /写周报\(Daily\) — 今天截止/);
  assert.match(msg, /⚠️ 已逾期/);
  assert.match(msg, /还书\(Daily\) — 截止 2026-10-18/);
  assert.ok(!msg.includes("读第三章"), "to-dos with no date are not in the summary");
  await go("2026-10-20T00:40:00Z");
  assert.equal(out.length, 1, "only once per day");
  // a quiet day sends nothing
  const quiet = memoryStore({ events: [], todos: [], projects: [] });
  const none = [];
  await runReminders({ store: quiet, send: async (t) => { none.push(t); }, now: new Date("2026-10-20T00:10:00Z"), tz: KL });
  assert.equal(none.length, 0);
});

await test("scheduler: a failed delivery is retried on the next run, not lost", async () => {
  const store = memoryStore({ reminders: [{ id: "r1", text: "call mum", at: at("2026-10-20", "15:00"), sent: false }] });
  let fail = true;
  const out = [];
  const send = async (t) => { if (fail) throw new Error("telegram down"); out.push(t); };
  const now = new Date("2026-10-20T07:02:00Z");
  await assert.rejects(runReminders({ store, send, now, tz: KL }), /telegram down/);
  assert.equal(store.data.reminders[0].sent, false);
  fail = false;
  await runReminders({ store, send, now, tz: KL });
  assert.deepEqual(out, ["⏰ 提醒:call mum"]);
});

console.log(`\n${passed} checks passed`);
