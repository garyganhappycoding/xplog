import { groqJson, hasGroq, describeAiError } from "./groq.js";
import { searchByKeywords } from "./memory.js";
import { dateContext } from "./time.js";
import { addDays, fromKey, startOfWeek, toKey } from "../date.js";
import { eventsInRange } from "./schedule.js";
export { eventsInRange };

// Question answering over three sources of the user's own data:
//   - saved notes (Notion)      - calendar events (Firestore, recurring ones expanded)
//   - to-dos (Firestore)
// Steps: plan (which sources? which dates? which keywords?) -> retrieve -> answer ONLY from what was
// retrieved (or hand the raw results over when no AI is available).

const STOP_EN = new Set(["the", "a", "an", "of", "is", "are", "was", "what", "whats", "how", "much", "many", "price", "cost", "did", "do", "i", "my", "me", "for", "at", "in", "on", "to", "it", "that", "this", "where", "when", "which", "who", "tell", "about", "have", "has", "any", "there", "show", "list", "get", "got", "need", "week", "today", "tomorrow", "schedule", "calendar", "event", "events", "todo", "todos", "task", "tasks"]);
const STOP_ZH = ["多少钱", "价格", "价钱", "是多少", "是什么", "什么", "哪里", "在哪", "几钱", "多少", "我", "的", "是", "吗", "呢", "了", "有没有", "帮我", "查一下", "查查", "请问", "今天", "明天", "后天", "本周", "这周", "下周", "日程", "行程", "安排", "待办", "任务"];

// Used when Groq is unavailable: distinctive words only.
export function fallbackKeywords(question) {
  let q = question.toLowerCase();
  for (const w of STOP_ZH) q = q.split(w).join(" ");
  const words = [];
  for (const tok of q.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    if (/^[\p{Script=Han}]+$/u.test(tok)) {
      if (tok.length <= 4) words.push(tok);
      else for (let i = 0; i < tok.length - 1; i++) words.push(tok.slice(i, i + 2));
    } else if (tok.length >= 2 && !STOP_EN.has(tok)) {
      words.push(tok);
    }
  }
  return [...new Set(words)].slice(0, 8);
}

// ---- 1. Plan ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_RE = /schedule|calendar|event|meeting|appointment|agenda|what(?:'s| is| are)? on|free time|busy|日程|行程|安排|会议|预约|活动|有空|忙/i;
const TODO_RE = /to-?do|task|deadline|\bdue\b|assignment|homework|待办|任务|截止|作业|要做|该做|还没做/i;

// today / tomorrow / this week / next week / an ISO date -> [from, to] as YYYY-MM-DD, or null
export function parseRange(question, todayKey) {
  const q = question.toLowerCase();
  const today = fromKey(todayKey);
  const iso = q.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return [iso[0], iso[0]];
  const day = (n) => [toKey(addDays(today, n)), toKey(addDays(today, n))];
  if (/day after tomorrow|后天/.test(q)) return day(2);
  if (/tomorrow|明天/.test(q)) return day(1);
  if (/yesterday|昨天/.test(q)) return day(-1);
  if (/next week|下周|下个星期/.test(q)) {
    const mon = addDays(startOfWeek(today), 7);
    return [toKey(mon), toKey(addDays(mon, 6))];
  }
  if (/this week|本周|这周|这个星期/.test(q)) {
    const mon = startOfWeek(today);
    return [toKey(mon), toKey(addDays(mon, 6))];
  }
  if (/\btoday\b|\btonight\b|今天|今晚/.test(q)) return day(0);
  return null;
}

// Deterministic planner for when Groq is unavailable.
export function fallbackPlan(question, now = new Date()) {
  const { date } = dateContext(now);
  const useCalendar = EVENT_RE.test(question);
  const useTodos = TODO_RE.test(question);
  const range = parseRange(question, date);
  return {
    keywords: fallbackKeywords(question),
    useNotes: !(useCalendar || useTodos),
    useCalendar,
    useTodos,
    from: range?.[0] || null,
    to: range?.[1] || null,
  };
}

export async function planQuery(question, now = new Date()) {
  if (hasGroq()) {
    try {
      const { date, weekday, tz } = dateContext(now);
      const system = `You prepare a search over a user's personal data. There are three sources:
 1. saved notes (prices, facts, ideas, things they wrote down; mixed English / Chinese / Malay)
 2. calendar events
 3. to-do tasks
Today is ${weekday} ${date} (${tz}).
Return ONLY strict JSON: {"keywords": string[], "useNotes": boolean, "useCalendar": boolean, "useTodos": boolean, "dateFrom": string|null, "dateTo": string|null}
- keywords: up to 8 distinctive item/place/topic words from the question, plus likely synonyms and translations (e.g. "chicken rice" -> "鸡饭", "nasi ayam"). Do NOT include generic question words (price, how much, schedule, today, todo).
- useCalendar: true for questions about schedule, events, meetings, appointments, what's on, being free/busy.
- useTodos: true for questions about tasks, to-dos, deadlines, assignments, what needs doing.
- useNotes: true for anything about things the user saved or knows (prices, facts, ideas, thoughts). If unsure, true.
- dateFrom / dateTo (YYYY-MM-DD): the period the question refers to ("tomorrow", "this week", "25 Oct"), resolved against today; null when the question names no period.`;
      const out = await groqJson(system, question);
      const kws = (Array.isArray(out.keywords) ? out.keywords : []).filter((k) => typeof k === "string" && k.trim()).slice(0, 8);
      const plan = {
        keywords: kws,
        useNotes: out.useNotes !== false,
        useCalendar: out.useCalendar === true,
        useTodos: out.useTodos === true,
        from: DATE_RE.test(out.dateFrom || "") ? out.dateFrom : null,
        to: DATE_RE.test(out.dateTo || "") ? out.dateTo : null,
      };
      if (plan.from && !plan.to) plan.to = plan.from;
      if (!plan.keywords.length) plan.keywords = fallbackKeywords(question);
      if (plan.useNotes || plan.useCalendar || plan.useTodos) return plan;
    } catch {
      // fall through
    }
  }
  return fallbackPlan(question, now);
}

// ---- 2. Retrieve -----------------------------------------------------------------------

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: process.env.XPLOG_TIMEZONE || "Asia/Kuala_Lumpur" }) : "");

// Saved notes (Notion): rows whose title or notes mention any keyword, best matches first.
export async function retrieveNotes(keywords, limit = 8) {
  const rows = await searchByKeywords(keywords, 30);
  const lower = keywords.map((k) => k.toLowerCase());
  const scored = rows.map((r) => {
    const hay = `${r.title}\n${r.content}`.toLowerCase();
    return { r: { ...r, kind: "note" }, score: lower.filter((k) => hay.includes(k)).length };
  });
  // Most keyword hits first; rows arrive newest-first, and the sort is stable.
  scored.sort((a, b) => b.score - a.score);
  // With Groq, the answering step judges relevance, so any hit may go to it. Without it the
  // raw list is shown to the user, so require at least half of the keywords to match.
  const minScore = hasGroq() ? 1 : Math.max(1, Math.ceil(keywords.length / 2));
  return scored.filter((s) => s.score >= minScore).slice(0, limit).map((s) => s.r);
}

// Kept for callers that only want notes.
export async function retrieve(question, limit = 8) {
  const plan = await planQuery(question);
  return { keywords: plan.keywords, items: await retrieveNotes(plan.keywords, limit) };
}

// To-dos relevant to the question: a named project wins, then a date period, else everything still open.
export function todosFor(todos, projects, question, plan) {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const q = question.toLowerCase();
  const named = projects.find((p) => p.name && q.includes(p.name.toLowerCase()));
  const wantsDone = /done|completed|finished|已完成|做完/.test(q);
  let list = todos.filter((t) => wantsDone || !t.done);
  if (named) list = list.filter((t) => t.projectId === named.id);
  else if (plan.from) list = list.filter((t) => [t.doDate, t.dueDate].some((d) => d && d >= plan.from && d <= plan.to));
  return list
    .map((t) => ({
      id: t.id,
      kind: "todo",
      title: t.text,
      displayDate: t.dueDate || t.doDate || "",
      sortKey: t.dueDate || t.doDate || "9999",
      project: byId[t.projectId]?.name || "",
      content: [
        `项目:${byId[t.projectId]?.name || "—"}`,
        t.doDate && `计划:${t.doDate}`,
        t.dueDate && `截止:${t.dueDate}`,
        t.done ? "已完成" : "未完成",
      ].filter(Boolean).join(" | "),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .slice(0, 40);
}

// The user's calendar and to-dos (Firestore) according to the plan.
async function appData(store, plan, question, now) {
  const result = { events: [], todos: [], range: null };
  if (plan.useCalendar) {
    const today = dateContext(now).date;
    const from = plan.from || today;
    const to = plan.to || (plan.from ? plan.from : toKey(addDays(fromKey(today), 14)));
    result.range = [from, to];
    result.events = eventsInRange(await store.list("events"), from, to);
  }
  if (plan.useTodos) {
    const [todos, projects] = await Promise.all([store.list("todos"), store.list("projects")]);
    result.todos = todosFor(todos, projects, question, plan);
  }
  return result;
}

// ---- 3. Answer -------------------------------------------------------------------------

// Rules:
// 1. Answer ONLY from the retrieved data - never from general knowledge or guesses.
// 2. If it doesn't actually contain the answer, say "I don't have the answer".
// 3. Even then, show the closest notes as references so the user can look through them.
// 4. Every reply has the same four parts: summary, details, sources, follow-up decisions.
const hasChinese = (s) => /[一-鿿]/.test(s);
export const noAnswerMessage = (question) =>
  hasChinese(question) ? "我没有这个问题的答案。" : "I don't have the answer to that.";

const ANSWER_RULES = `You answer questions from the user's own data: saved notes, calendar events and to-dos.
Rules - follow them strictly:
1. Use ONLY the data provided. Never use outside knowledge, and never guess or infer facts about the user's life that the data does not state.
2. Set "answerable" to true ONLY if the data explicitly contains the information that answers the question. Data that is merely on a related topic does NOT count.
   Exception: when a section says the calendar or the to-do list was checked and shows "(none)", that IS the answer (e.g. nothing is scheduled in that period).
3. If answerable is false, set "summary" to exactly one short sentence in the question's language saying you don't have the answer (e.g. "I don't have the answer to that." / "我没有这个问题的答案。") and leave "details" and "followUp" empty.
4. If answerable is true, reply in the language of the question with these fields:
   - "summary": the direct answer in one or two sentences.
   - "details": the supporting facts as short lines separated by newlines (exact times, places, figures, names, and for notes when each was saved). If several notes disagree (e.g. a price changed over time), list them newest first.
   - "followUp": 1 to 3 practical next steps or decisions the user could consider, based on this data (for example preparing for an event, rescheduling a clash, finishing an overdue task, comparing options). Word them as options or questions. Do NOT state any new facts that are not in the data.
Respond with ONLY strict JSON: {"answerable": boolean, "summary": string, "details": string, "followUp": string[], "used": number[]} where "used" lists the item numbers you relied on (empty when not answerable).`;

const asLines = (v) =>
  (Array.isArray(v) ? v : String(v || "").split("\n")).map((x) => String(x).replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);

// What to suggest when there is no answer: fill the gap, or ask differently.
const noAnswerNextSteps = (question) =>
  hasChinese(question)
    ? ["如果你知道答案,发 note: … 存进记忆库,下次就能直接查到", "换个说法,或加上店名/日期等关键词再问一次"]
    : ["If you know the answer, send it as note: … so it can be found next time", "Rephrase the question, or add keywords such as a place or date, and ask again"];

const toSource = (r) => ({
  id: r.id,
  kind: r.kind || "note",
  title: r.title,
  date: r.displayDate ?? fmtDate(r.createdTime),
  level: r.level,
  url: r.url,
  snippet: String(r.content || "").replace(/\s+/g, " ").slice(0, 100),
});

const defaultDeps = { json: groqJson, available: hasGroq };

// Returns { answered, summary, details, followUp[], sources[], answer } - `answer` mirrors
// `summary` for older callers.
//   deps.store   Firestore store (enables calendar + to-do lookups)
//   deps.retrieve (tests) replaces the planner + Notion search with a notes-only retriever
export async function ask(question, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const now = d.now || new Date();

  let plan;
  let notes = [];
  if (d.retrieve) {
    const r = await d.retrieve(question);
    plan = { keywords: r.keywords, useNotes: true, useCalendar: false, useTodos: false, from: null, to: null };
    notes = r.items;
  } else {
    plan = await (d.plan || planQuery)(question, now);
    if (plan.useNotes) {
      try {
        notes = await retrieveNotes(plan.keywords);
      } catch {
        notes = []; // Notion unreachable: calendar and to-do answers should still work
      }
    }
  }

  // Calendar + to-dos come from the user's own app data.
  const app = d.store && (plan.useCalendar || plan.useTodos)
    ? await (d.appData || appData)(d.store, plan, question, now)
    : { events: [], todos: [], range: null };
  const checkedApp = !!d.store && (plan.useCalendar || plan.useTodos);

  const items = [...app.events, ...app.todos, ...notes];

  const unanswered = (details, sources) => ({
    answered: false,
    summary: noAnswerMessage(question),
    answer: noAnswerMessage(question),
    details,
    followUp: noAnswerNextSteps(question),
    sources,
  });

  // Nothing was found, and no list was checked that could legitimately be empty.
  if (!items.length && !checkedApp) {
    return unanswered(`记忆库里没有找到相关内容。(搜索了:${plan.keywords.join("、") || "—"})`, []);
  }

  let aiError = null;
  if (d.available()) {
    try {
      const { date, weekday } = dateContext(now);
      const numbered = items.map((r, i) => `[${i + 1}] ${r.kind === "event" ? "EVENT" : r.kind === "todo" ? "TODO" : "NOTE"}${r.kind === "note" || !r.kind ? ` (saved ${fmtDate(r.createdTime)}${r.level ? ` · ${r.level}` : ""})` : ""}\n${r.title}\n${String(r.content || "").slice(0, 900)}`);
      const section = (label, rows, checked) => (checked ? `${label}:\n${rows.length ? rows.join("\n\n") : "(none)"}` : "");
      const idx = (list) => list.map((r) => numbered[items.indexOf(r)]);
      const body = [
        `Today is ${weekday} ${date}.`,
        `Question: ${question}`,
        section(`CALENDAR EVENTS checked for ${app.range?.[0]} to ${app.range?.[1]}`, idx(app.events), plan.useCalendar && checkedApp),
        section("TO-DO LIST checked", idx(app.todos), plan.useTodos && checkedApp),
        notes.length || plan.useNotes ? `SAVED NOTES:\n${notes.length ? idx(notes).join("\n\n") : "(none)"}` : "",
      ].filter(Boolean).join("\n\n");
      const out = await d.json(ANSWER_RULES, body);
      const summary = String(out.summary ?? out.answer ?? "").trim();
      if (out.answerable === true && summary) {
        const used = (Array.isArray(out.used) ? out.used : []).map((n) => items[Number(n) - 1]).filter(Boolean);
        const followUp = asLines(out.followUp).slice(0, 3);
        return {
          answered: true,
          summary,
          answer: summary,
          details: String(out.details || "").trim() || "(没有更多细节)",
          followUp: followUp.length ? followUp : ["如果信息有变化,发 note: … 更新记录"],
          sources: (used.length ? used : items.slice(0, 3)).map(toSource),
        };
      }
      // Related items exist but none of them answers it.
      return unanswered("记忆库里有一些相关内容,但都没有直接回答这个问题,见下面的参考。", items.slice(0, 5).map(toSource));
    } catch (e) {
      aiError = describeAiError(e); // fall through: the AI step failed
    }
  }

  // No AI available (or it failed). Calendar and to-do lookups need no judgement - the list IS
  // the answer. For notes we can't tell whether they answer the question, so don't pretend.
  if (checkedApp && !notes.length) {
    const parts = [];
    if (plan.useCalendar) parts.push(app.events.length ? `${app.range[0]}${app.range[1] !== app.range[0] ? ` 至 ${app.range[1]}` : ""} 有 ${app.events.length} 个日程` : `${app.range[0]}${app.range[1] !== app.range[0] ? ` 至 ${app.range[1]}` : ""} 没有日程`);
    if (plan.useTodos) parts.push(app.todos.length ? `有 ${app.todos.length} 个相关待办` : "没有相关待办");
    const lines = [...app.events, ...app.todos].slice(0, 25).map((r) => `• ${r.kind === "event" ? "📅" : "☑️"} ${r.title} — ${r.content}`);
    return {
      answered: true,
      summary: `${parts.join(";")}。`,
      answer: parts.join(";"),
      details: lines.join("\n") || "—",
      followUp: ["(AI 暂时不可用,所以这里只是直接列出你的日程/待办)"],
      sources: [...app.events, ...app.todos].slice(0, 5).map(toSource),
    };
  }

  return {
    ...unanswered(
      `AI 暂时不可用,没法判断这些记录能不能回答你的问题,请自己看看下面的内容。${aiError ? `\n(原因:${aiError})` : d.available() ? "" : "\n(原因:没有配置 GROQ_API_KEY)"}`,
      items.slice(0, 5).map(toSource)
    ),
    summary: "我没法判断答案。",
    answer: "我没法判断答案。",
  };
}

// The same four-part layout everywhere (Telegram text; the website renders the same parts).
const ICON = { event: "📅", todo: "☑️", note: "🗒" };
export function formatAnswer(res) {
  const refs = res.answered === false;
  const sources = (res.sources || []).slice(0, refs ? 5 : 3).map((x, i) => {
    const snippet = refs && x.snippet && x.snippet !== x.title ? ` — ${x.snippet}` : "";
    return `${i + 1}. ${ICON[x.kind] || ICON.note} ${x.title}${x.date ? ` (${x.date})` : ""}${snippet}`;
  });
  return [
    `1️⃣ 总结 Summary\n${res.summary}`,
    `2️⃣ 详细 Details\n${res.details || "—"}`,
    `3️⃣ 来源 Sources${refs && sources.length ? "(相关记录,仅供参考)" : ""}\n${sources.length ? sources.join("\n") : "—"}`,
    `4️⃣ 后续决策 Next steps\n${(res.followUp || []).map((f) => `• ${f}`).join("\n") || "—"}`,
  ].join("\n\n");
}
