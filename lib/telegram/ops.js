import { INBOX_NAME, INBOX_COLOR, PROJECT_COLORS, findInboxProject, prepTodoText, addMinutes } from "../inbox.js";

// Data operations shared by the chat commands and the AI assistant, so both create things in
// exactly the same shape the website expects.

export async function createProject(store, projects, name, color) {
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

export async function ensureInbox(store, projects) {
  return findInboxProject(projects) || createProject(store, projects, INBOX_NAME, INBOX_COLOR);
}

// Creates a calendar event (plus the one-off "prepare" to-do when there is a prepare note and no
// repeating day-before notice). `ev` = parsed event fields. Returns what was created.
export async function createEvent(store, ev, source = "telegram") {
  const endTime = ev.startTime && !ev.endTime ? addMinutes(ev.startTime, 60) : ev.endTime || null;
  const prepDate = ev.prepNote ? ev.prepDate || ev.date : null;
  const doc = {
    title: ev.title,
    date: ev.date,
    startTime: ev.startTime || null,
    endTime,
    notes: ev.notes || "",
    location: ev.location || "",
    color: PROJECT_COLORS[0],
    repeat: ev.repeat || "none",
    repeatUntil: !ev.repeat || ev.repeat === "none" ? null : ev.repeatUntil || null,
    prepNote: ev.prepNote || "",
    prepDate,
    remindBeforeDays: ev.remindBeforeDays || 0,
    prepTodoId: null,
    createdAt: Date.now(),
    source,
  };
  const eventId = await store.add("events", doc);

  let prepTodoId = null;
  let inboxName = null;
  // A repeating "remind me N days before" (e.g. a birthday) is sent by the scheduler every time, so it
  // replaces the one-off prepare to-do.
  if (ev.prepNote && !ev.remindBeforeDays) {
    const projects = await store.list("projects");
    const inbox = await ensureInbox(store, projects);
    inboxName = inbox.name;
    prepTodoId = await store.add("todos", {
      projectId: inbox.id,
      sectionId: null,
      text: prepTodoText(ev.prepNote, ev.title),
      done: false,
      createdAt: Date.now(),
      order: Date.now(),
      doDate: prepDate,
      dueDate: null,
      eventId,
      source,
    });
    await store.update("events", eventId, { prepTodoId });
  }
  return { eventId, doc, endTime, prepDate, prepTodoId, inboxName };
}
