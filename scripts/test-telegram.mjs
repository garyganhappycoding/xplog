// Self-test for the Telegram bot logic (no Firebase, Telegram or Groq needed):
//   npm run test:telegram
import assert from "node:assert/strict";
import { parseCommand, extractTags } from "../lib/telegram/commands.js";
import { parseTodosFallback, dateContext } from "../lib/telegram/llm.js";
import { handleMessage } from "../lib/telegram/handlers.js";
import { fallbackKeywords, ask, formatAnswer } from "../lib/server/rag.js";

// In-memory stand-in for the Firestore store.
function memoryStore(seed = {}) {
  const data = { projects: [], todos: [], skills: [], diaryEntries: [], events: [], ...seed };
  let n = 0;
  return {
    data,
    list: async (c) => data[c].map((d) => ({ ...d })),
    add: async (c, doc) => { const id = `${c}-${++n}`; data[c].push({ id, ...doc }); return id; },
    update: async (c, id, patch) => { Object.assign(data[c].find((d) => d.id === id), patch); },
    addXp: async (id, d) => { const s = data.skills.find((x) => x.id === id); s.totalXp = (s.totalXp || 0) + d; },
  };
}

const llm = {
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
  ask: async (q) => { asked.push(q); return { answered: true, summary: "鸡饭 RM8.50(10/18 记录)", details: "10/18 在 Kedai Ali 记录:RM8.50", followUp: ["下次再确认一下价格有没有变"], sources: [{ title: "鸡饭 RM8.50", date: "2026-10-18" }] }; },
};
const run = (args) => handleMessage({ memory, ...args });

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

await test("idea is a diary entry flagged isIdea and synced to Notion", async () => {
  const store = memoryStore();
  const reply = await run({ store, llm, text: "idea: a reading-notes app" });
  assert.equal(store.data.diaryEntries[0].isIdea, true);
  assert.equal(store.data.diaryEntries[0].notionPageId, "notion-page-1");
  assert.match(reply, /Notion/);
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

await test("a photo (with or without caption) is saved as a memory", async () => {
  saved.length = 0;
  const store = memoryStore();
  const photo = { buffer: Buffer.from("x"), mime: "image/jpeg", filename: "p.jpg" };
  const r1 = await run({ store, llm, text: "", photo });
  assert.equal(saved[0].level, "trivia");
  assert.match(r1, /照片已保存/);
  assert.match(r1, /RM 8.50/);
  await run({ store, llm, text: "think: 这家店的装修很特别", photo });
  assert.equal(saved[1].level, "thought");
  assert.equal(saved[1].text, "这家店的装修很特别");
  await run({ store, llm, text: "plain caption without keyword", photo });
  assert.equal(saved[2].level, "trivia");
  assert.equal(saved[2].text, "plain caption without keyword");
  assert.match(await run({ store, llm, text: "todo: x", photo }), /照片目前只能/);
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
  assert.match(rules, /ONLY the notes provided/);
  assert.match(rules, /merely on a related topic do NOT count/);
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

console.log(`\n${passed} checks passed`);
