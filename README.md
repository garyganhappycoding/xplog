# XPLog 累经簿

记录每天做的事情,按技能累积经验值(XP)和等级,支持自定义技能与等级成就、ROI(时间/精力投入 vs 产出价值)分析、功过格。底部导航标签:待办(项目分组)、日程(月/周/日日历)、计时(NFC 一碰开始计时)、日记(AI 自动判断技能与 XP)、记忆库(Notion 里的笔记,按层级回看 + 提问)、技能成长(雷达图 + 技能列表)。另外可以用 Telegram 机器人随手记录。

## 技术栈

- **Next.js 16**(App Router)+ React 19
- **Firebase**(Google 登录 + Firestore 实时数据库 + Storage 图片存储)
- **Groq API**(OpenAI 兼容接口:日记自动打标签、Telegram 机器人的解析/回答/读照片)
- **Notion API**(点亮「💡 想法」的日记条目自动同步到 Notion 的 Idea Vault 数据库)
- **recharts**(XP 曲线图 / 雷达图)
- **lucide-react**(图标)

## 本地开发

1. 安装依赖:

   ```bash
   npm install
   ```

2. 在 [Firebase Console](https://console.firebase.google.com/) 建一个新项目:
   - 打开 **Authentication → Sign-in method**,启用 **Google** 登录
   - 打开 **Firestore Database**,建一个数据库(生产模式)
   - 打开 **Storage**,启用 Storage(用于日记照片上传)
   - 打开 **项目设置 → 你的应用 → Web app**,注册一个 Web App,复制配置

3. 在 [console.groq.com](https://console.groq.com/keys) 申请一个 Groq API key(用于日记自动打标签和 Telegram 机器人)。

4. (可选)如果要用「日记点亮 💡 想法自动同步到 Notion Idea Vault」功能:
   - 去 [notion.so/my-integrations](https://www.notion.so/my-integrations) 建一个 internal integration,复制它的 secret(以 `ntn_` 或 `secret_` 开头)。
   - 打开 Notion 里的 Idea Vault 数据库,右上角 `···` → **Connections**,把刚建的 integration 加进去(不加的话 API 调用会报权限错误)。
   - Idea Vault 的 data source ID 就是 `0becc330-4e93-4c07-9bfe-880c15d4de6b`(已经在共享给 Claude 的 workspace 里确认过)。

5. 复制 `.env.local.example` 为 `.env.local`,填入配置:

   ```bash
   cp .env.local.example .env.local
   ```

   填入类似:

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   GROQ_API_KEY=gsk_...
   NOTION_API_KEY=ntn_...
   NOTION_IDEA_VAULT_DATA_SOURCE_ID=0becc330-4e93-4c07-9bfe-880c15d4de6b
   ```

   Notion 这两项留空也没关系,只是点亮「💡 想法」不会同步过去,其它功能不受影响。

6. 把 `firestore.rules` 的内容贴到 Firebase Console 的 **Firestore Database → 规则**,把 `storage.rules` 的内容贴到 **Storage → 规则**,分别发布(确保每个用户只能读写自己 uid 底下的数据)。

7. 启动开发服务器:

   ```bash
   npm run dev
   ```

   打开 http://localhost:3000,用 Google 账号登录即可开始使用。

## 部署到 Vercel

1. 把这个项目推上 GitHub(见下方"推上 GitHub"步骤)。
2. 打开 [vercel.com](https://vercel.com),用 GitHub 账号登录,点 **New Project**,选择这个仓库,Vercel 会自动识别 Next.js 项目。
3. 在 Vercel 的 **Environment Variables** 里,把 `.env.local` 里的 6 个 `NEXT_PUBLIC_FIREBASE_*` 变量、`GROQ_API_KEY`,以及(如果用了 Notion 同步)`NOTION_API_KEY` 和 `NOTION_IDEA_VAULT_DATA_SOURCE_ID` 原样加进去。
4. 点 **Deploy**,几分钟后会拿到一个 `xxx.vercel.app` 的网址。
5. 回到 Firebase Console → Authentication → Settings → **Authorized domains**,把这个 Vercel 网址加进去(否则 Google 登录会报错)。

## 推上 GitHub

```bash
cd xplog
git init
git add .
git commit -m "XPLog v1"
git branch -M main
git remote add origin https://github.com/你的用户名/xplog.git
git push -u origin main
```

## 项目结构

```
app/
  layout.js              根布局,挂载 AuthProvider / AppShell
  page.js                根路径重定向到 /todo
  globals.css            暗金账本主题的全局样式
  api/tag-entry/route.js 日记自动打标签(调用 Groq API)
  api/sync-idea/route.js 把点亮「💡 想法」的日记同步到 Notion Idea Vault
  todo/page.js            待办(项目分组)
  diary/page.js           日记(AI 自动打标签)
  skills/page.js          技能成长(雷达图 + 技能列表)
  entry/page.js           详细记录表单(时间/精力/产出价值,ROI 用)
  skill/[id]/page.js      技能详情页
  reflections/page.js     反省回顾页(未接入底部导航,可直接访问)
  merit/page.js           功过格页(未接入底部导航,可直接访问)
components/
  AppShell.js             顶部栏 + 底部导航 + 登录门槛
  CreateSkillForm.js      新建技能表单(entry 页与 skills 页共用)
  EmojiPicker.js          技能图标选择器
  ui.js                   Pill / ProgressBar / LevelUpSeal / ConfirmDialog 共用组件
context/
  AuthContext.js          Google 登录状态
lib/
  firebase.js             Firebase 初始化(Auth / Firestore / Storage)
  useCollection.js        Firestore 实时集合 hook(增删改查)
  xp.js                   等级曲线、XP 计算等共用逻辑
```

## 数据结构(Firestore)

所有数据都存在 `users/{uid}/...` 底下,只有本人能读写:

- `users/{uid}/skills/{skillId}` — `{ name, nameEn, hasValue, milestones: [5条], totalXp }`
- `users/{uid}/entries/{entryId}` — `{ skillId, result, time, effort, value, reflection, xpGained, createdAt }`
- `users/{uid}/merits/{meritId}` — `{ type: "merit" | "demerit", text, createdAt }`
- `users/{uid}/projects/{projectId}` — `{ name, color?, createdAt, order }`
- `users/{uid}/todos/{todoId}` — `{ projectId, text, done, createdAt, dueDate? }`
- `users/{uid}/diaryEntries/{entryId}` — `{ text, photoUrl?, tags: [], isIdea, skill, skillId, xpDelta, aiTagged, confidence, createdAt, notionPageId? }`

## Notion 同步(Idea Vault)

日记条目有一个独立于标签和技能的「💡 想法」开关(写日记时或每条记录下方都有),点亮后会自动在 Notion 的 **Idea Vault** 数据库里创建一条记录:

- `Name` = 日记开头前 80 字
- `Notes` = 完整日记正文
- `Status` = `Inbox`(走 Idea Vault 原本的 Inbox → Reviewed → Organized 流程)
- `Skill` = 这篇日记被打上的技能(新加的字段,multi-select 类型;技能名第一次出现时会自动变成新选项)
- `XPLog ID` = 日记的 Firestore 文档 ID(新加的字段,防止重复同步)
- `Screenshot` = 日记照片(如果有)

只在第一次点亮「想法」时同步一次(记录在 `diaryEntries.notionPageId` 上),之后编辑日记正文、技能或关掉想法开关都不会再更新/删除 Notion 那边的记录。没配置 `NOTION_API_KEY` / `NOTION_IDEA_VAULT_DATA_SOURCE_ID` 的话,点亮「想法」就只是本地标记,不会报错也不会同步。

## Telegram 机器人 + 记忆库(RAG)

分工:**Telegram = 输入/聊天界面**,**Notion = 数据库**,**网站 = 回看的界面**。

在 Telegram 里给机器人发消息(`/help` 查看示例):

| 发送 | 去哪里 |
| --- | --- |
| `note: …` | 记忆库 · **琐碎事情**,存进 Notion(可带照片) |
| `think: …` | 记忆库 · **思考过的事情**,存进 Notion |
| `output: …` | 记忆库 · **准备输出的事情**,存进 Notion |
| `idea: …` | 日记(💡想法,带技能和 XP)**+ 存进 Notion**(思考过的事情) |
| `entry: …`(可带 `#标签`) | 日记(AI 判断技能并加 XP)**+ 存进 Notion**(琐碎事情) |
| `todo` + 每行一个任务,可写 `(categorize under 项目名)` | 只进网站待办,**不存 Notion**(没写分类的进「收件箱」项目;分类不存在会自动新建) |
| `event: …`(日期、时间、地点、要提前准备什么) | 只进网站日程,**不存 Notion**;「准备事项」自动变成一条待办 |
| `ask: …`,或直接问一句话 | 提问,**什么都不保存**。同时查 Notion 笔记 + 日程 + 待办(例如「鸡饭多少钱」「明天有什么安排」「Daily 项目还有什么没做」) |
| 只发一张**照片** | 不会保存。机器人先记着,你再回 `save this into notion`(或 `note` / `think` / `output`)才存;在照片说明里写 `note:` 等则直接存 |

**保存规则**:`note` / `think` / `output` / `idea` / `entry` 会存进 Notion;`ask` / `todo` / `event` 不会。其他消息想存进 Notion,在句子里加上 `save this into notion`(或「存到 notion」)。网站上的「记忆库 → 记一条」按钮和日记的 💡 开关是你自己点的操作,所以会写入。`/help` 里有同样的说明。

**提问会查哪些数据**:Notion 笔记、网站里的日程(包括重复事件,会展开到具体日期)和待办(都在 Firebase 的 Firestore 里)。先判断问题涉及哪些来源和哪段日期(今天/明天/本周/下周/具体日期),再只用查到的内容回答;日程或待办查过但是空的,会如实回答「那段时间没有安排」,而不是说没有答案。

**记忆库**就是你的 Notion **Idea Vault**,新增了一列 `Level`(琐碎事情 / 思考过的事情 / 准备输出的事情)。琐碎事情不会出现在 Idea Vault 的 Inbox/Reviewed/Organized 流程里。照片上传到 Notion;配置了 Groq 时会读出照片里的文字(价格牌、菜单等),之后也能被搜到。

**检索(RAG)**:提问 → Groq 把问题变成关键词(含中/英/马来语同义词)→ 用 Notion 数据库查询取回相关记录 → Groq 只根据这些记录回答并标注来源。没配置 Groq 时退回到「列出匹配的记录」。这里没有向量数据库,个人规模的笔记用关键词检索足够。

### 一次性设置

1. **创建机器人**:在 Telegram 里找 `@BotFather` → `/newbot` → 拿到 token。
2. **Firebase 服务账号**(机器人要写你的 Firestore):Firebase 控制台 → 项目设置 → 服务账号 → 生成新的私钥,得到一个 JSON 文件。**不要提交到 Git**。
3. **Vercel 环境变量**(Settings → Environment Variables,改完要重新部署):

```
TELEGRAM_BOT_TOKEN=            # BotFather 给的 token
TELEGRAM_WEBHOOK_SECRET=       # 自己随便编一串长随机字符
TELEGRAM_ALLOWED_CHAT_ID=      # 先留空,见第 5 步
FIREBASE_SERVICE_ACCOUNT=      # 把第 2 步 JSON 文件的全部内容粘贴进来
XPLOG_OWNER_EMAIL=             # 你登录 XPLog 用的 Google 邮箱
XPLOG_TIMEZONE=Asia/Kuala_Lumpur
GROQ_API_KEY=                  # Groq(解析待办/日程、日记打标签、回答问题、读照片)
```

   `NOTION_API_KEY` 和 `NOTION_IDEA_VAULT_DATA_SOURCE_ID` 沿用现有的。
4. **注册 webhook**(在本机 `.env.local` 里也放好 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`):

```bash
npm run telegram:webhook -- https://你的域名.vercel.app
```

5. 给机器人发任意一条消息,它会回复你的 **chat id**;把它填进 `TELEGRAM_ALLOWED_CHAT_ID` 并重新部署。之后只有你的账号能用这个机器人。
6. (只需一次,已经跑过的话可以跳过)给 Notion Idea Vault 加 `Level` 列:`npm run notion:levels`。

访问 `https://你的域名.vercel.app/api/telegram` 可以看到各项配置是否到位(只显示 true/false,不显示内容)。

自测机器人逻辑(不需要 Firebase / Telegram / Groq):`npm run test:telegram`。

### 网站上的「记忆库」页

按层级筛选、搜索、提问、手动记一条、把一条移到另一个层级、删除(移到 Notion 回收站)。这个页面的接口需要登录,并且只允许上面配置的 `XPLOG_OWNER_EMAIL` 账号访问。

## 提醒:机器人主动给你发消息

机器人会在这三种情况下主动发 Telegram 消息:

1. **你设的提醒**:`remind: tomorrow 3pm call mum`、`remind me in 30 minutes to take the laundry out`、`提醒 明天下午3点 开会`。
   `reminders` 查看还没发的提醒,`cancel 2` 取消第 2 个。
2. **日程快开始了**:有具体时间的日程(包括重复事件),开始前 30 分钟提醒一次,带上地点和「需要准备」的事项。
3. **每天早上的总结**:今天的日程、今天要做/今天截止的待办,以及已逾期的待办(当天没有任何内容就不发)。

网页服务器不能自己「醒来」,所以需要一个定时器去访问 `/api/cron/reminders`,它会把到点的提醒发出去(每条消息都会先「认领」,所以重复访问也不会重复发送)。

**一次性设置**

1. 在 Vercel 加环境变量 `CRON_SECRET`(自己编一串长随机字符),重新部署。可选:`REMINDER_EVENT_MINUTES`(默认 30)、`DIGEST_HOUR`(默认 8,即早上 8 点,用 `XPLOG_TIMEZONE` 的时区)。
2. **每天早上总结**:`vercel.json` 里已经配好每天一次的 Vercel Cron(UTC 00:00 = 马来西亚 08:00)。Vercel 免费版(Hobby)只允许每天一次,并且可能晚到一小时以内。
3. **想要准点的日程提醒和你设的提醒**,需要更频繁地访问。免费办法:在 [cron-job.org](https://cron-job.org) 建一个任务,每 5 分钟访问 `https://你的域名.vercel.app/api/cron/reminders`,并加请求头 `Authorization: Bearer 你的CRON_SECRET`。(Vercel Pro 也可以直接把 `vercel.json` 里的计划改成 `*/5 * * * *`。)

访问频率决定提醒的准时程度:每 5 分钟访问一次,提醒最多晚 5 分钟。如果只用每天一次的 Vercel Cron,「你设的提醒」要等到下一次访问才会发出。

## 日程里的地点和「提前准备」

事件可以填「地点」和「需要提前准备什么」+「什么时候准备」。保存时会在「收件箱」项目里生成一条关联的待办(计划日期 = 准备日期),在待办页和日程里都能看到;修改或删除事件时,这条待办会同步更新/删除。

## NFC 计时(计时页)

每个 NFC 标签里存一个链接 `…/track?tag=…`。用手机碰标签就会打开 XPLog,开始记录你在做的事:

- 碰同一个标签再碰一次 = 结束;碰另一个标签 = 结束上一件、开始这一件。
- 开始/结束时会弹出通知(先在计时页点一次「开启通知」授权)。通知里有「结束计时」按钮。
- 计时页可以建标签、复制链接,或在 **Android 的 Chrome** 里直接「写入标签」(Web NFC);也可以用 NFC Tools 之类的 App 把复制的链接写进标签。**请在已部署的网址上操作**,标签里存的就是当前网址。
- 记录存在 Firestore 的 `timeLogs`,标签在 `nfcTags`。
