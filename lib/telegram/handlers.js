import {
  INBOX_NAME, INBOX_COLOR, PROJECT_COLORS, findInboxProject, matchProject, prepTodoText, addMinutes,
} from "../inbox.js";
import { parseCommand, HELP_TEXT } from "./commands.js";
import { signFileId } from "../server/telegramFiles.js";
import { formatAnswer } from "../server/rag.js";
import { formatLocal } from "./remind.js";
import { createProject, ensureInbox, createEvent } from "./ops.js";
import { recordExchange } from "./agent.js";
import {
  MAIN_KEYBOARD, MENU_OVERVIEW, SCREENS, QUICK_QUESTIONS, ASK_KEYBOARD_EXPORT, WAITING_KEYBOARD_FOR, MODES_WITH_PHOTO, applyMode, menuId,
} from "./menu.js";

const REPEAT_LABEL = { daily: "每天", weekly: "每周", monthly: "每月", yearly: "每年" };

// `store` is the data layer (lib/server/firebaseAdmin createStore, or an in-memory fake in tests)
// and `llm` the parsing layer (lib/telegram/llm defaultLlm). Handlers return the reply text.

export async function handleTodo({ store, llm, body, now }) {
  if (!body) return "请在 todo 后面写上任务,一行一个。例如:\ntodo\n买牛奶\n交报告 周五前\n(categorize under 学校)";

  const projects = await store.list("projects");
  const { tasks } = await llm.parseTodos(body, { projectNames: projects.map((p) => p.name), now });
  if (!tasks.length) return "没有识别到任务,请一行写一个待办。";

  const groups = new Map(); // project id -> { project, created, lines }
  const base = Date.now();
  for (const [i, task] of tasks.entries()) {
    let project = task.project ? matchProject(projects, task.project) : null;
    let created = false;
    if (task.project && !project) {
      project = await createProject(store, projects, task.project);
      created = true;
    } else if (!task.project) {
      const hadInbox = !!findInboxProject(projects);
      project = await ensureInbox(store, projects);
      created = !hadInbox;
    }
    await store.add("todos", {
      projectId: project.id,
      sectionId: null,
      text: task.text,
      done: false,
      createdAt: base,
      order: base + i,
      doDate: task.doDate,
      dueDate: task.dueDate,
      source: "telegram",
    });
    if (!groups.has(project.id)) groups.set(project.id, { project, created, lines: [] });
    const dates = [task.doDate && `计划 ${task.doDate}`, task.dueDate && `截止 ${task.dueDate}`].filter(Boolean).join(" · ");
    groups.get(project.id).lines.push(`  • ${task.text}${dates ? `  (${dates})` : ""}`);
  }

  const parts = [...groups.values()].map((g) => `📁 ${g.project.name}${g.created ? "(新项目)" : ""}\n${g.lines.join("\n")}`);
  return `✅ 已添加 ${tasks.length} 个待办\n${parts.join("\n")}`;
}

// The dump box. Everything you send that is not a command lands here and stays in the app until you
// sort it into a folder there; only then does anything go to Notion (never from this bot).
const URL_RE = /https?:\/\/[^\s<>"']+/;
const FOLDER_CN = { todo: "待办", event: "日程", diary: "日记", idea: "想法", note: "笔记", link: "链接" };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export async function handleDump({ store, llm, text = "", suggested = null, photo = null, voice = null, loadFile, transcribe }) {
  let body = (text || "").trim();
  let kind = "text";
  let url = null;
  const extra = {};
  const notes = [];

  if (voice) {
    kind = "voice";
    extra.tgFileId = voice.fileId;
    extra.fileSig = signFileId(voice.fileId);
    extra.seconds = voice.duration || 0;
    try {
      const file = await loadFile(voice.fileId);
      const said = await transcribe(file);
      body = [body, said].filter(Boolean).join("\n");
    } catch (e) {
      notes.push(`⚠️ 语音没能转成文字(${e.message || "出错"}),但录音已经存好了。`);
    }
  } else if (photo) {
    kind = "photo";
    extra.tgFileId = photo.fileId;
    extra.fileSig = signFileId(photo.fileId);
  } else {
    url = body.match(URL_RE)?.[0] || null;
    if (url) {
      kind = "link";
      const rest = body.replace(url, "").trim();
      const title = rest || (llm?.fetchTitle ? await llm.fetchTitle(url).catch(() => null) : null) || hostOf(url);
      body = title;
    }
  }
  if (!body && !photo && !voice) return "没有可放进倒出箱的内容。";

  const folder = suggested || (llm?.suggestFolder ? await llm.suggestFolder(body, { url, hasPhoto: !!photo }) : null);
  await store.add("dumps", { kind, source: "telegram", text: body, url, ...extra, createdAt: Date.now(), status: "new", suggested: folder || null });

  const waiting = (await store.list("dumps")).filter((d) => d.status === "new").length;
  const label = { text: "文字", link: "链接", photo: "照片", voice: "语音" }[kind];
  const lines = [`📥 已放进倒出箱 · ${label}`];
  if (voice && body) lines.push(`🗣 ${body.replace(/\s+/g, " ").slice(0, 120)}`);
  if (folder) lines.push(`💡 建议放进「${FOLDER_CN[folder]}」`);
  lines.push(...notes, `现在有 ${waiting} 条待整理 — 睡前在 App 里放进文件夹(想法/笔记/链接/日记放进去才会存进 Notion)`);
  return lines.join("\n");
}

export async function handleEvent({ store, llm, body, now }) {
  if (!body) return "请在 event 后面写日程,包含日期和时间,例如:\nevent: 25 Oct 下午3点 牙医 @Klinik Sentosa\n要提前一天带保险卡";

  const ev = await llm.parseEvent(body, { now });
  if (ev.error) return `⚠️ ${ev.error}`;

  const { doc, endTime, prepDate, prepTodoId, inboxName } = await createEvent(store, ev);
  const prepLine = prepTodoId ? `\n🧰 准备:${ev.prepNote}\n   → ${prepDate} 已加入待办(${inboxName})` : "";

  const when = ev.startTime ? `${ev.date} ${ev.startTime}–${endTime}` : `${ev.date}(全天)`;
  const remind = ev.remindBeforeDays
    ? `\n🔔 会在${ev.remindBeforeDays === 1 ? "前一天" : `前 ${ev.remindBeforeDays} 天`}发消息提醒你${ev.prepNote ? `:${ev.prepNote}` : ""}`
    : "";
  const repeat = ev.repeat !== "none" ? `\n🔁 ${REPEAT_LABEL[ev.repeat]}${doc.repeatUntil ? `,直到 ${doc.repeatUntil}` : ""}` : "";
  return `📅 已添加日程:${ev.title}\n🗓 ${when}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.notes ? `\n📎 ${ev.notes}` : ""}${repeat}${remind}${prepLine}`;
}

// Questions are answered from saved notes (Notion) plus the calendar and to-dos (via `store`).
// Asking never saves anything.
export async function handleAsk({ store, memory, body, now }) {
  if (!body) return "请在 ask 后面写下你想查的问题,例如:ask: 鸡饭多少钱";
  return formatAnswer(await memory.ask(body, { store, now }));
}

// ---- reminders (the scheduler in /api/cron/reminders sends them when they come due) ------------
const pendingReminders = async (store) => (await store.list("reminders")).filter((r) => !r.sent).sort((a, b) => a.at - b.at);

export async function handleRemind({ store, llm, body, now }) {
  if (!body) return "请在 remind 后面写时间和事情,例如:\nremind: tomorrow 3pm call mum\nremind me in 30 minutes to take the laundry out\n提醒 明天下午3点 开会";
  const r = await llm.parseReminder(body, { now });
  if (r.error) return `⚠️ ${r.error}`;
  await store.add("reminders", { text: r.text, at: r.atMs, sent: false, createdAt: Date.now(), source: "telegram" });
  return `⏰ 好的,到时间我会提醒你\n📝 ${r.text}\n🕒 ${formatLocal(r.atMs)}`;
}

export async function handleReminders({ store }) {
  const list = await pendingReminders(store);
  if (!list.length) return "现在没有待发送的提醒。发 remind: … 来添加一个。";
  return `⏰ 待发送的提醒\n${list.map((r, i) => `${i + 1}. ${formatLocal(r.at)} — ${r.text}`).join("\n")}\n\n取消:cancel 编号(例如 cancel 1)`;
}

export async function handleCancel({ store, body }) {
  const list = await pendingReminders(store);
  const n = parseInt(body, 10);
  if (!n || n < 1 || n > list.length) return list.length ? "请写要取消的提醒编号,例如 cancel 2。(发 reminders 查看编号)" : "现在没有待发送的提醒。";
  await store.remove("reminders", list[n - 1].id);
  return `🗑 已取消提醒:${list[n - 1].text}`;
}

// NOTHING IS SAVED TO NOTION FROM HERE. Messages that are not commands are kept in the dump box;
// you sort them into folders in the app, and only the idea / note / link / diary folders go to Notion.
//   photo / voice / link / plain thought  -> dump box (voice is transcribed)
//   todo / event / remind                 -> website to-dos / calendar / reminders
//   ask / web / chat                      -> answers, nothing saved
// `photo` / `voice` = { fileId (, duration) }; `loadFile(fileId)` downloads it; `transcribe(file)` -> text.
const DUMP_KINDS = { dump: null, entry: "diary", idea: "idea", trivia: "note", thought: "idea", output: "idea" };

async function dispatchInner({ store, llm, memory, agent, text, photo = null, voice = null, loadFile, transcribe, now = new Date() }) {
  const message = (text || "").trim();
  const { kind, body } = parseCommand(message);

  if (kind === "help") return { text: HELP_TEXT, keyboard: MAIN_KEYBOARD };
  if (kind === "menu") return { text: MENU_OVERVIEW, keyboard: MAIN_KEYBOARD };

  if (photo || voice) {
    const asDump = kind in DUMP_KINDS;
    return handleDump({ store, llm, text: asDump ? body : message, suggested: asDump ? DUMP_KINDS[kind] : null, photo, voice, loadFile, transcribe });
  }

  if (kind in DUMP_KINDS) {
    if (!body) return "请在后面写下要放进倒出箱的内容。例如:\ndump: 想做一个读书笔记的小程序";
    return handleDump({ store, llm, text: body, suggested: DUMP_KINDS[kind] });
  }

  switch (kind) {
    case "todo": return handleTodo({ store, llm, body, now }); // to-dos live in the app, never in Notion
    case "event": return handleEvent({ store, llm, body, now });
    case "ask": return handleAsk({ store, memory, body, now });
    case "remind": return handleRemind({ store, llm, body, now });
    case "reminders": return handleReminders({ store });
    case "web": {
      if (!agent) return "上网搜索需要 AI 助手(GROQ_API_KEY)和搜索密钥(TAVILY_API_KEY)。请先在 Vercel 里配置。";
      if (!body) return "请在 web 后面写要搜索的内容,例如:web: 明天吉隆坡天气";
      try {
        return (await agent({ store, text: body, now, hint: "web" })).reply;
      } catch (e) {
        return `⚠️ 搜索失败:${e.message || "未知错误"}`;
      }
    }
    case "cancel": return handleCancel({ store, body });
    default: {
      // No command word. Decide: keep it (dump), or is it a question / a request to change something?
      // A message with a web address in it is a link to keep (no need to ask the AI).
      if (URL_RE.test(message)) return handleDump({ store, llm, text: message });
      const { intent } = llm?.routeMessage ? await llm.routeMessage(message) : { intent: "dump" };
      if (intent === "dump") return handleDump({ store, llm, text: message });

      // The AI assistant can look things up and change to-dos, events and reminders (see agent.js).
      if (agent) {
        try {
          const out = await agent({ store, text: message, now });
          if (out?.reply) return out.reply;
        } catch (e) {
          console.error("assistant failed, falling back", e);
        }
      }
      const labels = { event: "日程", reminder: "提醒", todo: "待办" };
      if (labels[intent]) {
        const reply = intent === "event" ? await handleEvent({ store, llm, body: message, now })
          : intent === "reminder" ? await handleRemind({ store, llm, body: message, now })
          : await handleTodo({ store, llm, body: message, now });
        return `🤖 我把它当作「${labels[intent]}」处理了\n${reply}`;
      }
      return handleAsk({ store, memory, body: message, now });
    }
  }
}

// ---- the button menu ----------------------------------------------------------------------------
const MODE_TTL = 30 * 60000;
const setMode = (store, cmd) => store?.setState?.("mode", { cmd, at: Date.now() });
const clearMode = (store) => store?.setState?.("mode", { cmd: null, at: 0 });

// A menu button was tapped: explain that function, and (for the ones that take input) remember that
// the next message is meant for it.
async function handleMenuButton({ id, store, memory, now }) {
  switch (id) {
    case "menu":
      await clearMode(store);
      return { text: MENU_OVERVIEW, keyboard: MAIN_KEYBOARD };
    case "help":
      return { text: HELP_TEXT, keyboard: MAIN_KEYBOARD };
    case "back":
      await clearMode(store);
      return { text: "好的,回到主菜单 👇", keyboard: MAIN_KEYBOARD };
    case "cancel":
      await clearMode(store);
      return { text: "已取消。想做什么,点下面的按钮 👇", keyboard: MAIN_KEYBOARD };
    case "myReminders":
      await clearMode(store);
      return { text: await handleReminders({ store }), keyboard: MAIN_KEYBOARD };
    case "qToday":
    case "qTomorrow":
    case "qWeek":
    case "qTodos":
      await clearMode(store);
      return { text: await handleAsk({ store, memory, body: QUICK_QUESTIONS[id], now }), keyboard: ASK_KEYBOARD_EXPORT };
    default: {
      const screen = SCREENS[id];
      if (!screen) return null;
      if (screen.mode) await setMode(store, screen.mode);
      else await clearMode(store);
      return { text: screen.text, keyboard: screen.keyboard || (screen.mode ? WAITING_KEYBOARD_FOR : MAIN_KEYBOARD) };
    }
  }
}

async function dispatch(args) {
  const { store, text, photo, voice } = args;

  // 1. a menu button
  const id = menuId(text);
  if (id) {
    const reply = await handleMenuButton({ ...args, id });
    if (reply) return reply;
  }

  // 2. a function was picked from the menu earlier: this message is its input (one-shot)
  const mode = store?.getState ? await store.getState("mode") : null;
  if (mode?.cmd) {
    await clearMode(store);
    const cleaned = (text || "").trim();
    const explicit = parseCommand(cleaned).kind !== null;
    const fresh = Date.now() - (mode.at || 0) < MODE_TTL;
    if (fresh && !explicit && (cleaned || photo || voice) && ((!photo && !voice) || MODES_WITH_PHOTO.includes(mode.cmd))) {
      return dispatchInner({ ...args, text: applyMode(mode.cmd, cleaned) });
    }
  }
  return dispatchInner(args);
}

// Entry point for every message. `agent` (optional) is the conversational AI assistant; without it
// (or if it fails) free text falls back to the older question/instruction routing.
// Returns { text, keyboard }: the reply plus the buttons to show under the typing box.
export async function handleMessageRich(args) {
  const out = await dispatch(args);
  const rich = typeof out === "string" ? { text: out, keyboard: MAIN_KEYBOARD } : out;
  try {
    // Remembered so follow-ups like "move it into blabla" make sense.
    await recordExchange(args.store, args.text || (args.voice ? "(语音)" : "(照片)"), rich.text, args.now || new Date());
  } catch {
    // memory is best-effort
  }
  return rich;
}

// Same, but just the reply text.
export async function handleMessage(args) {
  return (await handleMessageRich(args)).text;
}
