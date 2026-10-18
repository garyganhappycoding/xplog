// Shared between the website and the Telegram bot (plain JS, no browser/server deps).

// Tasks that arrive without a category (and event "prepare" tasks) land in this project.
export const INBOX_NAME = "收件箱";
export const INBOX_COLOR = "#92897A";
export const PROJECT_COLORS = ["#C9A24B", "#5C8A72", "#A23B3B", "#7A8AC9", "#92897A", "#B07AA1", "#D08C5A"];

const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-·.,，。]+/g, "");

export const findInboxProject = (projects) =>
  projects.find((p) => norm(p.name) === norm(INBOX_NAME) || norm(p.name) === "inbox") || null;

// Exact match ignoring case/spacing/punctuation. (Loose substring matching would file
// "Home" tasks into "Homework".)
export const matchProject = (projects, name) => {
  const key = norm(name);
  return key ? projects.find((p) => norm(p.name) === key) || null : null;
};

// The to-do generated for an event's "what to prepare" note.
export const prepTodoText = (prepNote, eventTitle) => `准备:${prepNote} · ${eventTitle}`;

export const addMinutes = (hhmm, minutes) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
