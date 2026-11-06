# XPLog

管好你的生活:**日程 + 待办 + 倒出箱 + 日记**,手机优先,界面像 Google 日历一样简单。Telegram 机器人负责随手倒出和提醒,Notion 只收你整理过的东西。

底部五个标签:

| 标签 | 做什么 |
| --- | --- |
| **今天** | 今天的时间线(日程 + 待办时间块)、今天和逾期的待办、倒出箱里还有几条没整理 |
| **日历** | 日 / 3 天 / 周 / 月 / 日程 五种视图,点空白处新建,待办设了时间就变成时间块;和 Google 日历双向同步 |
| **待办** | Todoist 式看板(项目 → 分区 → 任务) |
| **倒出** | 想到什么先丢进来(文字、链接、照片、语音);再放进文件夹整理 |
| **日记** | 自由书写,每一篇自动存进 Notion Idea Vault |

## 数据怎么流动

```
Telegram / 网页 ──倒出──▶ 倒出箱(只在 App 里,不碰 Notion)
                              │  你在 App 里放进文件夹
        ┌───────┬───────┬─────┼───────┬────────┬─────────────┐
      待办     日程     日记   想法    笔记      链接       自己的文件夹
        │       │       │      └───────┴────────┘             │
   变成待办  变成日程  存进日记      存进 Notion               只放在 App 里
                      +Notion       (App 里仍然保留,方便回看)
```

- **Telegram 发来的东西只放进倒出箱**。只有你在 App 里把它放进「想法 / 笔记 / 链接 / 日记」,才会存进 Notion;存进去之后 App 里还留着一份。
- 机器人本身**不会**写 Notion(`/api/telegram` 里没有这个能力),它只读 Notion 来回答问题。
- 每晚 22:30(设置里可改)机器人会提醒你睡前整理;倒出箱是空的就不打扰。

## 技术栈

Next.js 16(App Router)· React 19 · Firebase(Google 登录 + Firestore + Storage)· Groq(解析、回答、语音转文字)· Notion API · Google Calendar API · Vercel。

## 本地开发

```bash
npm install
cp .env.local.example .env.local   # 然后填写
npm run dev                        # http://localhost:3000
```

没有任何配置也能看界面:打开 `http://localhost:3000/?demo=1`(假数据,不登录,不保存)。

1. [Firebase Console](https://console.firebase.google.com/):新建项目 → 启用 **Authentication → Google**、**Firestore**、**Storage**;在「项目设置 → 你的应用」注册 Web App,把配置填进 `NEXT_PUBLIC_FIREBASE_*`。
2. 把 `firestore.rules` 贴到 **Firestore → 规则**,`storage.rules` 贴到 **Storage → 规则**,发布。
3. [console.groq.com](https://console.groq.com/keys) 申请 `GROQ_API_KEY`(解析待办/日程、回答问题、读照片、**语音转文字**)。
4. Notion:在 [notion.so/my-integrations](https://www.notion.so/my-integrations) 建 integration,把 secret 填进 `NOTION_API_KEY`;在 Idea Vault 数据库右上角 `···` → **Connections** 加上它;`NOTION_IDEA_VAULT_DATA_SOURCE_ID` 填数据库的 data source ID。
   第一次同步时,App 会自动给数据库的 `Level` 列补上「链接」「日记」两个选项(也可以手动跑 `npm run notion:levels`)。

## 部署到 Vercel(手机上用)

1. 代码推上 GitHub,在 [vercel.com](https://vercel.com) 导入仓库(自动识别 Next.js)。
2. 把 `.env.local.example` 里的变量都加到 Vercel 的 **Environment Variables**(改完要重新部署)。
3. Firebase Console → Authentication → Settings → **Authorized domains** 加上你的 `xxx.vercel.app`。
4. **装到手机桌面**:手机浏览器打开你的网址并登录 →
   - Android(Chrome):右上角 ⋮ →「安装应用」/「添加到主屏幕」
   - iPhone(Safari):分享按钮 →「添加到主屏幕」
   之后像普通 App 一样全屏打开。

## Telegram 机器人

### 发什么、去哪里

| 你发的 | 去哪里 |
| --- | --- |
| 文字 / 想法 / 一句话 | 倒出箱(AI 建议放哪个文件夹) |
| 链接 | 倒出箱(自动取网页标题) |
| 照片(可带说明) | 倒出箱 |
| 语音 | 倒出箱(Groq Whisper 转成文字,录音也留着可以回听) |
| `dump:` / `idea:` / `note:` / `entry:` … | 倒出箱,并预选文件夹(想法 / 笔记 / 日记) |
| `todo` / `event:` / `remind:` | 直接生成待办 / 日程 / 提醒 |
| `ask:`、直接问一句话 | 回答(查 Notion 笔记 + 日程 + 待办),不保存任何东西 |
| `web:` | 上网搜索并标明来源 |
| 「刚才那个待办移到 blabla」等 | AI 助手查和改你的待办/日程/提醒,可以撤销 |

没有命令词的消息,AI 先判断是「该留着的东西」(倒出箱)、「问题」(回答),还是「让我改什么」(AI 助手)。没配置 Groq 时,一律先放进倒出箱,不会丢。

### 一次性设置

1. **创建机器人**:Telegram 里找 `@BotFather` → `/newbot` → 拿到 token。
2. **Firebase 服务账号**:Firebase 控制台 → 项目设置 → 服务账号 → 生成新的私钥(JSON,**不要提交到 Git**)。
3. **Vercel 环境变量**:

```
TELEGRAM_BOT_TOKEN=            # BotFather 给的 token
TELEGRAM_WEBHOOK_SECRET=       # 自己编一串长随机字符
TELEGRAM_ALLOWED_CHAT_ID=      # 先留空,见第 5 步
FIREBASE_SERVICE_ACCOUNT=      # 第 2 步 JSON 文件的全部内容
XPLOG_OWNER_EMAIL=             # 你登录 XPLog 用的 Google 邮箱
XPLOG_TIMEZONE=Asia/Kuala_Lumpur
GROQ_API_KEY=
```

4. **注册 webhook**(本机 `.env.local` 里也要有 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`):

```bash
npm run telegram:webhook -- https://你的域名.vercel.app
```

5. 给机器人发任意消息,它回复你的 **chat id**;填进 `TELEGRAM_ALLOWED_CHAT_ID` 并重新部署。之后只有你能用。

访问 `https://你的域名.vercel.app/api/telegram` 可以看各项配置是否到位(只显示 true/false)。App 的「设置」页也会显示 Notion / Telegram / Google 是否已连接。

## 提醒(机器人主动给你发消息)

- 你设的提醒(`remind: tomorrow 3pm call mum`)
- 日程开始前 30 分钟(含地点和需要准备的事)
- 每天早上的总结(今天的日程 / 待办 / 逾期)
- 日程的「提前 N 天提醒」(生日、周年:每年重复 + 前一天提醒)
- **每晚 22:30 的睡前整理**(倒出箱里还有几条;时间和开关在 App 设置里,存在 Firestore 的 `settings/app`)

网页服务器不会自己醒来,需要一个定时器访问 `/api/cron/reminders`(每条消息会先「认领」,重复访问不会重复发送)。

1. Vercel 加 `CRON_SECRET`(长随机字符),重新部署。可选:`REMINDER_EVENT_MINUTES`(默认 30)、`DIGEST_HOUR`(默认 8)、`APP_URL`(睡前提醒里的链接,默认 `https://xplog.vercel.app`)。
2. 每天一次的 Vercel Cron 已在 `vercel.json` 里配好(免费版只能每天一次)。
3. **要准点(尤其是 22:30 睡前提醒和日程提醒)**:在 [cron-job.org](https://cron-job.org) 建任务,**每 5 分钟**访问 `https://你的域名.vercel.app/api/cron/reminders`,请求头 `Authorization: Bearer 你的CRON_SECRET`。
   这个定时任务同时会把 Google 日历里的改动同步进来(App 关着也行)。

## Google 日历双向同步

App 里的**日程**和**有日期又有时间的待办(时间块)**会出现在你的 Google 日历(待办标注「待办 · XPLog」,完成后标题前加 ✓);在 Google 日历里新建/修改/删除的日程也会同步回 App。两边同时改了同一条,以 App 为准。

**一次性设置(需要自己建一个 Google OAuth 客户端,免费):**

1. 打开 [Google Cloud Console](https://console.cloud.google.com/),选(或新建)一个项目。
2. **API 和服务 → 库**,搜索并启用 **Google Calendar API**。
3. **API 和服务 → OAuth 同意屏幕**:用户类型选「外部」,填应用名称和你的邮箱;**范围**加上 `.../auth/calendar.events`;**测试用户**加上你自己的 Google 邮箱。
   > 应用处于「测试」状态时,Google 会让授权每 **7 天**过期一次,需要在设置页重新点「连接」。想一直有效:在同意屏幕点「发布应用」(只有你自己用,不需要审核,登录时点「高级 → 继续」即可)。
4. **凭据 → 创建凭据 → OAuth 客户端 ID → 应用类型:Web 应用**。「已获授权的重定向 URI」添加:
   - `https://你的域名.vercel.app/api/google/callback`
   - (本地开发再加)`http://localhost:3000/api/google/callback`
5. 把客户端 ID 和密钥填进 Vercel(并重新部署):`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。
6. 在 App 里:**今天 → 右上角设置 → Google 日历 → 连接**,在 Google 页面点允许。第一次会把已有的日程发过去、把 Google 里的日程收进来(每次最多发 80 条,没发完的下一次接着发)。

已知限制:Google 里复杂的重复规则(每两周、一周几天)会只收进来一条;重复日程里被单独改过的那几次会被忽略;跨多天的日程只显示在第一天。刷新令牌只存在服务器上(Firestore 的 `integrations` 集合,浏览器读不到)。

## 数据结构(Firestore,`users/{uid}/…`)

| 集合 | 字段 |
| --- | --- |
| `projects` / `sections` | 待办看板:`name, color, order` / `projectId, name, order` |
| `todos` | `projectId, sectionId, text, done, order, doDate, dueDate, startTime, endTime`(有 `doDate`+`startTime` 就是时间块) |
| `events` | `title, date, startTime, endTime, location, notes, color, repeat, repeatUntil, remindBeforeDays` |
| `dumps` | `kind(text/link/photo/voice), source(web/telegram), text, url, photoUrl/tgFileId, audioUrl, seconds, status(new/sorted), suggested, folder, sortedAt, notionPageId, notionState` |
| `dumpFolders` | 自己建的文件夹:`name, color, order`(系统文件夹:待办/日程/日记/想法/笔记/链接) |
| `diaryEntries` | `text, createdAt, notionPageId, notionState` |
| `settings/app` | `bedtime("22:30"), bedtimeOn` |
| `reminders`, `telegramState/*`, `reminderLog` | 机器人用 |

## 测试

```bash
npm run test:telegram   # 机器人 + 倒出箱 + Notion 规则 + 睡前提醒(不需要 Firebase/Telegram/Groq)
npm run test:google     # Google 日历双向同步(用假的 Google)
npm run lint
npm run build
```
