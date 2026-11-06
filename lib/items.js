import { addDays, fromKey, occurrenceDates, toKey } from "./date";

export const BLUE = "#1a73e8";
export const stamp = () => Date.now();
export const todayKey = () => toKey(new Date());
export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]; // Sunday-first, like Google Calendar
export const weekdayName = (d) => `星期${WEEKDAYS[d.getDay()]}`;

export const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const plusHour = (hhmm) => fromMin(Math.min(23 * 60 + 59, (toMin(hhmm) ?? 0) + 60));

// Everything that belongs on the calendar between two dates (YYYY-MM-DD, inclusive): events (recurring
// ones expanded) and tasks that have a planned or due date. Tasks with a time are "time blocks".
export function calendarItems(events, todos, projects, from, to) {
  const lo = fromKey(from);
  const hi = fromKey(to);
  const color = Object.fromEntries(projects.map((p) => [p.id, p.color]));
  const out = [];
  for (const e of events) {
    if (!e.date) continue;
    const until = e.repeatUntil ? fromKey(e.repeatUntil) : null;
    for (const d of occurrenceDates(fromKey(e.date), e.repeat, until, lo, hi)) {
      out.push({ id: `${e.id}:${toKey(d)}`, kind: "event", date: toKey(d), title: e.title, startTime: e.startTime || null, endTime: e.endTime || null, color: e.color || BLUE, location: e.location || "", raw: e });
    }
  }
  for (const t of todos) {
    const date = t.doDate || t.dueDate;
    if (!date || date < from || date > to) continue;
    out.push({
      id: `${t.id}:${date}`, kind: "task", date, title: t.text, startTime: t.startTime || null, endTime: t.endTime || (t.startTime ? plusHour(t.startTime) : null),
      color: color[t.projectId] || BLUE, done: !!t.done, due: t.dueDate || null, raw: t,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ? 1 : 0) - (b.startTime ? 1 : 0) || (a.startTime || "").localeCompare(b.startTime || ""));
}

export const groupByDate = (items) => {
  const m = new Map();
  for (const it of items) {
    if (!m.has(it.date)) m.set(it.date, []);
    m.get(it.date).push(it);
  }
  return m;
};

// Where a dump can be sorted into at night. `to` is where it ends up.
export const DUMP_CATEGORIES = [
  { id: "todo", cn: "待办", to: "加到待办", icon: "CheckSquare", color: "#3f51b5" },
  { id: "event", cn: "日程", to: "加到日历", icon: "CalendarPlus", color: "#d50000" },
  { id: "diary", cn: "日记", to: "存进日记 + Notion", icon: "BookOpen", color: "#33b679" },
  { id: "idea", cn: "想法", to: "存进 Notion · 想法", icon: "Lightbulb", color: "#f6bf26" },
  { id: "note", cn: "笔记", to: "存进 Notion · 笔记", icon: "StickyNote", color: "#039be5" },
  { id: "link", cn: "链接", to: "存进 Notion · 链接", icon: "Link2", color: "#8e24aa" },
];
// System folders (above) also send the item somewhere; your own folders just hold things.
export const allFolders = (custom = []) => [
  ...DUMP_CATEGORIES.map((c) => ({ ...c, system: true })),
  ...[...custom].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((f) => ({ id: f.id, cn: f.name, to: "只放在这个文件夹里", icon: "Folder", color: f.color, system: false })),
];
export const categoryName = (id) => DUMP_CATEGORIES.find((c) => c.id === id)?.cn || id;
export const folderOf = (d) => d.folder || d.category || null;

export function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

export const daysBetween = (from, count) => Array.from({ length: count }, (_, i) => addDays(from, i));
