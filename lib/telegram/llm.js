import { groqJson, hasGroq } from "../server/groq.js";
import { parseReminder } from "./remind.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"];

import { dateContext } from "../server/time.js";
export { dateContext };

const cleanDate = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
const cleanTime = (v) => (typeof v === "string" && TIME_RE.test(v) ? v : null);
const cleanStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// ---- To-dos ---------------------------------------------------------------------------

// Used when Groq is unavailable: one task per line, optional "(categorize under X)" / "#X".
const CAT_RE = /[(（]\s*(?:cat\w*|under|in|归类到|归类|分类到|分类|放到|项目)(?:\s*(?:under|to|as|:|：))?\s*([^()（）]+?)\s*[)）]\s*$/i;

export function parseTodosFallback(body) {
  const lines = body.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  let shared = null;
  const tasks = [];
  lines.forEach((line, i) => {
    let project = null;
    let text = line;
    const m = text.match(CAT_RE);
    if (m) {
      project = m[1].trim();
      text = text.replace(CAT_RE, "").trim();
      // A category on the last line (or alone on a line) applies to every task.
      if (!text || i === lines.length - 1) shared = project;
    }
    const tag = text.match(/(^|\s)#([\p{L}\p{N}_-]+)/u);
    if (tag) {
      project = project || tag[2];
      text = text.replace(tag[0], " ").trim();
    }
    if (text) tasks.push({ text, project, doDate: null, dueDate: null });
  });
  return { tasks: tasks.map((t) => ({ ...t, project: t.project || shared })) };
}

export async function parseTodos(body, { projectNames = [], now = new Date() } = {}) {
  if (hasGroq()) {
    try {
      const { date, weekday, tz } = dateContext(now);
      const system = `You turn a short chat message into to-do items for a personal task app.
Today is ${weekday} ${date} (${tz}).
Existing projects (categories): ${projectNames.length ? projectNames.join(", ") : "(none yet)"}

Rules:
- Each line, bullet or clearly separate task becomes one item. Keep the user's own wording and language; only trim bullets/numbering and any category or date phrase you used.
- A category phrase such as "(categorize under X)", "category: X", "under X", "归类到X", "#X", or a header line names the project. If it stands on its own line or ends the last line, it applies to every task that has no category of its own; if it ends an earlier line it applies to that line only.
- If the category plausibly means an existing project (any case or spelling), return that project's exact existing name. Otherwise return the name as the user wrote it. Use null when no category is given.
- "doDate" = the day the user plans to do it; "dueDate" = a deadline ("by Friday", "due 30 Oct", "before 12pm"). Resolve relative dates against today. Format YYYY-MM-DD, or null when not mentioned.
- Never invent tasks.
Respond with ONLY strict JSON: {"tasks":[{"text":string,"project":string|null,"doDate":string|null,"dueDate":string|null}]}`;
      const out = await groqJson(system, body);
      const tasks = (Array.isArray(out.tasks) ? out.tasks : [])
        .map((t) => ({ text: cleanStr(t?.text), project: cleanStr(t?.project), doDate: cleanDate(t?.doDate), dueDate: cleanDate(t?.dueDate) }))
        .filter((t) => t.text);
      if (tasks.length) return { tasks };
    } catch {
      // fall through to the plain parser
    }
  }
  return parseTodosFallback(body);
}

// ---- Events ---------------------------------------------------------------------------

export async function parseEvent(body, { now = new Date() } = {}) {
  if (!hasGroq()) return { error: "解析日程需要配置 GROQ_API_KEY(Groq)。" };
  const { date, weekday, tz } = dateContext(now);
  const system = `You turn a chat message into ONE calendar event for a personal planner.
Today is ${weekday} ${date} (${tz}).

Fields (all optional except title/date):
- title: short event name, in the user's language.
- date: YYYY-MM-DD. Resolve relative dates ("tomorrow", "next Friday") against today; if the year is missing use the next upcoming occurrence.
- startTime / endTime: 24h "HH:MM", or null when no time is given. If only a start time is given, endTime is null.
- location: where it happens, or null.
- notes: any other useful detail (who, link, dress code...), or null.
- prepNote: what has to be prepared / brought / done beforehand, or null.
- prepDate: YYYY-MM-DD for when to do that preparation ("the day before", "tonight", "on Monday"), or null if no timing was given.
- repeat: "none" | "daily" | "weekly" | "monthly" | "yearly"; repeatUntil: YYYY-MM-DD or null. Birthdays and anniversaries repeat "yearly".
- remindBeforeDays: a whole number of days before the event to send the user a reminder message ("the day before" = 1, "a week before" = 7). For a birthday or anniversary with no stated timing use 1. Otherwise 0.
If the date cannot be worked out at all, set "error" to a short Chinese explanation of what is missing.
Respond with ONLY strict JSON: {"title":string,"date":string,"startTime":string|null,"endTime":string|null,"location":string|null,"notes":string|null,"prepNote":string|null,"prepDate":string|null,"repeat":string,"repeatUntil":string|null,"remindBeforeDays":number,"error":string|null}`;

  let out;
  try {
    out = await groqJson(system, body);
  } catch {
    return { error: "AI 暂时无法解析,请稍后再试。" };
  }
  const title = cleanStr(out.title);
  const eventDate = cleanDate(out.date);
  if (out.error || !title || !eventDate) {
    return { error: cleanStr(out.error) || "没看懂这个日程的日期,请写上是哪一天(例如 25 Oct 或 下周五)。" };
  }
  const startTime = cleanTime(out.startTime);
  const endTime = startTime ? cleanTime(out.endTime) : null;
  return {
    title,
    date: eventDate,
    startTime,
    endTime,
    location: cleanStr(out.location),
    notes: cleanStr(out.notes),
    prepNote: cleanStr(out.prepNote),
    prepDate: cleanDate(out.prepDate),
    repeat: REPEATS.includes(out.repeat) ? out.repeat : "none",
    repeatUntil: cleanDate(out.repeatUntil),
    remindBeforeDays: Number.isInteger(out.remindBeforeDays) && out.remindBeforeDays >= 1 && out.remindBeforeDays <= 60 ? out.remindBeforeDays : 0,
  };
}

// ---- Free sentences -------------------------------------------------------------------
// A message with no command word is one of:
//   "dump"     something to keep: a thought, idea, fact, link, diary-like remark (goes to the dump box)
//   "question" they are asking for information
//   "edit"     they ask to look at or change their existing to-dos / events / reminders ("move that
//              to-do", "mark it done", "undo", "what is on tomorrow?")
//   "event" / "reminder" / "todo"   they ask to create one of those
// Without the AI, plain text is simply kept (dump) so nothing is lost.
export async function routeMessage(text) {
  if (!hasGroq()) return { intent: "dump" };
  try {
    const out = await groqJson(
      `Decide what the user wants from a chat message sent to their personal assistant bot.
Return ONLY strict JSON: {"intent": "dump" | "question" | "edit" | "event" | "reminder" | "todo"}
- "event": they ask to record/add/schedule something that happens on a date (a birthday, anniversary, appointment, meeting, trip, exam...).
- "reminder": they ask to be reminded about something at a time, with no calendar event involved.
- "todo": they ask to add tasks to do.
- "edit": they ask to change, finish, move, delete or undo something that already exists in their to-dos, calendar or reminders ("move that to-do", "mark it done", "change the dentist to 4:30pm", "undo").
- "question": they are asking for information (about their schedule, notes, or the world).
- "dump": anything else - a thought, an idea, a fact they want to remember, a price, a link, a remark about their day. When in doubt between "dump" and "question", look for a question mark or a question word: no question means "dump".`,
      text
    );
    return { intent: ["dump", "question", "edit", "event", "reminder", "todo"].includes(out.intent) ? out.intent : "dump" };
  } catch {
    return { intent: "dump" };
  }
}

// ---- Which dump folder fits? ---------------------------------------------------------------
// todo | event | diary | idea | note | link, or null when unsure. A suggestion only: the user sorts
// the dump themselves in the app.
export const FOLDER_IDS = ["todo", "event", "diary", "idea", "note", "link"];
export async function suggestFolder(text, { url = null, hasPhoto = false } = {}) {
  if (url && !(text || "").replace(url, "").trim()) return "link";
  if (!hasGroq() || !(text || "").trim()) return url ? "link" : hasPhoto ? "note" : null;
  try {
    const out = await groqJson(
      `Pick the folder that best fits a short note someone dumped into their personal inbox.
Return ONLY strict JSON: {"folder": "todo" | "event" | "diary" | "idea" | "note" | "link" | null}
- todo: something they have to do.  - event: something that happens at a date/time (appointment, meeting, birthday).
- diary: a remark about their own day or feelings.  - idea: a thought, plan, or something they want to build or explore.
- note: a fact, price, recipe, something to remember.  - link: mainly a web link to read later.
Use null when none fits.`,
      text
    );
    return FOLDER_IDS.includes(out.folder) ? out.folder : null;
  } catch {
    return url ? "link" : null;
  }
}

// The bundle the handlers use; tests substitute their own.
export const defaultLlm = {
  parseTodos,
  parseReminder,
  routeMessage,
  parseEvent,
  suggestFolder,
};
