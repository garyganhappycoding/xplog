import {
  INBOX_NAME, INBOX_COLOR, PROJECT_COLORS, findInboxProject, matchProject, prepTodoText, addMinutes,
} from "../inbox.js";
import { parseCommand, extractTags, detectNotionSave, HELP_TEXT } from "./commands.js";
import { formatAnswer } from "../server/rag.js";
import { formatLocal } from "./remind.js";

const REPEAT_LABEL = { daily: "每天", weekly: "每周", monthly: "每月" };

// `store` is the data layer (lib/server/firebaseAdmin createStore, or an in-memory fake in tests)
// and `llm` the parsing layer (lib/telegram/llm defaultLlm). Handlers return the reply text.

async function createProject(store, projects, name, color) {
  const project = {
    name,
    color: color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    createdAt: Date.now(),
    order: projects.length,
  };
  project.id = await store.add("projects", project);
  projects.push(project);
  return project;
}

async function ensureInbox(store, projects) {
  return findInboxProject(projects) || createProject(store, projects, INBOX_NAME, INBOX_COLOR);
}

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

// Diary entries and ideas are saved in the app (with XP) AND in Notion: entries as 琐碎事情,
// ideas as 思考过的事情. (Set `syncNotion: false` to keep one out of Notion.)
export async function handleEntry({ store, llm, body, isIdea = false, syncNotion = true }) {
  const { text, tags } = extractTags(body);
  if (!text) return isIdea ? "请在 idea 后面写下你的想法。" : "请在 entry 后面写下日记内容。";

  const skills = await store.list("skills");
  const tag = await llm.tagEntry(text, skills.map((s) => s.name));
  const skillName = (tag.skill || "Uncategorized").trim();
  const xp = tag.xpDelta || 1;

  let skill = skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
  let skillId = skill?.id;
  if (!skillId) {
    skillId = await store.add("skills", { name: skillName, nameEn: skillName, icon: "✦", totalXp: 0, hasValue: false, milestones: [] });
  }
  const finalName = skill?.name || skillName;

  const entryId = await store.add("diaryEntries", {
    text,
    photoUrl: null,
    tags,
    isIdea,
    createdAt: Date.now(),
    skill: finalName,
    skillId,
    xpDelta: xp,
    aiTagged: true,
    confidence: tag.confidence || 0,
    notionPageId: null,
    source: "telegram",
  });
  await store.addXp(skillId, xp);

  let notionLine = "";
  if (syncNotion) {
    const level = isIdea ? "思考过的事情" : "琐碎事情";
    const res = await llm.syncIdea({ text, photoUrl: null, entryId, skill: finalName, level });
    if (res.pageId) {
      await store.update("diaryEntries", entryId, { notionPageId: res.pageId });
      notionLine = `\n✅ 已存到 Notion · ${level}`;
    } else {
      notionLine = `\n⚠️ 已记下,但 Notion 保存失败:${res.error}`;
    }
  }

  const tagLine = tags.length ? `\n🏷 ${tags.map((t) => `#${t}`).join(" ")}` : "";
  return `${isIdea ? "💡 已记录想法" : "📝 已记录日记"}\n技能:${finalName} +${xp} XP${tagLine}${notionLine}`;
}

export async function handleEvent({ store, llm, body, now }) {
  if (!body) return "请在 event 后面写日程,包含日期和时间,例如:\nevent: 25 Oct 下午3点 牙医 @Klinik Sentosa\n要提前一天带保险卡";

  const ev = await llm.parseEvent(body, { now });
  if (ev.error) return `⚠️ ${ev.error}`;

  const endTime = ev.startTime && !ev.endTime ? addMinutes(ev.startTime, 60) : ev.endTime;
  const prepDate = ev.prepNote ? ev.prepDate || ev.date : null;
  const doc = {
    title: ev.title,
    date: ev.date,
    startTime: ev.startTime,
    endTime,
    notes: ev.notes || "",
    location: ev.location || "",
    color: PROJECT_COLORS[0],
    repeat: ev.repeat,
    repeatUntil: ev.repeat === "none" ? null : ev.repeatUntil,
    prepNote: ev.prepNote || "",
    prepDate,
    prepTodoId: null,
    createdAt: Date.now(),
    source: "telegram",
  };
  const eventId = await store.add("events", doc);

  let prepLine = "";
  if (ev.prepNote) {
    const projects = await store.list("projects");
    const inbox = await ensureInbox(store, projects);
    const todoId = await store.add("todos", {
      projectId: inbox.id,
      sectionId: null,
      text: prepTodoText(ev.prepNote, ev.title),
      done: false,
      createdAt: Date.now(),
      order: Date.now(),
      doDate: prepDate,
      dueDate: null,
      eventId,
      source: "telegram",
    });
    await store.update("events", eventId, { prepTodoId: todoId });
    prepLine = `\n🧰 准备:${ev.prepNote}\n   → ${prepDate} 已加入待办(${inbox.name})`;
  }

  const when = ev.startTime ? `${ev.date} ${ev.startTime}–${endTime}` : `${ev.date}(全天)`;
  const repeat = ev.repeat !== "none" ? `\n🔁 ${REPEAT_LABEL[ev.repeat]}${doc.repeatUntil ? `,直到 ${doc.repeatUntil}` : ""}` : "";
  return `📅 已添加日程:${ev.title}\n🗓 ${when}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.notes ? `\n📎 ${ev.notes}` : ""}${repeat}${prepLine}`;
}

const MEMORY_LEVEL_NAME = { trivia: "琐碎事情", thought: "思考过的事情", output: "准备输出的事情" };

// Saves to the Notion memory. `photo` = { buffer, mime, filename } or null.
export async function handleMemory({ memory, level, body, photo, ref }) {
  if (!body && !photo) return "请在后面写下内容,或者直接发一张照片。";
  const res = await memory.save({ level, text: body, photo, entryRef: ref });
  const lines = [`🧠 已存入记忆库 · ${MEMORY_LEVEL_NAME[level]}`, `📌 ${res.page.title}`];
  if (res.tags.length) lines.push(`🏷 ${res.tags.map((t) => `#${t}`).join(" ")}`);
  if (photo) lines.push(res.photoSaved ? "📷 照片已保存到 Notion" : `⚠️ 照片没能保存(${res.photoError})`);
  if (res.vision?.text) lines.push(`🔤 照片里的字:${res.vision.text.replace(/\s+/g, " ").slice(0, 120)}`);
  return lines.join("\n");
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

// Saves what the bot is holding on to (the last photo or message that was NOT saved) after the user
// says "save this into notion" (or note / think / output on their own).
export async function handleSavePending({ store, memory, loadPhoto, level, ref }) {
  const pending = await store.takePending();
  if (!pending) return "现在没有等待保存的内容。先发一条消息或一张照片,再回复 save this into notion。";
  const lv = level || pending.level || "trivia";
  if (pending.type === "photo") {
    const photo = await loadPhoto(pending.fileId);
    return handleMemory({ memory, level: lv, body: pending.caption || "", photo, ref });
  }
  return handleMemory({ memory, level: lv, body: pending.text, photo: null, ref });
}

// NOTION RULES
//   saved to Notion:  note / think / output / idea / entry   (and anything the user explicitly
//                     tells to "save this into notion", including a photo sent on its own later)
//   never saved:      ask (questions), todo, event, and a bare photo/message until asked
// Questions can READ the calendar and to-dos (Firestore) as well as the Notion notes.
// `photo` = { fileId } (downloaded only if it is actually saved, via `loadPhoto(fileId)`).
export async function handleMessage({ store, llm, memory, text, photo = null, loadPhoto, ref = null, now = new Date() }) {
  const notion = detectNotionSave(text);
  const message = notion.wants ? notion.text : (text || "").trim();
  const { kind, body } = parseCommand(message);
  const isMemory = kind === "trivia" || kind === "thought" || kind === "output";

  if (kind === "help") return HELP_TEXT;

  if (photo) {
    if (kind && !isMemory) return "照片目前只能配合 note / think / output 保存。发照片后回复 save this into notion 也可以。";
    if (isMemory || notion.wants) {
      const file = await loadPhoto(photo.fileId);
      return handleMemory({ memory, level: kind || "trivia", body: kind ? body : message, photo: file, ref });
    }
    await store.setPending({ type: "photo", fileId: photo.fileId, caption: message, at: Date.now() });
    return "📷 收到照片了,但还没有存到 Notion。\n要存的话回复:save this into notion\n(或回复 note / think / output 来指定层级)";
  }

  // "save this into notion" on its own, or note/think/output with nothing after it.
  if ((notion.wants && !message) || (isMemory && !body)) {
    return handleSavePending({ store, memory, loadPhoto, level: isMemory ? kind : null, ref });
  }

  switch (kind) {
    case "todo": return handleTodo({ store, llm, body, now }); // to-dos live in the app, never in Notion
    case "entry": return handleEntry({ store, llm, body, isIdea: false });
    case "idea": return handleEntry({ store, llm, body, isIdea: true });
    case "event": return handleEvent({ store, llm, body, now });
    case "trivia":
    case "thought":
    case "output": return handleMemory({ memory, level: kind, body, photo: null, ref });
    case "ask": return handleAsk({ store, memory, body, now });
    case "remind": return handleRemind({ store, llm, body, now });
    case "reminders": return handleReminders({ store });
    case "cancel": return handleCancel({ store, body });
    default:
      // "鸡饭 RM8.50, save this into notion": the instruction is in the message itself.
      if (notion.wants) return handleMemory({ memory, level: "trivia", body: message, photo: null, ref });
      // Otherwise it is a question. Remember it only in case the next message says "save this into notion".
      await store.setPending({ type: "text", text: message, at: Date.now() });
      return handleAsk({ store, memory, body: message, now });
  }
}
