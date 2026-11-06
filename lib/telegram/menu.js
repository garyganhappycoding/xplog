// The button menu shown under the typing box in Telegram, so nothing has to be memorised.
// It is a "reply keyboard": tapping a button sends its label as an ordinary message, which the bot
// recognises here. Tapping a function button explains it, and the NEXT message you send is used for
// that function automatically (one-shot), so you never need to type the command word.

export const BTN = {
  menu: "📋 菜单",
  help: "❓ 帮助",
  back: "🔙 返回",
  cancel: "❌ 取消",
  dump: "📥 倒出",
  todo: "☑️ 待办",
  event: "📅 日程",
  remind: "⏰ 提醒",
  ask: "🔎 提问",
  chat: "🤖 聊天助手",
  web: "🌐 上网搜索",
  // under "提醒"
  setRemind: "⏰ 设置提醒",
  myReminders: "📋 我的提醒",
  // under "提问": one-tap questions
  qToday: "📅 今天的安排",
  qTomorrow: "📅 明天的安排",
  qWeek: "📅 这周的安排",
  qTodos: "☑️ 还没做的待办",
};

export const MAIN_KEYBOARD = [
  [BTN.menu, BTN.help, BTN.chat],
  [BTN.dump, BTN.todo, BTN.event],
  [BTN.remind, BTN.ask, BTN.web],
];
const REMIND_KEYBOARD = [[BTN.setRemind, BTN.myReminders], [BTN.back]];
const ASK_KEYBOARD = [[BTN.qToday, BTN.qTomorrow], [BTN.qWeek, BTN.qTodos], [BTN.back]];
const WAITING_KEYBOARD = [[BTN.cancel, BTN.menu]];

export const ASK_KEYBOARD_EXPORT = ASK_KEYBOARD;
export const ALL_KEYBOARDS = [MAIN_KEYBOARD, REMIND_KEYBOARD, ASK_KEYBOARD, WAITING_KEYBOARD];

const LABEL_TO_ID = Object.fromEntries(Object.entries(BTN).map(([id, label]) => [label, id]));
// "📋 菜单" etc. -> "menu"; anything else -> null
export const menuId = (text) => LABEL_TO_ID[String(text || "").trim()] || null;

export const MENU_OVERVIEW = `📋 菜单 — 点下面的按钮就行,不用记命令:

📥 倒出 → 文字、链接、照片、语音都先放进倒出箱,睡前在 App 里整理(放进想法/笔记/链接/日记才存进 Notion)
   (这些内容不用点按钮,直接发给我也一样)
☑️ 待办 → 记任务,可以指定项目(不存 Notion)
📅 日程 → 记有时间的事,生日/周年会每年提醒(不存 Notion)
⏰ 提醒 → 到时间我会主动发消息提醒你
🔎 提问 → 问你的笔记、日程、待办(不保存任何东西)
🌐 上网搜索 → 查外面世界的信息,会标明来源和链接
🤖 聊天助手 → 直接说人话,我会自己查、自己改(例如「刚才那个待办移到 blabla」)
❓ 帮助 → 完整说明

点一个功能后,下一条消息就会用在那个功能上。点「❌ 取消」可以放弃。`;

// What each function button says, and which function the next message is used for ("mode").
// `keyboard` is what to show next; `mode` (optional) = the command word to apply to the next message.
export const SCREENS = {
  dump: {
    text: "📥 倒出(先放进倒出箱,不会存进 Notion)\n现在发给我任何东西:文字、链接、照片或语音(会转成文字)。\n睡前在 App 里把它们放进文件夹;放进「想法 / 笔记 / 链接 / 日记」才会存进 Notion。",
    mode: "dump",
  },
  todo: {
    text: "☑️ 待办(只进网站待办,不存 Notion)\n现在发给我任务,一行一个。最后一行可以写 (categorize under 项目名) 指定项目,不写就放进「收件箱」。\n例:\n买牛奶\n交报告 周五前\n(categorize under 学校)",
    mode: "todo",
  },
  event: {
    text: "📅 日程(只进网站日程,不存 Notion)\n现在发给我日期、时间、地点,以及要提前准备什么。生日/周年会每年重复,并提前提醒你。\n例:25 Oct 下午3点 牙医 @Klinik Sentosa,要带保险卡\n例:Mum 生日 10月26日,前一天提醒我送祝福",
    mode: "event",
  },
  remind: {
    text: "⏰ 提醒 — 到时间我会主动发消息给你。\n⏰ 设置提醒:告诉我什么时候提醒你什么\n📋 我的提醒:看看还有哪些没发\n(取消:发 cancel 加编号,例如 cancel 1,或直接说「取消那个提醒」)",
    keyboard: REMIND_KEYBOARD,
  },
  setRemind: {
    text: "⏰ 设置提醒\n现在告诉我什么时候提醒你什么。\n例:明天下午3点 打电话给妈妈\n例:30 minutes later take the laundry out",
    mode: "remind",
  },
  ask: {
    text: "🔎 提问(什么都不会保存)\n我会同时查你的 Notion 笔记、日程和待办。点下面的快捷问题,或者直接打字问我。\n例:鸡饭多少钱?\n例:Daily 项目还有什么没做?",
    keyboard: ASK_KEYBOARD,
    mode: "ask",
  },
  web: {
    text: "🌐 上网搜索\n现在发给我要查的内容,我会上网搜,并标明来源和链接。\n例:明天吉隆坡天气\n例:马来西亚大学申请截止日期\n\n回答会分清出处:📒 你的笔记 · 🌐 网络 · 🧠 一般知识(未经核实)。",
    mode: "web",
  },
  chat: {
    text: `🤖 聊天助手 — 直接说人话就行,我会自己查、自己改你的待办、日程和提醒:

「刚才那个待办加错了,移到 blabla 里」
「把买牛奶改成明天截止」
「do that 做完了」
「把牙医改到下午4点半」
「提醒我周五交作业」
「撤销」(撤回我刚做的修改)

删除和取消只有你明确说才会做;我不会直接往 Notion 写东西。每次修改我都会告诉你改了什么。`,
  },
};

// The one-tap questions
export const QUICK_QUESTIONS = {
  qToday: "今天有什么安排?",
  qTomorrow: "明天有什么安排?",
  qWeek: "这周有什么安排?",
  qTodos: "我还有哪些没做的待办?",
};

// How the next message is rewritten for a mode: "鸡饭 RM8.50" + "note" -> "note: 鸡饭 RM8.50"
export const applyMode = (mode, text) => (mode === "todo" ? `todo\n${text}` : `${mode}: ${text}`);
export const MODES_WITH_PHOTO = ["dump"];
export const WAITING_KEYBOARD_FOR = WAITING_KEYBOARD;
