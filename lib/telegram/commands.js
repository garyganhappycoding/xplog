// Routes an incoming Telegram message by its first word.
//   "todo\nbuy milk\ncall mum (under Home)"   "entry: had a great day"   "event: dentist 25 Oct 3pm"
//   "note: chicken rice RM8.50"   "ask: price of chicken rice"
// A leading "/" and "@botname" are accepted too (so the slash-command menu works).
const LATIN = "todos?|dump|entry|diary|event|idea|note|save|think|thought|output|ask|remind(?:ers?)?|cancel|web|search";
const CJK_LONG = "倒出|待办|日记|日程|事件|想法|琐碎|思考|输出|提醒|上网|搜索"; // fine without a separator: 待办买牛奶
const CJK_ONE = "记|问|查|搜"; // too common inside sentences ("记得…"), so these need "记:" or "记 "
const RE = new RegExp(
  `^\\s*\\/?(?:(${LATIN})(?:@\\w+)?(?=[\\s:：]|$)|(${CJK_LONG})|(${CJK_ONE})(?=[\\s:：]|$))\\s*[:：]?\\s*([\\s\\S]*)$`,
  "i"
);

const KIND = {
  todo: "todo", todos: "todo", 待办: "todo",
  // everything below up to "ask" goes into the dump box (with a suggested folder)
  dump: "dump", 倒出: "dump",
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
  // search the internet (the assistant labels what comes from the web)
  web: "web", search: "web", 上网: "web", 搜索: "web",
};

export function parseCommand(text) {
  const t = (text || "").trim();
  if (/^\/help(@\w+)?\s*$/i.test(t) || /^(help|帮助)\s*$/i.test(t)) return { kind: "help", body: "" };
  if (/^\/(start|menu)(@\w+)?\s*$/i.test(t) || /^(menu|菜单)\s*$/i.test(t)) return { kind: "menu", body: "" };
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
Telegram = 随手倒出 · 网站 App = 整理和回看 · Notion = 整理后才存

🔘 不想记命令?点输入框下面的按钮,或发 /menu。

━━ 倒出箱(默认)━━
直接发给我就行,什么都不用写:
📝 文字 · 🔗 链接 · 📷 照片 · 🎙 语音(会自动转成文字)
→ 全部先放进 App 的「倒出箱」,我会建议放哪个文件夹。
→ 睡前(22:30)在 App 里把它们放进文件夹。放进「想法 / 笔记 / 链接 / 日记」才会存进 Notion,放进「待办 / 日程」会变成待办和日程。
(想强调就写 dump: 内容;idea: / note: / entry: 也一样会进倒出箱,只是预选了文件夹)

━━ 直接生效的命令 ━━
☑️ todo(一行一个,最后可指定分类)
todo
买牛奶
交报告 周五前
(categorize under 学校)

📅 event: 25 Oct 下午3点 牙医 @Klinik Sentosa
要提前一天带保险卡
   生日/周年:event: Mum 生日 10月26日,前一天提醒我送祝福
   (也可以直接说人话:「帮我记一下 Mum 的生日是 10月26日」——我会自己判断)

⏰ remind: tomorrow 3pm call mum
   remind me in 30 minutes to take the laundry out
   reminders → 看看还有哪些提醒;cancel 2 → 取消第 2 个
   另外会自动提醒:日程开始前 30 分钟、每天早上的「今日日程+待办」、每晚 22:30 的「睡前整理」

🔎 ask: 提问,什么都不会保存
   会同时查:Notion 笔记 + 日程 + 待办(不写 ask,直接问一句话也可以)
   没有答案时会直接说「我没有答案」。
   回答格式:1 总结 · 2 详细 · 3 来源 · 4 后续决策

🌐 web: 明天吉隆坡天气 —— 我会上网搜,并标明来源和链接

🤖 直接跟我聊天——我会自己查、自己改你的待办、日程和提醒:
   「刚才那个待办加错了,移到 blabla 里」「把牙医改到下午4点半」「撤销」
   安全规则:删除/取消只有你明确说才会做;我不会直接往 Notion 写东西。`;
