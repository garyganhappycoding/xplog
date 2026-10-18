import {
  INBOX_NAME, INBOX_COLOR, PROJECT_COLORS, findInboxProject, matchProject, prepTodoText, addMinutes,
} from "../inbox.js";
import { parseCommand, extractTags, HELP_TEXT } from "./commands.js";
import { formatAnswer } from "../server/rag.js";

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

export async function handleEntry({ store, llm, body, isIdea = false }) {
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
  if (isIdea) {
    const res = await llm.syncIdea({ text, photoUrl: null, entryId, skill: finalName });
    if (res.pageId) {
      await store.update("diaryEntries", entryId, { notionPageId: res.pageId });
      notionLine = "\n💡 已同步到 Notion Idea Vault";
    } else {
      notionLine = `\n💡 想法已记下,但 Notion 同步失败:${res.error}`;
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

export async function handleAsk({ memory, body }) {
  if (!body) return "请在 ask 后面写下你想查的问题,例如:ask: 鸡饭多少钱";
  return formatAnswer(await memory.ask(body));
}

export async function handleMessage({ store, llm, memory, text, photo = null, ref = null, now = new Date() }) {
  const { kind, body } = parseCommand(text);
  const isMemory = kind === "trivia" || kind === "thought" || kind === "output";

  // A photo is always a memory: use the level named in the caption, default 琐碎事情.
  if (photo) {
    if (kind && !isMemory) return "照片目前只能配合 note / think / output 保存。直接发照片也会存为琐碎事情。";
    return handleMemory({ memory, level: kind || "trivia", body: kind ? body : text, photo, ref });
  }

  switch (kind) {
    case "help": return HELP_TEXT;
    case "todo": return handleTodo({ store, llm, body, now });
    case "entry": return handleEntry({ store, llm, body, isIdea: false });
    case "idea": return handleEntry({ store, llm, body, isIdea: true });
    case "event": return handleEvent({ store, llm, body, now });
    case "trivia":
    case "thought":
    case "output": return handleMemory({ memory, level: kind, body, photo: null, ref });
    case "ask": return handleAsk({ memory, body });
    // No keyword: treat it as a question for the memory.
    default: return handleAsk({ memory, body: text.trim() });
  }
}
