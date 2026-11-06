// Demo mode: open any page with ?demo=1 to click through the app with made-up data (nothing is
// saved anywhere, and no login is needed). Used to review the design before it is wired to real data.
import { addDays, toKey } from "./date.js";

const today = () => new Date();
const day = (offset) => toKey(addDays(today(), offset));
const minsAgo = (m) => Date.now() - m * 60000;

// Google Calendar's own palette
export const COLORS = {
  tomato: "#d50000", flamingo: "#e67c73", tangerine: "#f4511e", banana: "#f6bf26", sage: "#33b679",
  basil: "#0b8043", peacock: "#039be5", blueberry: "#3f51b5", lavender: "#7986cb", grape: "#8e24aa", graphite: "#616161",
};

function seed() {
  const projects = [
    { id: "p-study", name: "学业", color: COLORS.blueberry, order: 3 },
    { id: "p-life", name: "生活", color: COLORS.sage, order: 2 },
    { id: "p-proj", name: "项目", color: COLORS.tangerine, order: 1 },
    { id: "p-inbox", name: "收件箱", color: COLORS.graphite, order: 0 },
  ];
  const sections = [
    { id: "s1", projectId: "p-study", name: "本周要做", order: 0 },
    { id: "s2", projectId: "p-study", name: "进行中", order: 1 },
    { id: "s3", projectId: "p-study", name: "等回复", order: 2 },
    { id: "s4", projectId: "p-life", name: "今天", order: 0 },
    { id: "s5", projectId: "p-life", name: "以后", order: 1 },
    { id: "s6", projectId: "p-proj", name: "想法", order: 0 },
    { id: "s7", projectId: "p-proj", name: "做着", order: 1 },
  ];
  const t = (id, projectId, sectionId, text, extra = {}) => ({ id, projectId, sectionId, text, done: false, createdAt: minsAgo(500), order: Number(id.slice(1)), doDate: null, dueDate: null, startTime: null, endTime: null, ...extra });
  const todos = [
    t("t1", "p-study", "s1", "3912 海报终稿", { dueDate: day(0), doDate: day(0), startTime: "15:30", endTime: "17:00" }),
    t("t2", "p-study", "s1", "回复 Dr. Lim 的邮件", { doDate: day(0) }),
    t("t3", "p-study", "s1", "113 小组作业交稿", { dueDate: day(7) }),
    t("t4", "p-study", "s2", "读《Die With Zero》第 10 章", { doDate: day(1) }),
    t("t5", "p-study", "s2", "HGA 演讲稿", { dueDate: day(2), doDate: day(1), startTime: "10:00", endTime: "11:30" }),
    t("t6", "p-study", "s3", "等导师回复研究题目"),
    t("t7", "p-life", "s4", "买牛奶和鸡蛋", { doDate: day(0) }),
    t("t8", "p-life", "s4", "给妈妈打电话", { doDate: day(0), startTime: "20:00", endTime: "20:30" }),
    t("t9", "p-life", "s4", "交水电费", { dueDate: day(-1) }),
    t("t10", "p-life", "s5", "整理衣柜"),
    t("t11", "p-proj", "s6", "做一个把日程和待办放在一起的小工具"),
    t("t12", "p-proj", "s7", "XPLog 改版", { dueDate: day(10) }),
    t("t13", "p-life", "s4", "洗衣服", { done: true, doDate: day(0) }),
    t("t14", "p-study", "s1", "整理上周笔记", { done: true }),
    t("t15", "p-inbox", null, "预约牙医"),
  ];
  const e = (id, title, date, startTime, endTime, color, extra = {}) => ({ id, title, date, startTime, endTime, color, location: "", notes: "", repeat: "none", repeatUntil: null, remindBeforeDays: 0, ...extra });
  const events = [
    e("e1", "晨跑", day(0), "07:00", "07:40", COLORS.sage),
    e("e2", "3912 小组讨论", day(0), "10:00", "12:00", COLORS.blueberry, { location: "图书馆 3 楼" }),
    e("e3", "午餐 · 和 Emily", day(0), "12:30", "13:30", COLORS.banana),
    e("e4", "HGA 演讲排练", day(0), "18:30", "19:30", COLORS.tangerine, { location: "B 栋教室" }),
    e("e5", "牙医", day(1), "09:30", "10:30", COLORS.peacock, { location: "Klinik Sentosa", notes: "带保险卡" }),
    e("e6", "3912 海报展示", day(2), "14:00", "15:30", COLORS.tomato, { location: "展览厅" }),
    e("e7", "Mum 的生日", day(3), null, null, COLORS.flamingo, { repeat: "yearly", remindBeforeDays: 1 }),
    e("e8", "HGA 一周 Wellness plan", day(1), null, null, COLORS.basil),
    e("e9", "读书会", day(4), "20:00", "21:30", COLORS.grape),
    e("e10", "113 小组作业 截止", day(7), "12:00", "12:30", COLORS.tomato),
    e("e11", "周会", day(5), "10:00", "11:00", COLORS.lavender),
  ];
  const dumps = [
    { id: "d1", kind: "text", source: "telegram", text: "记得问 Dr. Lim 海报的格式要求,还有下周三要交的东西", createdAt: minsAgo(18), status: "new", suggested: "todo" },
    { id: "d2", kind: "link", source: "web", text: "How to Build a Second Brain — YouTube", url: "https://www.youtube.com/watch?v=second-brain", createdAt: minsAgo(70), status: "new", suggested: "link" },
    { id: "d3", kind: "photo", source: "telegram", text: "Kedai Ali 鸡饭 RM8.50", photoColor: "#f6bf26", createdAt: minsAgo(130), status: "new", suggested: "note" },
    { id: "d4", kind: "voice", source: "telegram", text: "明天下午三点要和导师开会,要带上报告初稿", seconds: 23, createdAt: minsAgo(190), status: "new", suggested: "event" },
    { id: "d5", kind: "text", source: "web", text: "想做一个能同时看日程、待办和日记的 app,界面像 Google 日历那样简单", createdAt: minsAgo(300), status: "new", suggested: "idea" },
    { id: "d6", kind: "text", source: "web", text: "今天心情不错,下午把海报做完了,有点成就感", createdAt: minsAgo(360), status: "new", suggested: "diary" },
    { id: "d7", kind: "text", source: "telegram", text: "买一支新的白板笔", createdAt: minsAgo(1500), status: "sorted", folder: "todo", sortedAt: minsAgo(900), savedTo: "待办 · 生活" },
    { id: "d8", kind: "link", source: "web", text: "Notion API 文档", url: "https://developers.notion.com", createdAt: minsAgo(1600), status: "sorted", folder: "link", sortedAt: minsAgo(900), savedTo: "Notion · 链接" },
    { id: "d9", kind: "text", source: "telegram", text: "为什么我晚上效率比早上高?", createdAt: minsAgo(1700), status: "sorted", folder: "idea", sortedAt: minsAgo(900), savedTo: "Notion · 想法" },
    { id: "d10", kind: "photo", source: "telegram", text: "Kedai Ali 叉烧饭", photoColor: "#e67c73", createdAt: minsAgo(3000), status: "sorted", folder: "f-food", sortedAt: minsAgo(2900) },
    { id: "d11", kind: "link", source: "web", text: "怎么做好 PPT 的一页一个重点", url: "https://example.com/ppt-tips", createdAt: minsAgo(4000), status: "sorted", folder: "f-study", sortedAt: minsAgo(3900) },
    { id: "d12", kind: "text", source: "web", text: "Die With Zero 读书笔记:把体验放在存钱前面", createdAt: minsAgo(5000), status: "sorted", folder: "f-study", sortedAt: minsAgo(4900) },
    { id: "d13", kind: "text", source: "telegram", text: "每个周末试一家新店", createdAt: minsAgo(6000), status: "sorted", folder: "f-food", sortedAt: minsAgo(5900) },
  ];
  const dumpFolders = [
    { id: "f-study", name: "学习资料", color: COLORS.blueberry, order: 1 },
    { id: "f-food", name: "美食记录", color: COLORS.tangerine, order: 2 },
  ];
  const diaryEntries = [
    { id: "n1", text: "今天把 3912 的海报做得差不多了,下午和 Emily 讨论了展示的顺序。有点累,但是很踏实。晚上想早点睡。", createdAt: minsAgo(60 * 3), notionPageId: "demo" },
    { id: "n2", text: "昨天读完了《Die With Zero》第 9 章:不要因为害怕而不敢尝试,也不要鲁莽。想把「勇敢但不愚蠢」写在书桌前。", createdAt: minsAgo(60 * 27), notionPageId: "demo" },
    { id: "n3", text: "周一的汇报还可以。老师说我讲得比之前自然,但是 PPT 文字太多。下次每页只放一个重点。", createdAt: minsAgo(60 * 80), notionPageId: "demo" },
    { id: "n4", text: "没有太多想写的,只是觉得今天过得很平静。", createdAt: minsAgo(60 * 100), notionPageId: null },
  ];
  return { projects, sections, todos, events, dumps, dumpFolders, diaryEntries, settings: [] };
}

let store = null;
const listeners = new Map();
let counter = 0;
const data = () => (store ||= seed());

const emit = (path) => (listeners.get(path) || new Set()).forEach((fn) => fn([...(data()[path] || [])]));

export function demoSubscribe(path, fn) {
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path).add(fn);
  fn([...(data()[path] || [])]);
  return () => listeners.get(path).delete(fn);
}
export function demoAdd(path, doc) {
  const id = `${path}-${Date.now().toString(36)}${counter++}`;
  data()[path] = [...(data()[path] || []), { id, ...doc }];
  emit(path);
  return { id };
}
export function demoSet(path, id, patch) {
  const rows = data()[path] || [];
  data()[path] = rows.some((d) => d.id === id) ? rows.map((d) => (d.id === id ? { ...d, ...patch } : d)) : [...rows, { id, ...patch }];
  emit(path);
}
export function demoUpdate(path, id, patch) {
  data()[path] = (data()[path] || []).map((d) => (d.id === id ? { ...d, ...patch } : d));
  emit(path);
}
export function demoRemove(path, id) {
  data()[path] = (data()[path] || []).filter((d) => d.id !== id);
  emit(path);
}
