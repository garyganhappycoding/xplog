// Routes an incoming Telegram message by its first word.
//   "todo\nbuy milk\ncall mum (under Home)"   "entry: had a great day"   "event: dentist 25 Oct 3pm"
//   "note: chicken rice RM8.50"   "ask: price of chicken rice"
// A leading "/" and "@botname" are accepted too (so the slash-command menu works).
const LATIN = "todos?|entry|diary|event|idea|note|save|think|thought|output|ask|remind(?:ers?)?|cancel";
const CJK_LONG = "待办|日记|日程|事件|想法|琐碎|思考|输出|提醒"; // fine without a separator: 待办买牛奶
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
  // reminders (the bot messages you first when they come due)
  remind: "remind", reminder: "remind", 提醒: "remind", reminders: "reminders", cancel: "cancel",
};

// Nothing goes into Notion unless you say so. These phrases count as saying so:
//   "save this into notion", "save to notion", "put it in notion", "存到 notion", "保存到Notion"...
const NOTION_PHRASE = new RegExp(
  String.raw`\b(?:please\s+)?(?:save|store|put|add|sync|send)\s+(?:this|it|that)?\s*(?:in|into|to|on)\s+notion\b|(?:保存|存进|存到|存入|存|同步|放)(?:到|进|入)?\s*notion`,
  "i"
);

// -> { wants: true, text: <message without the phrase> } or { wants: false, text }
export function detectNotionSave(text) {
  const t = text || "";
  if (!NOTION_PHRASE.test(t)) return { wants: false, text: t.trim() };
  const rest = t.replace(NOTION_PHRASE, "").replace(/^[\s,，;；.。:：-]+|[\s,，;；.。:：-]+$/g, "").trim();
  return { wants: true, text: rest };
}

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
Telegram = 输入 · Notion = 数据库 · 网站 = 回看

━━ 保存规则 ━━
✅ 会存进 Notion:note · think · output · idea · entry
❌ 不会存进 Notion:ask(提问)· todo · event
   (todo 和 event 只出现在网站的「待办」「日程」里)

━━ 命令 ━━
📝 note: 鸡饭 RM8.50 @Kedai Ali
   → 琐碎事情,存进 Notion(可以带照片)
💭 think: 为什么我总是拖延
   → 思考过的事情,存进 Notion
📤 output: 做一期关于拖延的视频
   → 准备输出的事情,存进 Notion
💡 idea: 做一个读书笔记的小程序
   → 日记里的想法(技能+XP)+ 存进 Notion(思考过的事情)
📔 entry: 今天练了 30 分钟演讲 #演讲
   → 日记(自动判断技能、加 XP,#标签变话题标签)+ 存进 Notion(琐碎事情)

☑️ todo(一行一个,最后可指定分类)
todo
买牛奶
交报告 周五前
(categorize under 学校)
   → 只进网站待办,不存 Notion

📅 event: 25 Oct 下午3点 牙医 @Klinik Sentosa
要提前一天带保险卡
   → 只进网站日程,不存 Notion;「准备事项」会变成一条待办

🔎 ask: 提问,什么都不会保存
   会同时查:Notion 笔记 + 日程 + 待办
   例:ask: 鸡饭多少钱
       ask: 明天有什么安排
       ask: 这周有哪些待办
   (不写 ask,直接问一句话也可以)
   没有答案时会直接说「我没有答案」,并列出相关记录供参考。
   回答格式:1 总结 · 2 详细 · 3 来源 · 4 后续决策

⏰ remind: 到时间机器人会主动发消息提醒你
   remind: tomorrow 3pm call mum
   remind me in 30 minutes to take the laundry out
   提醒 明天下午3点 开会
   reminders → 看看还有哪些提醒;cancel 2 → 取消第 2 个
   另外会自动提醒:日程开始前 30 分钟,以及每天早上的「今日日程+待办」

📷 照片:在说明里写 note: / think: / output: 就会存。
   只发照片不会保存,机器人先记着,再回 save this into notion(或 note / think / output)才存。
💬 其他消息想存进 Notion,在句子里加上 save this into notion。`;
