// Routes an incoming Telegram message by its first word.
//   "todo\nbuy milk\ncall mum (under Home)"   "entry: had a great day"   "event: dentist 25 Oct 3pm"
//   "note: chicken rice RM8.50"   "ask: price of chicken rice"
// A leading "/" and "@botname" are accepted too (so the slash-command menu works).
const LATIN = "todos?|entry|diary|event|idea|note|save|think|thought|output|ask";
const CJK_LONG = "待办|日记|日程|事件|想法|琐碎|思考|输出"; // fine without a separator: 待办买牛奶
const CJK_ONE = "记|问|查|搜"; // too common inside sentences ("记得…"), so these need "记:" or "记 "
const RE = new RegExp(
  `^\\s*\\/?(?:(${LATIN})(?:@\\w+)?(?=[\\s:：]|$)|(${CJK_LONG})|(${CJK_ONE})(?=[\\s:：]|$))\\s*[:：]?\\s*([\\s\\S]*)$`,
  "i"
);

const KIND = {
  todo: "todo", todos: "todo", 待办: "todo",
  entry: "entry", diary: "entry", 日记: "entry",
  event: "event", 日程: "event", 事件: "event",
  idea: "idea", 想法: "idea",
  // memory levels (see lib/server/memory.js)
  note: "trivia", save: "trivia", 记: "trivia", 琐碎: "trivia",
  think: "thought", thought: "thought", 思考: "thought",
  output: "output", 输出: "output",
  ask: "ask", 问: "ask", 查: "ask", 搜: "ask",
};

export function parseCommand(text) {
  const t = (text || "").trim();
  if (/^\/(start|help)(@\w+)?\s*$/i.test(t) || /^(help|帮助)\s*$/i.test(t)) return { kind: "help", body: "" };
  const m = t.match(RE);
  if (!m) return { kind: null, body: t };
  return { kind: KIND[(m[1] || m[2] || m[3]).toLowerCase()], body: (m[4] || "").trim() };
}

// "#book #idea some text" -> { text: "some text", tags: ["book", "idea"] }
export function extractTags(body) {
  const tags = [];
  const text = body
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, sp, tag) => {
      if (!tags.includes(tag)) tags.push(tag);
      return sp;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, tags };
}

export const HELP_TEXT = `XPLog 机器人 🤖
Telegram 负责输入,Notion 是数据库,网站「记忆库」负责回看。

📝 待办 — 一条消息写多个,最后可指定分类
todo
买牛奶
交报告 周五前
(categorize under 学校)

📔 日记 — 自动判断技能并加 XP,#标签 变成话题标签
entry: 今天练了 30 分钟演讲 #演讲

📅 日程 — 写上时间、地点,以及要提前准备什么
event: 25 Oct 下午3点 牙医 @Klinik Sentosa
要提前一天带保险卡
(准备事项会自动变成一条待办)

🧠 记忆库 — 分三个层级,方便之后回看(可以直接发照片!)
note: 鸡饭 RM8.50 @Kedai Ali      → 琐碎事情
think: 为什么我总是拖延          → 思考过的事情
output: 做一期关于拖延的视频      → 准备输出的事情
💡 idea: 同 think,并带上技能,用于 IG 流程
📷 发一张价格牌/食物的照片(可加文字说明)= 存为琐碎事情,照片里的字也能被搜到

🔎 提问 — 从记忆库里找答案
ask: 鸡饭多少钱
(不写关键词、直接问也可以)`;
