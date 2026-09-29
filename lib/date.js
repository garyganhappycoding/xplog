// Small date helpers used by the timetable/calendar views. No external deps.

export const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"]; // Monday-first

const pad2 = (n) => String(n).padStart(2, "0");

export const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const fromKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const addMonths = (d, n) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

export const addWeeks = (d, n) => addDays(d, n * 7);

// Monday-start week.
export const startOfWeek = (d) => {
  const r = new Date(d);
  const dow = (r.getDay() + 6) % 7; // 0 = Monday
  r.setDate(r.getDate() - dow);
  r.setHours(0, 0, 0, 0);
  return r;
};

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

// 42 cells (6 weeks) covering the whole month, Monday-start, so the grid is always full.
export const monthGrid = (d) => {
  const gridStart = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
};

export const weekDays = (d) => {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const minutesOf = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const monthLabel = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月`;

export const dayLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAY_CN[(d.getDay() + 6) % 7]}`;

export const weekRangeLabel = (d) => {
  const days = weekDays(d);
  const a = days[0], b = days[6];
  return a.getMonth() === b.getMonth()
    ? `${a.getMonth() + 1}月${a.getDate()}–${b.getDate()}日`
    : `${a.getMonth() + 1}月${a.getDate()}日 – ${b.getMonth() + 1}月${b.getDate()}日`;
};
